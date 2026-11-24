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

export type WebPushTarget = {
  fcm_token: string;
  customer_id: string | null;
};

/** Resolve FCM tokens for campaign audience (subscriber id, customer id, or unlinked test devices). */
export async function resolveWebPushTargets(
  tenantId: string,
  environment: string,
  audienceIds: string[],
): Promise<WebPushTarget[]> {
  if (!audienceIds.length) return [];

  const { data: subs, error } = await supabase
    .from('web_push_subscribers')
    .select('id, fcm_token, customer_id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('subscription_status', 'active');

  if (error) throw new Error(`Failed to load push subscribers: ${error.message}`);

  const idSet = new Set(audienceIds);
  const seen = new Set<string>();
  const targets: WebPushTarget[] = [];

  const add = (row: WebPushTarget) => {
    if (seen.has(row.fcm_token)) return;
    seen.add(row.fcm_token);
    targets.push(row);
  };

  for (const sub of subs ?? []) {
    if (idSet.has(sub.id) || (sub.customer_id && idSet.has(sub.customer_id))) {
      add({ fcm_token: sub.fcm_token, customer_id: sub.customer_id });
    }
  }

  // Test Push registers tokens without customer_id — use them when audience has no linked match.
  if (!targets.length) {
    for (const sub of subs ?? []) {
      if (!sub.customer_id) {
        add({ fcm_token: sub.fcm_token, customer_id: null });
      }
    }
  }

  return targets;
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

/** Deliver web push to resolved subscribers via channel-send (same path as Settings → Test Push). */
export async function sendWebPushToSubscribers(input: {
  tenantId: string;
  environment: string;
  providerId?: string;
  targets: WebPushTarget[];
  title: string;
  body: string;
  clickAction?: string;
  journeyId?: string;
  deliveryId?: string;
  deliveryName?: string;
  iconUrl?: string;
  imageUrl?: string;
  badgeUrl?: string;
  tag?: string;
  ttlSeconds?: number;
  actions?: ResolvedWebPushPayload['actions'];
  trackOpens?: boolean;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const target of input.targets) {
    const result = await invokeFunction<ChannelSendResponse>('channel-send', {
      fcm_token: target.fcm_token,
      customer_id: target.customer_id ?? undefined,
      tenant_id: input.tenantId,
      environment: input.environment,
      provider_id: input.providerId,
      title: input.title,
      body: input.body,
      click_action: input.clickAction ?? (typeof window !== 'undefined' ? window.location.origin : '/'),
      app_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      journey_id: input.journeyId,
      delivery_id: input.deliveryId,
      delivery_name: input.deliveryName,
      icon_url: input.iconUrl,
      image_url: input.imageUrl,
      badge_url: input.badgeUrl,
      tag: input.tag,
      ttl_seconds: input.ttlSeconds,
      actions: input.actions,
      track_opens: input.trackOpens ?? true,
    });

    try {
      assertChannelSendDelivered(result, 'Campaign web push');
      sent += 1;
    } catch (err) {
      failed += 1;
      errors.push(err instanceof Error ? err.message : 'channel-send failed');
    }
  }

  return { sent, failed, errors };
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
