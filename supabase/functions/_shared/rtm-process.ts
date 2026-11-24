// Real-Time Messages — the processing pipeline.
// One entry point: processMessage(supabase, messageId). Runs match → resolve →
// render → guardrails → send → track, writing the full trace back to rtm_messages.
//
// Invoked two ways:
//   • rtm-ingest via EdgeRuntime.waitUntil() right after returning 202
//   • rtm-worker over HTTP for replay / retry

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  evalFilters, renderContent, nowIso,
  type Filter,
} from './rtm.ts';

type Json = Record<string, unknown>;

type Step = { state: string; at: string; detail?: string };

const CREDITS: Record<string, number> = { web_push: 0, sms: 1, email: 0, whatsapp: 1, rcs: 1 };

export async function processMessage(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { data: msg } = await supabase
    .from('rtm_messages').select('*').eq('message_id', messageId).maybeSingle();
  if (!msg) return;

  const history: Step[] = Array.isArray(msg.state_history) ? [...msg.state_history] : [];
  const trace = (state: string, detail?: string) => history.push({ state, at: nowIso(), detail });

  // terminal helper — one write, full trace
  const finish = async (fields: Json) => {
    await supabase.from('rtm_messages').update({
      state_history: history,
      attempts: (msg.attempts ?? 0) + 1,
      terminal_at: nowIso(),
      ...fields,
    }).eq('id', msg.id);
  };

  try {
    // ---- 1. Match: load the active definition ------------------------------
    let def = null as Json | null;
    if (msg.definition_id) {
      const { data } = await supabase.from('rtm_definitions').select('*').eq('id', msg.definition_id).maybeSingle();
      def = data;
    }
    if (!def) {
      const { data } = await supabase.from('rtm_definitions').select('*')
        .eq('tenant_id', msg.tenant_id).eq('environment', msg.environment)
        .eq('event_type', msg.event_type).eq('status', 'active')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      def = data;
    }
    if (!def) {
      trace('no_match', `No active real-time message for event "${msg.event_type}"`);
      await finish({ status: 'no_match', reason_code: 'no_match' });
      return;
    }
    if (def.status !== 'active') {
      trace('skipped', `Definition is ${def.status}`);
      await finish({ status: 'skipped', reason_code: 'definition_inactive', definition_id: def.id });
      return;
    }
    trace('matched', `Matched "${def.name}"`);

    // ---- 2. Resolve recipient -------------------------------------------------
    const recipient = (msg.recipient ?? {}) as Json;
    let customer: Json | null = null;
    if (recipient.customer_id) {
      const { data } = await supabase.from('customers').select('id, email, mobile, first_name, last_name, consent, location, status')
        .eq('tenant_id', msg.tenant_id).eq('environment', msg.environment)
        .eq('id', recipient.customer_id).is('deleted_at', null).maybeSingle();
      customer = data;
    }
    if (!customer && (recipient.email || recipient.phone)) {
      let q = supabase.from('customers').select('id, email, mobile, first_name, last_name, consent, location, status')
        .eq('tenant_id', msg.tenant_id).eq('environment', msg.environment).is('deleted_at', null);
      // TD-17: stored emails are lower-case (sql/92), so look up the same way.
      q = recipient.email ? q.eq('email', String(recipient.email).trim().toLowerCase()) : q.eq('mobile', recipient.phone);
      const { data } = await q.limit(1).maybeSingle();
      customer = data;
    }

    const customerCtx: Json = customer
      ? {
          id: customer.id, email: customer.email, mobile: customer.mobile,
          first_name: customer.first_name, last_name: customer.last_name,
          full_name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
        }
      : {
          email: recipient.email ?? null, mobile: recipient.phone ?? null,
        };

    const renderCtx = {
      data: (msg.payload ?? {}) as Json,
      customer: customerCtx,
      env: { tenant_id: msg.tenant_id, environment: msg.environment },
    };

    // ---- 3. Filters --------------------------------------------------------
    const filters = (def.filters ?? []) as Filter[];
    if (!evalFilters(filters, renderCtx)) {
      trace('skipped', 'Payload did not match the trigger filters');
      await finish({ status: 'skipped', reason_code: 'filter_no_match', definition_id: def.id, resolved_customer_id: customer?.id ?? null });
      return;
    }

    // ---- 4. Channel + template ------------------------------------------------
    const channel = String(msg.channel && msg.channel !== 'auto' ? msg.channel : def.default_channel);
    const locale = msg.locale || 'default';

    if (channel !== 'web_push') {
      // SMS / email / WhatsApp adapters land in P2 — logged, never silent.
      trace('skipped', `Channel "${channel}" adapter is not available yet (P2)`);
      await finish({ status: 'skipped', reason_code: 'channel_unsupported', channel, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
      return;
    }

    let { data: tpl } = await supabase.from('rtm_templates').select('*')
      .eq('definition_id', def.id).eq('channel', channel).eq('locale', locale).maybeSingle();
    if (!tpl && locale !== 'default') {
      const fb = await supabase.from('rtm_templates').select('*')
        .eq('definition_id', def.id).eq('channel', channel).eq('locale', 'default').maybeSingle();
      tpl = fb.data;
    }
    if (!tpl) {
      trace('skipped', `No ${channel} template`);
      await finish({ status: 'skipped', reason_code: 'no_template', channel, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
      return;
    }

    // ---- 5. Guardrails ----------------------------------------------------
    const guard = (def.guardrails ?? {}) as Json;
    const isTransactional = def.is_transactional !== false;

    // 5a. suppression / exclusion
    if (customer?.id) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: excl } = await supabase.from('exclusions').select('id, source')
        .eq('tenant_id', msg.tenant_id).eq('customer_id', customer.id)
        .or(`channel.eq.${channel},channel.is.null`)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .limit(1).maybeSingle();
      if (excl) {
        const hardOptOut = ['regulatory', 'unsubscribe'].includes(String(excl.source));
        if (hardOptOut || !isTransactional) {
          trace('suppressed', `On the exclusion list (${excl.source ?? 'manual'})`);
          await bumpUsage(supabase, msg, def.id, channel, 'suppressed');
          await finish({ status: 'suppressed', reason_code: 'excluded', channel, definition_id: def.id, resolved_customer_id: customer.id });
          return;
        }
        trace('matched', 'Marketing exclusion bypassed — definition is transactional');
      }
    }

    // 5b. consent (non-transactional only)
    if (!isTransactional && guard.require_consent && customer) {
      const consent = (customer.consent ?? {}) as Json;
      if (!consent[channel] && !consent.marketing) {
        trace('suppressed', 'No channel consent on the customer profile');
        await bumpUsage(supabase, msg, def.id, channel, 'suppressed');
        await finish({ status: 'suppressed', reason_code: 'no_consent', channel, definition_id: def.id, resolved_customer_id: customer.id });
        return;
      }
    }

    // 5c. dedupe window
    const dedupe = guard.dedupe as { keys?: string[]; window_seconds?: number } | undefined;
    if (dedupe?.keys?.length && (dedupe.window_seconds ?? 0) > 0) {
      const sig = dedupe.keys.map((k) => `${k}=${JSON.stringify((msg.payload as Json)?.[k])}`).join('|');
      const since = new Date(Date.now() - dedupe.window_seconds! * 1000).toISOString();
      const { data: dupes } = await supabase.from('rtm_messages').select('id, payload')
        .eq('tenant_id', msg.tenant_id).eq('definition_id', def.id)
        .in('status', ['sent', 'delivered'])
        .gte('received_at', since).neq('id', msg.id).limit(50);
      const hit = (dupes ?? []).some((d) =>
        dedupe.keys!.map((k) => `${k}=${JSON.stringify((d.payload as Json)?.[k])}`).join('|') === sig);
      if (hit) {
        trace('skipped', `Deduped — same ${dedupe.keys.join(', ')} within ${dedupe.window_seconds}s`);
        await finish({ status: 'skipped', reason_code: 'deduped', channel, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
        return;
      }
    }

    // 5d. per-recipient rate limit
    const rate = guard.rate_per_recipient as { max?: number; window_seconds?: number } | undefined;
    if (customer?.id && rate?.max && (rate.window_seconds ?? 0) > 0) {
      const since = new Date(Date.now() - rate.window_seconds! * 1000).toISOString();
      const { count } = await supabase.from('rtm_messages').select('id', { count: 'exact', head: true })
        .eq('tenant_id', msg.tenant_id).eq('definition_id', def.id)
        .eq('resolved_customer_id', customer.id)
        .in('status', ['sent', 'delivered']).gte('received_at', since);
      if ((count ?? 0) >= rate.max) {
        trace('skipped', `Rate limit — ${count} sent in the last ${rate.window_seconds}s (max ${rate.max})`);
        await finish({ status: 'skipped', reason_code: 'rate_limited', channel, definition_id: def.id, resolved_customer_id: customer.id });
        return;
      }
    }

    // 5e. daily spend cap
    const cap = Number(guard.spend_cap_credits_per_day ?? 0);
    if (cap > 0) {
      const { data: usage } = await supabase.from('rtm_usage_daily').select('credits')
        .eq('tenant_id', msg.tenant_id).eq('environment', msg.environment)
        .eq('definition_id', def.id).eq('day', new Date().toISOString().slice(0, 10));
      const spent = (usage ?? []).reduce((s, r) => s + Number(r.credits ?? 0), 0);
      if (spent >= cap) {
        trace('skipped', `Daily spend cap reached (${spent}/${cap} credits)`);
        await finish({ status: 'skipped', reason_code: 'spend_cap', channel, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
        return;
      }
    }

    // ---- 6. Render ------------------------------------------------------------
    const { rendered, missing } = renderContent((tpl.content ?? {}) as Json, renderCtx);
    if (missing.length) {
      const policy = tpl.missing_var_policy ?? 'fallback';
      if (policy === 'fail') {
        trace('failed', `Missing variables: ${missing.join(', ')}`);
        await bumpUsage(supabase, msg, def.id, channel, 'failed');
        await finish({ status: 'failed', reason_code: 'missing_variables', error_detail: missing.join(', '), channel, rendered, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
        return;
      }
      if (policy === 'skip') {
        trace('skipped', `Missing variables: ${missing.join(', ')}`);
        await finish({ status: 'skipped', reason_code: 'missing_variables', error_detail: missing.join(', '), channel, rendered, definition_id: def.id, resolved_customer_id: customer?.id ?? null });
        return;
      }
      trace('rendered', `Rendered with fallbacks for: ${missing.join(', ')}`);
    } else {
      trace('rendered', 'Template rendered');
    }

    // ---- 7. Send (web push via the existing channel-send function) ---------
    const buttons = Array.isArray(rendered.buttons) ? rendered.buttons as Array<Json> : [];
    const sendBody = {
      action: 'send',
      tenant_id: msg.tenant_id,
      environment: msg.environment,
      customer_id: customer?.id ?? recipient.customer_id ?? null,
      fcm_token: recipient.push_token ?? undefined,
      title: rendered.title ?? '',
      body: rendered.body ?? '',
      icon_url: rendered.icon_url || undefined,
      image_url: rendered.image_url || undefined,
      click_action: rendered.click_url || undefined,
      actions: buttons.slice(0, 2).map((b) => ({ title: String(b.title ?? 'Open'), url: String(b.url ?? '') })),
      track_opens: true,
      data: { rtm_message_id: msg.message_id, definition: String(def.slug) },
    };

    if (!sendBody.customer_id && !sendBody.fcm_token) {
      trace('failed', 'No push subscription and no push_token on the recipient');
      await bumpUsage(supabase, msg, def.id, channel, 'failed');
      await finish({ status: 'failed', reason_code: 'no_endpoint', channel, rendered, definition_id: def.id });
      return;
    }

    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/channel-send`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'x-tenant-id': String(msg.tenant_id),
        'x-environment': String(msg.environment),
      },
      body: JSON.stringify(sendBody),
    });
    const result = await resp.json().catch(() => ({}));

    const delivered = resp.ok && (result.status === 'delivered' || result.success === true);
    const credits = CREDITS[channel] ?? 0;

    if (delivered) {
      trace('sent', 'Provider (Firebase FCM) accepted the message');
      trace('delivered', 'Delivered to device');
      await bumpUsage(supabase, msg, def.id, channel, 'sent');
      await bumpUsage(supabase, msg, def.id, channel, 'delivered', credits);
      await finish({
        status: 'delivered', channel, rendered, provider: 'firebase',
        provider_message_id: result.message_id ?? null, cost_credits: credits,
        sent_at: nowIso(), definition_id: def.id, resolved_customer_id: customer?.id ?? null,
        reason_code: null, error_detail: null,
      });
      return;
    }

    trace('failed', String(result.error ?? `Provider returned ${resp.status}`));
    await bumpUsage(supabase, msg, def.id, channel, 'failed');
    await finish({
      status: 'failed', channel, rendered, provider: 'firebase',
      reason_code: 'provider_error', error_detail: String(result.error ?? `HTTP ${resp.status}`),
      definition_id: def.id, resolved_customer_id: customer?.id ?? null,
    });
  } catch (err) {
    trace('failed', err instanceof Error ? err.message : 'Unhandled error');
    await finish({ status: 'failed', reason_code: 'engine_error', error_detail: err instanceof Error ? err.message : String(err) });
  }
}

async function bumpUsage(
  supabase: SupabaseClient, msg: Json, definitionId: string,
  channel: string, metric: string, credits = 0,
): Promise<void> {
  await supabase.rpc('rtm_bump_usage', {
    p_tenant_id: msg.tenant_id, p_environment: msg.environment,
    p_definition_id: definitionId, p_channel: channel, p_metric: metric, p_credits: credits,
  });
}
