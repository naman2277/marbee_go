import {
  initFirebase,
  registerPushSubscription,
  requestFcmToken,
  testWebPushConnection,
  type FirebaseWebConfig,
  type WebPushConnectionCheck,
} from './firebase-push';
import type { WebPushBehaviorConfig, WebPushRuntimeConfig } from './web-push-config';
import { fetchWebPushRuntimeConfig } from './web-push-config';

const SUBSCRIBED_KEY = 'marbee_push_subscribed';
const PROMPT_DISMISSED_KEY = 'marbee_push_prompt_dismissed';

export function wasPushPromptDismissed(): boolean {
  return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
}

export function markPushPromptDismissed(): void {
  localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
}

export function hasPushSubscriptionMarker(): boolean {
  return localStorage.getItem(SUBSCRIBED_KEY) === '1';
}

function markPushSubscribed(): void {
  localStorage.setItem(SUBSCRIBED_KEY, '1');
  localStorage.removeItem(PROMPT_DISMISSED_KEY);
}

async function ensureServiceWorker(firebase: FirebaseWebConfig) {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'FIREBASE_CONFIG', config: firebase });
  return registration;
}

export async function subscribeToWebPush(config: WebPushRuntimeConfig): Promise<string> {
  await initFirebase(config.firebase);
  await ensureServiceWorker(config.firebase);
  const token = await requestFcmToken(config.vapidPublicKey);
  await registerPushSubscription(token, config.tenantId, config.environment);
  markPushSubscribed();
  return token;
}

/** Subscribe flow inside the Marbee app: permission → token → DB. (Website visitors get the
 *  welcome push server-side from push-subscribe — D-022 / TD-21.) */
export async function runWebPushSubscribeFlow(config: WebPushRuntimeConfig): Promise<void> {
  await subscribeToWebPush(config);
}

/** Silent re-register when permission already granted (auto-resubscribe). */
export async function tryAutoResubscribe(config: WebPushRuntimeConfig): Promise<boolean> {
  if (!config.behavior.auto_resubscribe) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  try {
    await subscribeToWebPush(config);
    return true;
  } catch {
    return false;
  }
}

export async function initWebPushSdk(tenantId: string, environment: string) {
  return fetchWebPushRuntimeConfig(tenantId, environment);
}

export type PushTestFlowResult = {
  message: string;
  registered: boolean;
  sent: boolean;
  checks: WebPushConnectionCheck[];
};

/** End-to-end connection test: Google OAuth → browser token → real FCM delivery. */
export async function runPushTestWithWelcome(
  config: WebPushRuntimeConfig,
): Promise<PushTestFlowResult> {
  const checks: WebPushConnectionCheck[] = [];

  const serverTest = await testWebPushConnection(config.tenantId, config.environment, undefined, config.providerId);
  checks.push(...serverTest.checks);
  if (!serverTest.ok) {
    return {
      registered: false,
      sent: false,
      message: serverTest.message,
      checks,
    };
  }

  let token: string;
  try {
    token = await subscribeToWebPush(config);
    checks.push({
      label: 'Browser FCM registration',
      ok: true,
      detail: 'Device token obtained from Firebase using your Web API key and VAPID key',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Browser registration failed';
    checks.push({ label: 'Browser FCM registration', ok: false, detail });
    return { registered: false, sent: false, message: detail, checks };
  }

  const deliveryTest = await testWebPushConnection(config.tenantId, config.environment, token, config.providerId);
  for (const check of deliveryTest.checks) {
    if (!checks.some((c) => c.label === check.label)) checks.push(check);
  }

  if (!deliveryTest.ok || deliveryTest.status !== 'delivered') {
    return {
      registered: true,
      sent: false,
      message: deliveryTest.message,
      checks,
    };
  }

  return {
    registered: true,
    sent: true,
    message: 'Connection verified — test notification delivered via FCM. Check your browser notifications.',
    checks,
  };
}

export function shouldShowPushPrompt(behavior: WebPushBehaviorConfig): boolean {
  if (!behavior.prompt_enabled) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'default') return false;
  if (wasPushPromptDismissed()) return false;
  if (hasPushSubscriptionMarker()) return false;
  return true;
}
