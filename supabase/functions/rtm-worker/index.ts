// Real-Time Messages — worker / replay endpoint.
//
//   POST /functions/v1/rtm-worker  { "message_id": "msg_..." }
//   POST /functions/v1/rtm-worker  { "message_ids": ["msg_...", ...] }   (max 100)
//
// Re-runs the processing pipeline for a message — used by the console's
// dead-letter "Replay" action and by a future retry scheduler. Auth: the
// service role key, or a Supabase user JWT whose account belongs to the
// message's tenant.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { processMessage } from '../_shared/rtm-process.ts';
import { nowIso } from '../_shared/rtm.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function service(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = service();
  const auth = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
  const isService = auth && auth === (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '__none__');

  let userId: string | null = null;
  if (!isService) {
    const { data } = await supabase.auth.getUser(auth);
    userId = data?.user?.id ?? null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Body must be valid JSON' }, 400); }

  const ids = Array.isArray(body.message_ids)
    ? (body.message_ids as unknown[]).map(String).slice(0, 100)
    : body.message_id ? [String(body.message_id)] : [];
  if (!ids.length) return json({ error: 'message_id or message_ids is required' }, 422);

  const results: Array<{ message_id: string; status: string }> = [];

  for (const messageId of ids) {
    const { data: msg } = await supabase.from('rtm_messages')
      .select('id, tenant_id, status, state_history').eq('message_id', messageId).maybeSingle();
    if (!msg) { results.push({ message_id: messageId, status: 'not_found' }); continue; }

    if (userId) {
      const { data: member } = await supabase.from('tenant_users')
        .select('tenant_id').eq('user_id', userId).eq('tenant_id', msg.tenant_id).maybeSingle();
      if (!member) { results.push({ message_id: messageId, status: 'forbidden' }); continue; }
    }

    const history = Array.isArray(msg.state_history) ? msg.state_history : [];
    history.push({ state: 'accepted', at: nowIso(), detail: 'Replayed' });
    await supabase.from('rtm_messages').update({
      status: 'accepted', state_history: history,
      reason_code: null, error_detail: null, terminal_at: null, sent_at: null,
    }).eq('id', msg.id);

    await processMessage(supabase, messageId);
    const { data: final } = await supabase.from('rtm_messages').select('status').eq('message_id', messageId).maybeSingle();
    results.push({ message_id: messageId, status: final?.status ?? 'unknown' });
  }

  return json({ replayed: results.length, results });
});
