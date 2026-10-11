/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

let firebaseInitialized = false;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
    firebase.initializeApp(event.data.config);
    firebase.messaging();
    firebaseInitialized = true;
  }
});

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return self.location.origin;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  return `${self.location.origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function buildOpenUrl(data) {
  if (data.track_opens === 'false') {
    return absoluteUrl(data.click_url ?? data.click_action ?? '/');
  }
  if (data.open_url) return absoluteUrl(data.open_url);
  const mid = data.message_id;
  const tid = data.tenant_id;
  const env = data.environment ?? 'production';
  const jid = data.journey_id;
  if (mid && tid) {
    let url =
      `/push/open?mid=${encodeURIComponent(mid)}&tid=${encodeURIComponent(tid)}&env=${encodeURIComponent(env)}`;
    if (jid) url += `&jid=${encodeURIComponent(jid)}`;
    if (data.delivery_id) url += `&did=${encodeURIComponent(data.delivery_id)}`;
    if (data.delivery_name) url += `&dn=${encodeURIComponent(data.delivery_name)}`;
    return absoluteUrl(url);
  }
  return absoluteUrl(data.click_url ?? data.click_action ?? '/');
}

function parseActions(data) {
  try {
    const raw = data.actions_json;
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 2).map((a) => ({
      action: a.action ?? 'open',
      title: a.title ?? 'Open',
      url: a.url,
    }));
  } catch {
    return [];
  }
}

function resolveClickUrl(data, actionId) {
  if (actionId && actionId !== 'default') {
    const match = parseActions(data).find((a) => a.action === actionId);
    if (match?.url) return absoluteUrl(match.url);
  }
  return buildOpenUrl(data);
}

function openUrl(url) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    for (const client of windowClients) {
      if ('focus' in client && client.url.includes(url.split('?')[0])) {
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const data = payload.data ?? {};
  const title = payload.notification?.title ?? data.title ?? 'Marbee';
  const body = payload.notification?.body ?? data.body ?? '';
  const openUrlTarget = buildOpenUrl(data);
  const actions = parseActions(data).map(({ action, title: actionTitle }) => ({
    action,
    title: actionTitle,
  }));

  const options = {
    body,
    icon: data.icon_url || payload.notification?.icon || '/favicon.svg',
    badge: data.badge_url || undefined,
    image: data.image_url || undefined,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    actions,
    data: {
      ...data,
      open_url: openUrlTarget,
      click_url: data.click_url ?? data.click_action ?? '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const url = resolveClickUrl(data, event.action);
  event.waitUntil(openUrl(url));
});

self.addEventListener('notificationclose', () => {
  /* Reserved for future dismiss analytics */
});

self.addEventListener('notificationaction', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const url = resolveClickUrl(data, event.action);
  event.waitUntil(openUrl(url));
});
