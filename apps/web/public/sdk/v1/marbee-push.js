/* Marbee Web Push — website SDK v1 (D-022).
 *
 * Install (the Channels → Web Push page shows the exact snippet):
 *   1. Put marbee-push-sw.js in the ROOT of your website (https://your-site/marbee-push-sw.js).
 *   2. Add:
 *      <script async src="https://<marbee>/sdk/v1/marbee-push.js"
 *              data-site="SITE_ID" data-write-key="WRITE_KEY"
 *              data-api="https://<project>.supabase.co/functions/v1"></script>
 *
 * Optional attributes: data-sw="/marbee-push-sw.js" (path of the worker),
 * data-prompt="manual" (no automatic soft prompt — call MarbeePush.subscribe() from your
 * own button). The site key is public by design; Marbee checks it against your domain.
 *
 * API: MarbeePush.subscribe() → Promise<boolean> · MarbeePush.unsubscribe() → Promise
 *      MarbeePush.isSubscribed() → boolean · MarbeePush.permission() → 'default'|'granted'|'denied'|'unsupported'
 */
(function (w, d) {
  'use strict';
  if (w.MarbeePush && w.MarbeePush.__v) return;

  var script = d.currentScript || d.querySelector('script[src*="marbee-push.js"]');
  var attr = function (n) { return script ? script.getAttribute(n) : null; };
  var SITE_ID = attr('data-site') || w.__marbee_site;
  var WRITE_KEY = attr('data-write-key') || w.__marbee_write_key;
  var API = (attr('data-api') || w.__marbee_api || '').replace(/\/$/, '');
  var SW_PATH = attr('data-sw') || '/marbee-push-sw.js';
  var MANUAL = attr('data-prompt') === 'manual';
  var FIREBASE_VERSION = '11.6.0';
  var TOKEN_KEY = '_mb_push_token_' + SITE_ID;
  var DISMISS_KEY = '_mb_push_dismissed_' + SITE_ID;
  var OPTOUT_KEY = '_mb_push_optout_' + SITE_ID;

  function log() { if (w.console) console.warn.apply(console, ['[Marbee Push]'].concat([].slice.call(arguments))); }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var supported = 'serviceWorker' in navigator && 'PushManager' in w && 'Notification' in w && w.isSecureContext;
  var api = {
    __v: 1,
    permission: function () { return supported ? Notification.permission : 'unsupported'; },
    isSubscribed: function () { return supported && Notification.permission === 'granted' && !!read(TOKEN_KEY); },
    subscribe: function () { return Promise.resolve(false); },
    unsubscribe: function () { return Promise.resolve(); },
  };
  w.MarbeePush = api;

  if (!SITE_ID || !WRITE_KEY || !API) { log('Missing data-site, data-write-key or data-api on the script tag.'); return; }
  if (!supported) return;

  function call(method, body) {
    return fetch(API + '/push-subscribe', {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ site_id: SITE_ID, write_key: WRITE_KEY }, body)),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = d.createElement('script');
      s.src = src; s.async = true; s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      d.head.appendChild(s);
    });
  }

  var configPromise = null;
  function getConfig() {
    if (!configPromise) configPromise = call('POST', { action: 'config' });
    return configPromise;
  }

  var messagingPromise = null;
  function getMessaging(cfg) {
    if (!messagingPromise) {
      var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
      messagingPromise = (w.firebase && w.firebase.messaging ? Promise.resolve() : loadScript(base + 'firebase-app-compat.js')
        .then(function () { return loadScript(base + 'firebase-messaging-compat.js'); }))
        .then(function () {
          var name = 'marbee-push';
          var app = (w.firebase.apps || []).filter(function (a) { return a.name === name; })[0] || w.firebase.initializeApp(cfg.firebase, name);
          return w.firebase.messaging(app);
        });
    }
    return messagingPromise;
  }

  function device() {
    var ua = navigator.userAgent;
    return {
      browser: /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Chrome\//.test(ua) ? 'Chrome' : 'Other',
      os: /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other',
      device: /iPad|Tablet/.test(ua) ? 'tablet' : /Mobile|Android|iPhone/.test(ua) ? 'mobile' : 'desktop',
    };
  }

  // Register the token with Marbee. Links to the analytics visitor id when present.
  function register(cfg) {
    return navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      .then(function (reg) { return navigator.serviceWorker.ready.then(function () { return reg; }); })
      .then(function (reg) {
        return getMessaging(cfg).then(function (messaging) {
          return messaging.getToken({ vapidKey: cfg.vapid_public_key, serviceWorkerRegistration: reg });
        });
      })
      .then(function (token) {
        if (!token) throw new Error('No push token');
        var old = read(TOKEN_KEY);
        var info = device();
        return call('POST', {
          fcm_token: token,
          old_token: old && old !== token ? old : undefined,
          ecid: read('_mb_aid_' + SITE_ID) || undefined,
          browser: info.browser, os: info.os, device: info.device,
          permission_status: Notification.permission,
        }).then(function () { store(TOKEN_KEY, token); return true; });
      });
  }

  api.subscribe = function () {
    return getConfig().then(function (cfg) {
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') return false;
        store(DISMISS_KEY, null);
        store(OPTOUT_KEY, null);
        return register(cfg);
      });
    }).catch(function (e) { log(e.message); return false; });
  };

  api.unsubscribe = function () {
    var token = read(TOKEN_KEY);
    store(TOKEN_KEY, null);
    store(OPTOUT_KEY, '1'); // browser permission stays "granted": don't silently re-subscribe
    if (!token) return Promise.resolve();
    return call('DELETE', { fcm_token: token }).then(function () {
      return getConfig().then(getMessaging).then(function (m) { return m.deleteToken(); });
    }).catch(function (e) { log(e.message); });
  };

  // ---- soft prompt (before the browser's own prompt, so a "no" isn't permanent) -------
  function el(tag, css, text) { var e = d.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; }
  function showPrompt(cfg) {
    if (d.getElementById('marbee-push-prompt')) return;
    var p = cfg.prompt || {};
    var box = el('div', 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483000;max-width:420px;width:calc(100% - 32px);background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.18);padding:14px 16px;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;gap:12px;align-items:flex-start;');
    box.id = 'marbee-push-prompt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', p.title || 'Notifications');
    if (p.icon_url && /^https?:\/\//.test(p.icon_url)) {
      var img = el('img', 'width:36px;height:36px;border-radius:8px;flex:none;object-fit:cover;');
      img.src = p.icon_url; img.alt = '';
      box.appendChild(img);
    }
    var col = el('div', 'flex:1;min-width:0;');
    col.appendChild(el('div', 'font-weight:600;margin-bottom:2px;', p.title || 'Stay in the loop'));
    col.appendChild(el('div', 'color:#475569;font-size:13px;', p.message || ''));
    var row = el('div', 'display:flex;gap:8px;margin-top:10px;justify-content:flex-end;');
    var no = el('button', 'background:transparent;border:1px solid #cbd5e1;color:#334155;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px;', p.dismiss_label || 'Not now');
    var yes = el('button', 'background:#4f46e5;border:0;color:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:600;', p.accept_label || 'Allow');
    no.type = yes.type = 'button';
    no.onclick = function () { box.remove(); store(DISMISS_KEY, String(Date.now())); };
    yes.onclick = function () { box.remove(); api.subscribe(); };
    row.appendChild(no); row.appendChild(yes); col.appendChild(row); box.appendChild(col);
    d.body.appendChild(box);
  }

  function start() {
    getConfig().then(function (cfg) {
      if (read(OPTOUT_KEY) === '1') return null; // visitor unsubscribed on this site
      if (Notification.permission === 'granted') return register(cfg); // keep token fresh
      if (Notification.permission !== 'default' || MANUAL || !cfg.prompt || !cfg.prompt.enabled) return null;
      var dismissed = Number(read(DISMISS_KEY) || 0);
      if (dismissed && Date.now() - dismissed < 7 * 24 * 3600 * 1000) return null; // ask again after a week
      setTimeout(function () { showPrompt(cfg); }, cfg.prompt.delay_ms || 0);
      return null;
    }).catch(function (e) { log(e.message); });
  }

  if (d.readyState === 'complete') start(); else w.addEventListener('load', start);
})(window, document);
