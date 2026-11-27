/* Marbee Web Push — service worker core (D-022).
 *
 * Loaded with importScripts() by:
 *   • a brand's website:  /marbee-push-sw.js  →  importScripts('https://<marbee>/sdk/v1/marbee-push-sw-core.js')
 *   • the Marbee app:     /firebase-messaging-sw.js
 *
 * Draws every Marbee push itself (messages are data-only, so there is never a second,
 * auto-drawn copy) and reports clicks to push-engage before opening the link.
 * No Firebase code is needed in the worker.
 */
/* eslint-disable no-restricted-globals */
(function () {
  'use strict';
  if (self.__marbeePushCore) return;
  self.__marbeePushCore = true;

  function absoluteUrl(u) {
    if (!u) return self.location.origin + '/';
    try {
      var url = new URL(u, self.location.origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch (e) { /* fall through */ }
    return self.location.origin + '/';
  }

  function parseActions(data) {
    try {
      var list = JSON.parse(data.actions_json || '[]');
      if (!Array.isArray(list)) return [];
      return list.slice(0, 2).map(function (a, i) {
        return { action: String((a && a.action) || 'action_' + (i + 1)), title: String((a && a.title) || 'Open'), url: a && a.url };
      });
    } catch (e) { return []; }
  }

  // Older messages (sent before D-022) carried a Marbee /push/open link instead.
  function legacyOpenUrl(data) {
    if (data.track_opens !== 'false' && data.open_url) return absoluteUrl(data.open_url);
    return absoluteUrl(data.click_url || data.click_action || '/');
  }

  self.addEventListener('push', function (event) {
    if (!event.data) return;
    var payload;
    try { payload = event.data.json(); } catch (e) { return; }
    var data = (payload && (payload.data || payload)) || {};
    var notification = payload.notification || {};
    var title = data.title || notification.title;
    if (!title) return;

    var options = {
      body: data.body || notification.body || '',
      icon: data.icon_url || notification.icon || undefined,
      badge: data.badge_url || undefined,
      image: data.image_url || undefined,
      // Same message twice (at-least-once delivery) replaces itself instead of stacking.
      tag: data.tag || data.message_id || undefined,
      renotify: Boolean(data.tag),
      requireInteraction: data.require_interaction === 'true',
      actions: parseActions(data).map(function (a) { return { action: a.action, title: a.title }; }),
      data: data,
    };
    event.waitUntil(self.registration.showNotification(title, options));
  });

  function reportClick(data, action) {
    if (data.marbee !== '1' || data.track_clicks === 'false' || !data.engage_url || !data.message_id || !data.tenant_id) {
      return Promise.resolve();
    }
    try {
      return fetch(data.engage_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: data.tenant_id,
          environment: data.environment || 'production',
          message_id: data.message_id,
          event: 'clicked',
          action: action || undefined,
        }),
        keepalive: true,
      }).catch(function () { /* tracking must never block the click */ });
    } catch (e) { return Promise.resolve(); }
  }

  function focusOrOpen(url) {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    });
  }

  function handleClick(event) {
    event.notification.close();
    var data = event.notification.data || {};
    var url;
    if (data.marbee === '1') {
      url = absoluteUrl(data.click_url || '/');
      if (event.action) {
        var match = parseActions(data).filter(function (a) { return a.action === event.action; })[0];
        if (match && match.url) url = absoluteUrl(match.url);
      }
    } else {
      url = legacyOpenUrl(data);
    }
    // Open first (needs the user gesture), report in parallel.
    event.waitUntil(Promise.all([focusOrOpen(url), reportClick(data, event.action)]));
  }

  self.addEventListener('notificationclick', handleClick);

  self.addEventListener('install', function () { self.skipWaiting(); });
  self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
})();
