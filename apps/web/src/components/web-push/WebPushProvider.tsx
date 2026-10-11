import { useEffect, useState } from 'react';
import { onMessage } from 'firebase/messaging';
import { useTenantScope } from '@/contexts/AuthContext';
import { WebPushPrompt } from '@/components/web-push/WebPushPrompt';
import type { WebPushRuntimeConfig } from '@/lib/web-push-config';
import { fetchWebPushRuntimeConfig } from '@/lib/web-push-config';
import { getFirebaseMessaging, initFirebase } from '@/lib/firebase-push';
import {
  markPushPromptDismissed,
  runWebPushSubscribeFlow,
  shouldShowPushPrompt,
  tryAutoResubscribe,
} from '@/lib/web-push-sdk';

/** Show FCM messages when the app tab is in the foreground (SW only handles background). */
function useForegroundPushNotifications(config: WebPushRuntimeConfig | null) {
  useEffect(() => {
    if (!config) return;

    let cancelled = false;

    (async () => {
      try {
        await initFirebase(config.firebase);
        if (cancelled) return;

        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: 'FIREBASE_CONFIG', config: config.firebase });

        const messaging = getFirebaseMessaging();
        if (!messaging) return;

        onMessage(messaging, (payload) => {
          if (!('Notification' in window) || Notification.permission !== 'granted') return;

          const data = payload.data ?? {};
          const title = payload.notification?.title ?? data.title ?? 'Marbee';
          const body = payload.notification?.body ?? data.body ?? '';

          new Notification(title, {
            body,
            icon: data.icon_url || payload.notification?.icon || '/favicon.svg',
            badge: data.badge_url || undefined,
            tag: data.tag || undefined,
            data,
          });
        });
      } catch {
        /* Firebase not configured or unsupported */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config]);
}

export function WebPushProvider({ children }: { children: React.ReactNode }) {
  const { tenantId, environment } = useTenantScope();
  const [config, setConfig] = useState<WebPushRuntimeConfig | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useForegroundPushNotifications(config);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const runtime = await fetchWebPushRuntimeConfig(tenantId, environment);
        if (cancelled || !runtime) return;
        setConfig(runtime);

        await tryAutoResubscribe(runtime);

        if (shouldShowPushPrompt(runtime.behavior)) {
          timer = setTimeout(() => {
            if (!cancelled) setShowPrompt(true);
          }, runtime.behavior.prompt_delay_ms ?? 4000);
        }
      } catch {
        /* provider not configured */
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, environment]);

  const handleAccept = async () => {
    if (!config) return;
    setSubscribing(true);
    try {
      await runWebPushSubscribeFlow(config);
      setShowPrompt(false);
    } catch (err) {
      console.error('Web push subscribe failed', err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    markPushPromptDismissed();
    setShowPrompt(false);
  };

  return (
    <>
      {children}
      {showPrompt && config && (
        <WebPushPrompt
          behavior={config.behavior}
          subscribing={subscribing}
          onAccept={() => void handleAccept()}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}
