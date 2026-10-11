/**
 * Marbee Analytics SDK v2
 *
 * This file is served at: /sdk/v1/marbee-analytics.js
 * Place in: apps/web/public/sdk/v1/marbee-analytics.js
 *
 * Captures:
 *  - Pageviews (auto, on every route change including SPA)
 *  - Clicks (with element details)
 *  - Scroll depth (10/25/50/75/90/100%)
 *  - Dwell time per page (active tab time)
 *  - Rage clicks (3+ clicks in 500ms on same element)
 *  - Form submits
 *  - JS errors
 *  - Session duration and active time
 *  - SPA navigation (pushState/replaceState/popstate)
 *
 * All events are batched and sent to the Marbee ingest endpoint
 * with real IP-based geolocation resolved server-side.
 */
(function (w, d) {
  'use strict';

  // ── Config Resolution (injected by script tag or window) ──────────────────
  var currentScript = d.currentScript || (function() {
    var scripts = d.querySelectorAll('script[data-site], script[src*="marbee-analytics"]');
    return scripts[scripts.length - 1];
  })();

  var SITE_ID = (currentScript && (currentScript.getAttribute('data-site') || currentScript.dataset.site)) || w.__marbee_site || null;
  var WRITE_KEY = (currentScript && (currentScript.getAttribute('data-write-key') || currentScript.getAttribute('data-writekey') || currentScript.dataset.writeKey)) || w.__marbee_write_key || null;
  var INGEST_URL = 'https://uqffhyaftlwetqigfenp.supabase.co/functions/v1/web-analytics-ingest';

  if (!SITE_ID || !WRITE_KEY) {
    console.warn('[Marbee Analytics] Missing data-site or data-write-key attributes on script tag.');
    return;
  }
  if (w.__marbee_loaded) return;
  w.__marbee_loaded = true;

  // ── IDs ─────────────────────────────────────────────────────────────────
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  var aid = (function () {
    try {
      var k = '_mb_aid_' + SITE_ID;
      var v = localStorage.getItem(k);
      if (!v) { v = 'mb_' + uuid(); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'mb_' + uuid(); }
  })();

  var sessId = (function () {
    try {
      var k = '_mb_sid_' + SITE_ID;
      var v = sessionStorage.getItem(k);
      if (!v) { v = 'sess_' + uuid(); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'sess_' + uuid(); }
  })();

  // ── Device detection ─────────────────────────────────────────────────────
  var ua = navigator.userAgent;
  var deviceType = /iPad/i.test(ua) ? 'tablet' : /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  var browser = /Edg\//i.test(ua) ? 'Edge' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' : /Chrome\//i.test(ua) ? 'Chrome' : 'Other';
  var os = /Windows NT/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';

  // ── UTM parsing ──────────────────────────────────────────────────────────
  function getUtm(param) {
    try { return new URLSearchParams(location.search).get(param) || null; } catch (e) { return null; }
  }

  // ── Referrer domain ──────────────────────────────────────────────────────
  function referrerDomain() {
    try { return document.referrer ? new URL(document.referrer).hostname : null; } catch (e) { return null; }
  }

  // ── Event queue ──────────────────────────────────────────────────────────
  var eventQueue = [];
  var flushTimer = null;

  function scheduleFlush() {
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 1000);
    }
  }

  function flush() {
    flushTimer = null;
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0, eventQueue.length);
    sendBatch(batch, false);
  }

  // ── Session tracking ─────────────────────────────────────────────────────
  var sessionStart = Date.now();
  var lastActiveTime = Date.now();
  var activeTimeSec = 0;
  var activeInterval = setInterval(function () {
    if (document.visibilityState === 'visible' && Date.now() - lastActiveTime < 5000) {
      activeTimeSec++;
    }
  }, 1000);

  // Keep lastActiveTime fresh on interaction
  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(function (evt) {
    d.addEventListener(evt, function () { lastActiveTime = Date.now(); }, { passive: true });
  });

  // ── Session summary ───────────────────────────────────────────────────────
  var pagesVisited = [];
  var currentPage = location.pathname;
  if (pagesVisited.indexOf(currentPage) === -1) pagesVisited.push(currentPage);

  var clickCount = 0;
  var rageClickCount = 0;
  var formSubmitCount = 0;
  var jsErrorCount = 0;
  var maxScrollDepth = 0;

  function buildSessionSummary() {
    return {
      start_time: new Date(sessionStart).toISOString(),
      end_time: new Date().toISOString(),
      duration_sec: Math.round((Date.now() - sessionStart) / 1000),
      active_time_sec: activeTimeSec,
      page_count: pagesVisited.length,
      pages_visited: pagesVisited,
      max_scroll_depth: maxScrollDepth,
      click_count: clickCount,
      rage_click_count: rageClickCount,
      form_submit_count: formSubmitCount,
      js_error_count: jsErrorCount,
      converted: false,
    };
  }

  // ── Send batch to server ──────────────────────────────────────────────────
  function sendBatch(events, withSession) {
    if (!events || events.length === 0) return;
    var payload = {
      write_key: WRITE_KEY,
      site_id: SITE_ID,
      session_id: sessId,
      anonymous_id: aid,
      events: events,
    };
    if (withSession) {
      payload.session_summary = buildSessionSummary();
    }

    // Instant local dashboard refresh via BroadcastChannel
    try {
      if (w.BroadcastChannel) {
        new BroadcastChannel('marbee_analytics_stream').postMessage({ type: 'EVENT', payload: payload });
      }
    } catch (e) {}

    // Use sendBeacon for reliability on page unload
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        var sent = navigator.sendBeacon(INGEST_URL, blob);
        if (sent) return;
      }
    } catch (e) {}

    // Fallback: fetch
    fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
    }).catch(function () {});
  }

  // ── Base event fields ────────────────────────────────────────────────────
  function baseEvent(name, extra) {
    var utmSource = getUtm('utm_source');
    var utmMedium = getUtm('utm_medium');
    var utmCampaign = getUtm('utm_campaign');
    var evt = {
      event_id: 'e_' + uuid(),
      event_name: name,
      url: location.href,
      path: location.pathname,
      hostname: location.hostname,
      page_title: document.title || '',
      referrer: document.referrer || null,
      referrer_domain: referrerDomain(),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      screen_resolution: screen.width + 'x' + screen.height,
      viewport_size: w.innerWidth + 'x' + w.innerHeight,
      language: navigator.language || null,
      timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
      user_agent: ua,
      device_type: deviceType,
      browser: browser,
      os: os,
      client_timestamp: new Date().toISOString(),
      properties: extra || {},
    };
    return evt;
  }

  // ── Pageview ─────────────────────────────────────────────────────────────
  var pageEnterTime = Date.now();
  var lastScrollDepthOnPage = 0;

  function trackPageview() {
    pageEnterTime = Date.now();
    lastScrollDepthOnPage = 0;
    currentPage = location.pathname;
    if (pagesVisited.indexOf(currentPage) === -1) pagesVisited.push(currentPage);
    eventQueue.push(baseEvent('pageview'));
    scheduleFlush();
  }

  // Initial pageview
  trackPageview();

  // ── SPA route change detection ────────────────────────────────────────────
  var _pushState = history.pushState;
  var _replaceState = history.replaceState;
  history.pushState = function () { _pushState.apply(this, arguments); trackPageview(); };
  history.replaceState = function () { _replaceState.apply(this, arguments); trackPageview(); };
  w.addEventListener('popstate', trackPageview);

  // ── Scroll depth ─────────────────────────────────────────────────────────
  var scrollMilestones = [10, 25, 50, 75, 90, 100];
  var reportedMilestones = {};

  function onScroll() {
    var docH = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight, 1);
    var scrolled = w.scrollY + w.innerHeight;
    var pct = Math.round((scrolled / docH) * 100);
    if (pct > maxScrollDepth) maxScrollDepth = pct;
    if (pct > lastScrollDepthOnPage) lastScrollDepthOnPage = pct;

    scrollMilestones.forEach(function (m) {
      if (pct >= m && !reportedMilestones[location.pathname + '_' + m]) {
        reportedMilestones[location.pathname + '_' + m] = true;
        eventQueue.push(baseEvent('scroll_depth', { depth_pct: m, path: location.pathname }));
        scheduleFlush();
      }
    });
  }
  w.addEventListener('scroll', onScroll, { passive: true });

  // ── Click tracking ────────────────────────────────────────────────────────
  var recentClicks = [];
  d.addEventListener('click', function (e) {
    clickCount++;
    var target = e.target;
    var tag = target.tagName.toLowerCase();
    var selector = (target.id ? '#' + target.id : '') || (target.className ? '.' + target.className.split(' ').join('.') : tag);
    var text = (target.innerText || '').trim().slice(0, 80);
    var now = Date.now();

    // Rage click detection: 3+ clicks within 500ms on same area
    recentClicks = recentClicks.filter(function (c) { return now - c.t < 500; });
    recentClicks.push({ t: now, x: e.clientX, y: e.clientY });
    var nearby = recentClicks.filter(function (c) {
      return Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40;
    });
    if (nearby.length >= 3) {
      rageClickCount++;
      eventQueue.push(baseEvent('rage_click', { element: selector, text: text, click_count: nearby.length }));
    }

    // Only push non-rage clicks for links/buttons to avoid spam
    if (['a', 'button', 'input', 'select'].indexOf(tag) !== -1 || target.getAttribute('role') === 'button') {
      eventQueue.push(baseEvent('click', { element: selector, text: text, href: target.href || null }));
      scheduleFlush();
    }
  }, { passive: true });

  // ── Form submits ───────────────────────────────────────────────────────────
  d.addEventListener('submit', function (e) {
    formSubmitCount++;
    var form = e.target;
    var formId = form.id || form.getAttribute('name') || form.action || 'unknown';
    eventQueue.push(baseEvent('form_submit', { form_id: formId.toString().slice(0, 80) }));
    scheduleFlush();
  }, { passive: true });

  // ── JS error tracking ───────────────────────────────────────────────────
  w.addEventListener('error', function (e) {
    jsErrorCount++;
    eventQueue.push(baseEvent('js_error', {
      message: (e.message || '').slice(0, 200),
      filename: (e.filename || '').slice(0, 200),
      lineno: e.lineno,
    }));
    scheduleFlush();
  });

  // ── Page dwell time on unload ─────────────────────────────────────────────
  function onUnload() {
    clearInterval(activeInterval);
    var dwellSec = Math.round((Date.now() - pageEnterTime) / 1000);
    var remaining = eventQueue.splice(0, eventQueue.length);
    remaining.push(baseEvent('page_exit', {
      dwell_time_sec: dwellSec,
      scroll_depth_pct: lastScrollDepthOnPage,
      path: location.pathname,
    }));
    sendBatch(remaining, true); // Include full session summary on exit
  }

  // Use both for maximum reliability
  d.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      onUnload();
    }
  });
  w.addEventListener('pagehide', onUnload);

  // ── Periodic flush every 10s (for long sessions) ──────────────────────────
  setInterval(function () {
    flush();
    // Also send session heartbeat every 30s
  }, 10000);

  // ── Expose API for manual tracking ───────────────────────────────────────
  w.marbee = {
    track: function (eventName, props) {
      eventQueue.push(baseEvent(eventName, props || {}));
      scheduleFlush();
    },
    identify: function (userId, traits) {
      eventQueue.push(baseEvent('identify', { user_id: userId, traits: traits || {} }));
      scheduleFlush();
    },
    page: function () {
      trackPageview();
    },
  };

})(window, document);
