import { deleteApp, getApps, initializeApp, type FirebaseApp } from '@firebase/app';
import { getMessaging, getToken, isSupported, type Messaging } from '@firebase/messaging';
import type { ResolvedWebPushPayload } from './web-push-config';
import { supabase } from './supabase';
import { invokeFunction, type FunctionCallResult } from './functions';

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

export function buildFirebaseConfig(input: {
  api_key?: string;
  auth_domain?: string;
  project_id?: string;
  storage_bucket?: string;
  sender_id?: string;
  app_id?: string;
}): FirebaseWebConfig | null {
  if (!input.api_key || !input.project_id || !input.sender_id || !input.app_id) return null;
  return {
    apiKey: input.api_key,
    authDomain: input.auth_domain ?? `${input.project_id}.firebaseapp.com`,
    projectId: input.project_id,
    storageBucket: input.storage_bucket ?? `${input.project_id}.appspot.com`,
    messagingSenderId: input.sender_id,
    appId: input.app_id,
  };
}

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  return messaging;
}

export async function initFirebase(config: FirebaseWebConfig) {
  const supported = await isSupported();
  if (!supported) throw new Error('Web Push is not supported in this browser');

  for (const existing of getApps()) {
    await deleteApp(existing);
  }
  app = null;
  messaging = null;

  app = initializeApp(config);
  messaging = getMessaging(app);
  return messaging;
}

export async function requestFcmToken(vapidPublicKey: string): Promise<string> {
  if (!messaging) throw new Error('Firebase not initialized');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: vapidPublicKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) throw new Error('Failed to obtain FCM token');
  return token;
}

/** Register FCM token directly in database (works without Edge Functions) */
export async function registerPushSubscription(
  fcmToken: string,
  tenantId: string,
  environment: string,
) {
  const { data, error } = await supabase
    .from('web_push_subscribers')
    .upsert(
      {
        tenant_id: tenantId,
        environment,
        fcm_token: fcmToken,
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other',
        os: navigator.platform,
        device: 'desktop',
        permission_status: Notification.permission,
        subscription_status: 'active',
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,environment,fcm_token' },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to save subscription: ${error.message}`);
  return { success: true, subscriber: data };
}

export type WebPushEnqueueResult = {
  queued: number;
  devices: number;
  excluded: number;
  duplicate: number;
  capped: number;
  no_subscription: number;
  daily_cap?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Queue a Web Push for these customers (D-022). Nothing is sent from the browser: the
 * server resolves every active device of each customer, skips exclusions, enforces the
 * daily fair-use cap and sends via push-worker with retries. The same idempotencyKey
 * never sends twice to the same device, so retries and double clicks are safe.
 */
export async function enqueueWebPush(input: {
  tenantId: string;
  environment: string;
  customerIds: string[];
  idempotencyKey: string;
  content: {
    title: string;
    body: string;
    clickAction?: string;
    iconUrl?: string;
    imageUrl?: string;
    badgeUrl?: string;
    tag?: string;
    ttlSeconds?: number;
    actions?: ResolvedWebPushPayload['actions'];
    trackOpens?: boolean;
  };
  journeyId?: string;
  deliveryId?: string;
  deliveryName?: string;
}): Promise<WebPushEnqueueResult> {
  const ids = [...new Set(input.customerIds.filter((id) => UUID_RE.test(id)))];
  const total: WebPushEnqueueResult = { queued: 0, devices: 0, excluded: 0, duplicate: 0, capped: 0, no_subscription: 0 };
  const c = input.content;
  const content = {
    title: c.title,
    body: c.body,
    click_url: c.clickAction,
    icon_url: c.iconUrl,
    image_url: c.imageUrl,
    badge_url: c.badgeUrl,
    tag: c.tag,
    ttl_seconds: c.ttlSeconds,
    actions: c.actions,
    track_clicks: c.trackOpens !== false,
  };
  const journeyId = input.journeyId && UUID_RE.test(input.journeyId) ? input.journeyId : null;
  for (let i = 0; i < ids.length; i += 5000) {
    const { data, error } = await supabase.rpc('enqueue_web_push', {
      p_tenant_id: input.tenantId,
      p_environment: input.environment,
      p_customer_ids: ids.slice(i, i + 5000),
      p_content: content,
      p_idempotency_key: input.idempotencyKey.slice(0, 200),
      p_journey_id: journeyId,
      p_delivery_id: input.deliveryId ?? null,
      p_delivery_name: input.deliveryName ?? null,
    });
    if (error) throw new Error(`Could not queue web push: ${error.message}`);
    const r = (data ?? {}) as Partial<WebPushEnqueueResult>;
    total.queued += r.queued ?? 0;
    total.devices += r.devices ?? 0;
    total.excluded += r.excluded ?? 0;
    total.duplicate += r.duplicate ?? 0;
    total.capped += r.capped ?? 0;
    total.no_subscription += r.no_subscription ?? 0;
    total.daily_cap = r.daily_cap ?? total.daily_cap;
  }
  return total;
}

/** One-line summary for run logs / toasts. */
export function describeEnqueue(r: WebPushEnqueueResult): string {
  const parts = [`${r.queued} push${r.queued === 1 ? '' : 'es'} queued`];
  if (r.duplicate) parts.push(`${r.duplicate} already sent`);
  if (r.no_subscription) parts.push(`${r.no_subscription} without a subscription`);
  if (r.excluded) parts.push(`${r.excluded} excluded`);
  if (r.capped) parts.push(`${r.capped} over the daily limit`);
  return parts.join(' · ');
}

export type ChannelSendResponse = {
  success?: boolean;
  status?: string;
  error?: string;
  message?: string;
  checks?: Array<{ label: string; ok: boolean; detail?: string }>;
  latency_ms?: number;
};

export type WebPushConnectionCheck = { label: string; ok: boolean; detail?: string };

export type WebPushConnectionTestResult = {
  ok: boolean;
  status: 'delivered' | 'connected' | 'failed';
  message: string;
  checks: WebPushConnectionCheck[];
  latencyMs?: number;
};

/** Require a real FCM delivery — never treat sandbox or skipped sends as success. */
export function assertChannelSendDelivered(
  result: FunctionCallResult<ChannelSendResponse>,
  context = 'Push send',
): ChannelSendResponse {
  if (!result.ok) {
    throw new Error(result.error ?? `${context}: channel-send request failed`);
  }

  const data = result.data;
  if (data?.status !== 'delivered' || data.success !== true) {
    throw new Error(data?.error ?? `${context}: FCM did not deliver (status: ${data?.status ?? 'unknown'})`);
  }

  return data;
}

/** Server-side connection test: validates service account with Google OAuth, optionally sends to a device token. */
export async function testWebPushConnection(
  tenantId: string,
  environment: string,
  fcmToken?: string,
  providerId?: string,
): Promise<WebPushConnectionTestResult> {
  const result = await invokeFunction<ChannelSendResponse>('channel-send', {
    action: 'test_connection',
    tenant_id: tenantId,
    environment,
    provider_id: providerId,
    fcm_token: fcmToken,
    title: 'Marbee Test Push',
    body: 'Web Push via Firebase FCM HTTP v1 is working!',
    click_action: typeof window !== 'undefined' ? window.location.origin : '/',
    app_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
  });

  const data = result.data;
  const checks = data?.checks ?? [];

  if (!result.ok && !data) {
    return {
      ok: false,
      status: 'failed',
      message: result.error ?? 'Could not reach channel-send Edge Function',
      checks,
    };
  }

  const status = (data?.status ?? 'failed') as WebPushConnectionTestResult['status'];
  const ok =
    status === 'delivered' ||
    (status === 'connected' && !fcmToken && data?.success === true);

  return {
    ok,
    status,
    message:
      data?.error ??
      data?.message ??
      (status === 'delivered'
        ? 'Test notification delivered via FCM'
        : status === 'connected'
          ? 'Server credentials verified with Google'
          : 'Connection test failed'),
    checks,
    latencyMs: data?.latency_ms,
  };
}

/** Send test push via channel-send Edge Function (requires deploy) */
export async function sendTestPush(
  fcmToken: string,
  tenantId: string,
  environment: string,
  providerId?: string,
) {
  const delivery = await testWebPushConnection(tenantId, environment, fcmToken, providerId);
  if (!delivery.ok || delivery.status !== 'delivered') {
    throw new Error(delivery.message);
  }
  return delivery;
}

export type PushTestResult = {
  fcmToken: string;
  registered: boolean;
  sent: boolean;
  message: string;
  checks: WebPushConnectionCheck[];
};

export async function runPushTest(
  webConfig: FirebaseWebConfig,
  vapidPublicKey: string,
  tenantId: string,
  environment: string,
): Promise<PushTestResult> {
  const checks: WebPushConnectionCheck[] = [];

  const serverTest = await testWebPushConnection(tenantId, environment);
  checks.push(...serverTest.checks);
  if (!serverTest.ok) {
    return { fcmToken: '', registered: false, sent: false, message: serverTest.message, checks };
  }

  await initFirebase(webConfig);

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'FIREBASE_CONFIG', config: webConfig });

  let fcmToken: string;
  try {
    fcmToken = await requestFcmToken(vapidPublicKey);
    await registerPushSubscription(fcmToken, tenantId, environment);
    checks.push({
      label: 'Browser FCM registration',
      ok: true,
      detail: 'Device token obtained from Firebase using your Web API key and VAPID key',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Registration failed';
    checks.push({ label: 'Browser FCM registration', ok: false, detail });
    return { fcmToken: '', registered: false, sent: false, message: detail, checks };
  }

  try {
    const delivery = await testWebPushConnection(tenantId, environment, fcmToken);
    checks.push(...delivery.checks.filter((c) => c.label === 'FCM message delivery'));
    if (!delivery.ok || delivery.status !== 'delivered') {
      return { fcmToken, registered: true, sent: false, message: delivery.message, checks };
    }

    return {
      fcmToken,
      registered: true,
      sent: true,
      message: 'Connection verified — test notification delivered via FCM.',
      checks,
    };
  } catch (sendErr) {
    const msg = sendErr instanceof Error ? sendErr.message : 'Send failed';
    return { fcmToken, registered: true, sent: false, message: msg, checks };
  }
}
