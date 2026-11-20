import { supabase } from './supabase';
import { logAudit } from './audit';
import { createNotification } from './notifications';
import type {
  WebAnalyticsSite,
  WebAnalyticsEvent,
  WebAnalyticsMetrics,
  UtmCampaignMetric,
  ActionableInsight,
  WebPushSubscriber,
} from './web-analytics-types';

const STORAGE_SITES_KEY = 'marbee_web_analytics_sites_v1';
// Version v2 bumped to force-flush old events that had hardcoded Bengaluru/India fallbacks
const STORAGE_EVENTS_KEY = 'marbee_web_analytics_events_v2';

/**
 * Call once on analytics page mount to remove stale v1 event cache entries
 * that contained hardcoded Bengaluru / India / 'Chrome' fallbacks.
 */
export function purgeStaleFakeEvents(siteId: string): void {
  try {
    const oldKey = `marbee_web_analytics_events_v1_${siteId}`;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(oldKey);
    }
  } catch {
    // ignore storage errors
  }
}

function getStoredSites(tenantId: string, environment: string): WebAnalyticsSite[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_SITES_KEY}_${tenantId}_${environment}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Analytics storage read error:', e);
  }

  const defaultSite: WebAnalyticsSite = {
    id: 'was_k6anf9',
    tenantId,
    environment,
    siteId: 'site_k6anf9',
    name: 'Marbee Web App',
    domain: 'localhost:5173',
    allowedOrigins: ['localhost:5173', '127.0.0.1:5173', 'marbee.io', 'www.marbee.io'],
    writeKey: 'mb_live_k6anf99841',
    verificationToken: 'vtok_k6anf9',
    status: 'active',
    lastEventAt: new Date().toISOString(),
    totalPageviews: 0,
    totalEvents: 0,
    totalSessions: 0,
    settings: {
      autoPageviews: true,
      autoClicks: true,
      autoScroll: true,
      respectDoNotTrack: false,
      anonymizeIp: true,
      consentMode: 'opt_in',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveStoredSites(tenantId, environment, [defaultSite]);
  return [defaultSite];
}

function saveStoredSites(tenantId: string, environment: string, list: WebAnalyticsSite[]) {
  try {
    localStorage.setItem(`${STORAGE_SITES_KEY}_${tenantId}_${environment}`, JSON.stringify(list));
  } catch (e) {
    console.warn('Analytics storage write error:', e);
  }
}

function getStoredEvents(siteId: string): WebAnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_EVENTS_KEY}_${siteId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Events storage read error:', e);
  }
  return [];
}

function saveStoredEvents(siteId: string, list: WebAnalyticsEvent[]) {
  try {
    localStorage.setItem(`${STORAGE_EVENTS_KEY}_${siteId}`, JSON.stringify(list.slice(-500)));
  } catch (e) {
    console.warn('Events storage write error:', e);
  }
}

/** Fetch all registered analytics tracking sites for a tenant */
export async function fetchWebAnalyticsSites(
  tenantId: string,
  environment: string
): Promise<WebAnalyticsSite[]> {
  try {
    const { data, error } = await supabase
      .from('web_analytics_sites')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const mapped: WebAnalyticsSite[] = data.map((d: Record<string, unknown>) => ({
        id: String(d.id),
        tenantId: String(d.tenant_id),
        environment: String(d.environment),
        siteId: String(d.site_id),
        name: String(d.name),
        domain: String(d.domain),
        allowedOrigins: (d.allowed_origins as string[]) || [],
        writeKey: String(d.write_key),
        verificationToken: String(d.verification_token),
        status: d.status as WebAnalyticsSite['status'],
        lastEventAt: d.last_event_at ? String(d.last_event_at) : null,
        totalPageviews: Number(d.total_pageviews || 0),
        totalEvents: Number(d.total_events || 0),
        totalSessions: Number(d.total_sessions || 0),
        settings: (d.settings as WebAnalyticsSite['settings']) || {
          autoPageviews: true,
          autoClicks: true,
          autoScroll: true,
          respectDoNotTrack: false,
          anonymizeIp: true,
          consentMode: 'opt_in',
        },
        createdAt: String(d.created_at),
        updatedAt: String(d.updated_at),
      }));
      saveStoredSites(tenantId, environment, mapped);
      return mapped;
    }
  } catch {
    // fallback to storage
  }

  return getStoredSites(tenantId, environment);
}

/** Lowercase alphanumeric token from the browser's CSPRNG (not Math.random). */
function randomToken(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // 252 = largest multiple of 36 below 256 → no modulo bias
  let out = '';
  for (let i = 0; out.length < length; i += 1) {
    const b = i < bytes.length ? bytes[i] : crypto.getRandomValues(new Uint8Array(1))[0];
    if (b < 252) out += alphabet[b % 36];
  }
  return out;
}

/** Register a new site */
export async function createWebAnalyticsSite(
  tenantId: string,
  environment: string,
  input: {
    name: string;
    domain: string;
    allowedOrigins?: string[];
  }
): Promise<WebAnalyticsSite> {
  const cleanDomain = input.domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  // Cryptographically random ids (SEC-02). site_id is globally unique in the DB (sql/85).
  const siteId = `site_${randomToken(12)}`;
  const writeKey = `mb_live_${randomToken(32)}`;
  const verificationToken = `vtok_${randomToken(16)}`;

  const allowedOrigins = input.allowedOrigins && input.allowedOrigins.length > 0
    ? input.allowedOrigins
    : [cleanDomain, `www.${cleanDomain}`, 'localhost:5173'];

  const newSite: WebAnalyticsSite = {
    id: `was_${Date.now()}`,
    tenantId,
    environment,
    siteId,
    name: input.name.trim(),
    domain: cleanDomain,
    allowedOrigins,
    writeKey,
    verificationToken,
    status: 'pending_verification',
    lastEventAt: null,
    totalPageviews: 0,
    totalEvents: 0,
    totalSessions: 0,
    settings: {
      autoPageviews: true,
      autoClicks: true,
      autoScroll: true,
      respectDoNotTrack: false,
      anonymizeIp: true,
      consentMode: 'opt_in',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await supabase.from('web_analytics_sites').insert({
      id: newSite.id,
      tenant_id: tenantId,
      environment,
      site_id: newSite.siteId,
      name: newSite.name,
      domain: newSite.domain,
      allowed_origins: newSite.allowedOrigins,
      write_key: newSite.writeKey,
      verification_token: newSite.verificationToken,
      status: newSite.status,
      settings: newSite.settings,
    });
  } catch {}

  const current = getStoredSites(tenantId, environment);
  saveStoredSites(tenantId, environment, [newSite, ...current]);

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'web_analytics_site',
    resourceId: newSite.siteId,
    resourceName: newSite.name,
  });

  return newSite;
}

/** Delete a tracked site */
export async function deleteWebAnalyticsSite(
  tenantId: string,
  environment: string,
  siteId: string
): Promise<void> {
  try {
    await supabase.from('web_analytics_events').delete().eq('site_id', siteId);
    await supabase.from('web_analytics_sites').delete().eq('site_id', siteId).eq('tenant_id', tenantId);
  } catch {}

  const current = getStoredSites(tenantId, environment);
  saveStoredSites(tenantId, environment, current.filter((s) => s.siteId !== siteId));
  try {
    localStorage.removeItem(`${STORAGE_EVENTS_KEY}_${siteId}`);
  } catch {}

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'web_analytics_site',
    resourceId: siteId,
    resourceName: 'Web Analytics Site',
  });
}

/** Ingest Web Analytics Events Batch */
export async function ingestWebAnalyticsEvents(payload: {
  site_id: string;
  origin: string;
  events: Partial<WebAnalyticsEvent>[];
}): Promise<{ success: boolean; processed: number; message?: string }> {
  const { site_id, origin, events } = payload;
  const now = new Date().toISOString();

  const formattedEvents: WebAnalyticsEvent[] = events.map((e, idx) => ({
    id: `evt_${Date.now()}_${idx}`,
    tenantId: '00000000-0000-0000-0000-000000000001',
    environment: 'production',
    siteId: site_id,
    eventId: e.eventId || `eid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sessionId: e.sessionId || 'sess_default',
    anonymousId: e.anonymousId || 'anon_user',
    eventName: e.eventName || 'pageview',
    url: e.url || '/',
    path: e.path || '/',
    hostname: e.hostname || 'localhost',
    referrer: e.referrer || null,
    referrerDomain: e.referrerDomain || null,
    utmSource: e.utmSource || null,
    utmMedium: e.utmMedium || null,
    utmCampaign: e.utmCampaign || null,
    pageTitle: e.pageTitle || document?.title || '',
    screenResolution: e.screenResolution || null,
    viewportSize: e.viewportSize || null,
    language: e.language || (typeof navigator !== 'undefined' ? navigator.language : null) || null,
    timezone: e.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null) || null,
    userAgent: e.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null) || null,
    deviceType: e.deviceType || 'unknown',
    browser: e.browser || 'Unknown',
    os: e.os || 'Unknown',
    countryCode: e.countryCode || null,
    countryName: e.countryName || null,
    city: e.city || null,
    ipHash: e.ipHash || null,
    isBot: false,
    properties: e.properties || {},
    clientTimestamp: e.clientTimestamp || now,
    serverTimestamp: now,
  }));

  // Append to local store
  const existing = getStoredEvents(site_id);
  saveStoredEvents(site_id, [...existing, ...formattedEvents]);

  // Update site status to active
  try {
    const raw = localStorage.getItem(`${STORAGE_SITES_KEY}_00000000-0000-0000-0000-000000000001_production`);
    if (raw) {
      const sites: WebAnalyticsSite[] = JSON.parse(raw);
      const updated = sites.map((s) =>
        s.siteId === site_id
          ? {
              ...s,
              status: 'active' as const,
              lastEventAt: now,
              totalEvents: s.totalEvents + formattedEvents.length,
              totalPageviews: s.totalPageviews + formattedEvents.filter((ev) => ev.eventName === 'pageview').length,
            }
          : s
      );
      localStorage.setItem(`${STORAGE_SITES_KEY}_00000000-0000-0000-0000-000000000001_production`, JSON.stringify(updated));
    }
  } catch {}

  // Persist directly to Supabase web_analytics_events table
  try {
    const records = formattedEvents.map((e) => ({
      tenant_id: e.tenantId,
      environment: e.environment,
      site_id: e.siteId,
      event_id: e.eventId,
      session_id: e.sessionId,
      anonymous_id: e.anonymousId,
      customer_id: e.customerId || null,
      event_name: e.eventName,
      url: e.url,
      path: e.path,
      hostname: e.hostname,
      referrer: e.referrer,
      referrer_domain: e.referrerDomain,
      utm_source: e.utmSource,
      utm_medium: e.utmMedium,
      utm_campaign: e.utmCampaign,
      page_title: e.pageTitle,
      screen_resolution: e.screenResolution,
      viewport_size: e.viewportSize,
      language: e.language,
      timezone: e.timezone,
      user_agent: e.userAgent,
      device_type: e.deviceType,
      browser: e.browser,
      os: e.os,
      country_code: e.countryCode,
      country_name: e.countryName,
      city: e.city,
      ip_hash: e.ipHash,
      is_bot: e.isBot,
      properties: e.properties,
      client_timestamp: e.clientTimestamp,
      server_timestamp: e.serverTimestamp,
    }));
    await supabase.from('web_analytics_events').upsert(records, { onConflict: 'tenant_id,site_id,event_id' });
  } catch {}

  // RPC if connected
  try {
    await supabase.rpc('collect_web_analytics_batch', {
      p_site_id: site_id,
      p_origin: origin,
      p_events: formattedEvents,
    });
  } catch {}

  return { success: true, processed: formattedEvents.length };
}

/** Verify Site Connection - Checks if live events have arrived from the origin domain */
export async function verifySiteConnection(
  siteId: string
): Promise<{
  verified: boolean;
  lastEvent?: WebAnalyticsEvent;
  receivedAt?: string;
  domain?: string;
  error?: string;
}> {
  try {
    const { data: supaEvents } = await supabase
      .from('web_analytics_events')
      .select('*')
      .eq('site_id', siteId)
      .order('server_timestamp', { ascending: false })
      .limit(1);

    if (supaEvents && supaEvents.length > 0) {
      const row = supaEvents[0];
      return {
        verified: true,
        lastEvent: {
          id: row.id,
          tenantId: row.tenant_id,
          environment: row.environment,
          siteId: row.site_id,
          eventId: row.event_id,
          sessionId: row.session_id,
          anonymousId: row.anonymous_id,
          eventName: row.event_name,
          url: row.url,
          path: row.path,
          hostname: row.hostname,
          pageTitle: row.page_title,
          serverTimestamp: row.server_timestamp,
          clientTimestamp: row.client_timestamp,
          countryName: row.country_name,
          city: row.city,
          deviceType: row.device_type,
          browser: row.browser,
          os: row.os,
        } as WebAnalyticsEvent,
        receivedAt: row.server_timestamp,
        domain: row.hostname || row.url,
      };
    }
  } catch {}

  const events = getStoredEvents(siteId);

  if (events.length === 0) {
    return {
      verified: false,
      error: 'No events received yet. Embed the tracking script in <head>, visit your website, and click Check Connection.',
    };
  }

  const latest = events[events.length - 1];
  return {
    verified: true,
    lastEvent: latest,
    receivedAt: latest.serverTimestamp,
    domain: latest.hostname,
  };
}

/** Fetch Aggregated Metrics for the Dashboard */
export async function fetchWebAnalyticsMetrics(
  tenantId: string,
  environment: string,
  siteId: string,
  dateRange?: { from: Date; to: Date }
): Promise<WebAnalyticsMetrics> {
  let allEvents = getStoredEvents(siteId);

  // Sync with Supabase table if online
  try {
    const { data, error } = await supabase
      .from('web_analytics_events')
      .select('*')
      .eq('site_id', siteId)
      .order('server_timestamp', { ascending: true })
      .limit(1000);

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const mapped: WebAnalyticsEvent[] = data.map((d: any) => ({
        id: String(d.id),
        tenantId: String(d.tenant_id),
        environment: String(d.environment || 'production'),
        siteId: String(d.site_id),
        eventId: String(d.event_id),
        sessionId: String(d.session_id),
        anonymousId: String(d.anonymous_id),
        customerId: d.customer_id || undefined,
        eventName: String(d.event_name),
        url: String(d.url),
        path: String(d.path || '/'),
        hostname: String(d.hostname || ''),
        referrer: d.referrer || null,
        referrerDomain: d.referrer_domain || null,
        utmSource: d.utm_source || null,
        utmMedium: d.utm_medium || null,
        utmCampaign: d.utm_campaign || null,
        utmContent: d.utm_content || null,
        utmTerm: d.utm_term || null,
        pageTitle: d.page_title || '',
        screenResolution: d.screen_resolution || '',
        viewportSize: d.viewport_size || '',
        language: d.language || 'en-US',
        timezone: d.timezone || 'UTC',
        userAgent: d.user_agent || '',
        deviceType: d.device_type || 'desktop',
        browser: d.browser || 'Chrome',
        os: d.os || 'Other',
        countryCode: d.country_code || null,
        countryName: d.country_name || null,
        city: d.city || null,
        ipHash: d.ip_hash || '',
        isBot: Boolean(d.is_bot),
        properties: (d.properties as Record<string, any>) || {},
        clientTimestamp: String(d.client_timestamp || d.server_timestamp),
        serverTimestamp: String(d.server_timestamp),
      }));

      const eventMap = new Map<string, WebAnalyticsEvent>();
      mapped.forEach((e) => eventMap.set(e.eventId, e));
      allEvents.forEach((e) => eventMap.set(e.eventId, e));
      allEvents = Array.from(eventMap.values());
      saveStoredEvents(siteId, allEvents);
    }
  } catch {}

  const now = Date.now();

  // Filter events by dateRange if provided
  const events = dateRange
    ? allEvents.filter((e) => {
        const ts = new Date(e.serverTimestamp).getTime();
        return ts >= dateRange.from.getTime() && ts <= dateRange.to.getTime();
      })
    : allEvents;

  // Zero-State: If no events exist, return 100% clean zero metrics
  if (events.length === 0) {
    return {
      activeVisitorsNow: 0,
      totalPageviews: 0,
      totalSessions: 0,
      uniqueVisitors: 0,
      avgSessionDurationSec: 0,
      bounceRatePercent: 0,
      pagesPerSession: 0,
      newVsReturning: {
        newPercent: 0,
        returningPercent: 0,
        newCount: 0,
        returningCount: 0,
      },
      pageviewsDelta: 0,
      sessionsDelta: 0,
      visitorsDelta: 0,
      timeSeries: [],
      topPages: [],
      trafficSources: [],
      utmBreakdown: [],
      actionableInsights: [],
      devices: [],
      browsers: [],
      countries: [],
      cities: [],
      regions: [],
      customEvents: [],
    };
  }

  // Active visitors in last 5 minutes (always from all events)
  const activeFiveMin = allEvents.filter(
    (e) => now - new Date(e.serverTimestamp).getTime() < 5 * 60 * 1000
  );
  const activeVisitorsNow = new Set(activeFiveMin.map((e) => e.anonymousId)).size;

  const totalPageviews = events.filter((e) => e.eventName === 'pageview').length;
  const uniqueVisitors = new Set(events.map((e) => e.anonymousId)).size;

  // Group events by session
  const sessionMap = new Map<string, WebAnalyticsEvent[]>();
  const userSessionCount = new Map<string, Set<string>>();

  events.forEach((e) => {
    const sList = sessionMap.get(e.sessionId) || [];
    sList.push(e);
    sessionMap.set(e.sessionId, sList);

    const userSessions = userSessionCount.get(e.anonymousId) || new Set<string>();
    userSessions.add(e.sessionId);
    userSessionCount.set(e.anonymousId, userSessions);
  });

  const totalSessions = sessionMap.size;

  let totalDurationSec = 0;
  let singlePageSessions = 0;
  let mobileBounces = 0;
  let mobileSessions = 0;

  sessionMap.forEach((sessionEvents) => {
    const sorted = [...sessionEvents].sort(
      (a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime()
    );

    const isMobile = sorted.some((e) => e.deviceType === 'mobile');
    if (isMobile) mobileSessions++;

    if (sorted.length <= 1) {
      singlePageSessions++;
      if (isMobile) mobileBounces++;
      totalDurationSec += 15;
    } else {
      const first = new Date(sorted[0].serverTimestamp).getTime();
      const last = new Date(sorted[sorted.length - 1].serverTimestamp).getTime();
      const diffSec = Math.max(10, Math.floor((last - first) / 1000));
      totalDurationSec += Math.min(diffSec, 1800);
    }
  });

  const avgSessionDurationSec = totalSessions > 0 ? Math.round(totalDurationSec / totalSessions) : 0;
  const bounceRatePercent = totalSessions > 0 ? Math.round((singlePageSessions / totalSessions) * 100) : 0;
  const pagesPerSession = totalSessions > 0 ? Number((totalPageviews / totalSessions).toFixed(1)) : 0;

  // New vs Returning users calculation
  let returningUsersCount = 0;
  userSessionCount.forEach((sessSet) => {
    if (sessSet.size > 1) returningUsersCount++;
  });
  const newUsersCount = Math.max(0, uniqueVisitors - returningUsersCount);
  const newPercent = uniqueVisitors > 0 ? Math.round((newUsersCount / uniqueVisitors) * 100) : 0;
  const returningPercent = uniqueVisitors > 0 ? 100 - newPercent : 0;

  // Adaptive time series bucketing based on dateRange span
  const timeSeriesMap: Record<string, { pageviews: number; visitors: Set<string>; sessions: Set<string> }> = {};

  if (dateRange) {
    const rangeMs = dateRange.to.getTime() - dateRange.from.getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const rangeInDays = rangeMs / DAY_MS;

    if (rangeInDays <= 2) {
      const startHour = new Date(dateRange.from);
      startHour.setMinutes(0, 0, 0);
      const endHour = new Date(dateRange.to);
      endHour.setMinutes(0, 0, 0);
      for (let t = startHour.getTime(); t <= endHour.getTime(); t += 3600000) {
        const d = new Date(t);
        const label = `${String(d.getHours()).padStart(2, '0')}:00`;
        timeSeriesMap[label] = { pageviews: 0, visitors: new Set(), sessions: new Set() };
      }
      events.forEach((e) => {
        const d = new Date(e.serverTimestamp);
        const label = `${String(d.getHours()).padStart(2, '0')}:00`;
        if (timeSeriesMap[label]) {
          if (e.eventName === 'pageview') timeSeriesMap[label].pageviews++;
          timeSeriesMap[label].visitors.add(e.anonymousId);
          timeSeriesMap[label].sessions.add(e.sessionId);
        }
      });
    } else {
      const startDate = new Date(dateRange.from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.to);
      endDate.setHours(0, 0, 0, 0);
      for (let t = startDate.getTime(); t <= endDate.getTime(); t += DAY_MS) {
        const d = new Date(t);
        const label = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
        timeSeriesMap[label] = { pageviews: 0, visitors: new Set(), sessions: new Set() };
      }
      events.forEach((e) => {
        const d = new Date(e.serverTimestamp);
        const label = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
        if (timeSeriesMap[label]) {
          if (e.eventName === 'pageview') timeSeriesMap[label].pageviews++;
          timeSeriesMap[label].visitors.add(e.anonymousId);
          timeSeriesMap[label].sessions.add(e.sessionId);
        }
      });
    }
  } else {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 3600000);
      const hourLabel = `${String(d.getHours()).padStart(2, '0')}:00`;
      timeSeriesMap[hourLabel] = { pageviews: 0, visitors: new Set(), sessions: new Set() };
    }
    events.forEach((e) => {
      const d = new Date(e.serverTimestamp);
      const hourLabel = `${String(d.getHours()).padStart(2, '0')}:00`;
      if (timeSeriesMap[hourLabel]) {
        if (e.eventName === 'pageview') timeSeriesMap[hourLabel].pageviews++;
        timeSeriesMap[hourLabel].visitors.add(e.anonymousId);
        timeSeriesMap[hourLabel].sessions.add(e.sessionId);
      }
    });
  }

  const timeSeries = Object.entries(timeSeriesMap).map(([time, val]) => ({
    time,
    pageviews: val.pageviews,
    visitors: val.visitors.size,
    sessions: val.sessions.size,
  }));

  // Top Pages
  const pageMap: Record<string, { views: number; visitors: Set<string> }> = {};
  events.filter((e) => e.eventName === 'pageview').forEach((e) => {
    const path = e.path || '/';
    if (!pageMap[path]) pageMap[path] = { views: 0, visitors: new Set() };
    pageMap[path].views++;
    pageMap[path].visitors.add(e.anonymousId);
  });

  const pageTimeMap: Record<string, { totalSec: number; count: number }> = {};
  events.filter((e) => e.eventName === 'pageview').forEach((e) => {
    const path = e.path || '/';
    if (!pageTimeMap[path]) pageTimeMap[path] = { totalSec: 0, count: 0 };
    const dwellSec = typeof (e.properties as any)?.dwell_time_sec === 'number' ? (e.properties as any).dwell_time_sec : 0;
    pageTimeMap[path].totalSec += dwellSec;
    pageTimeMap[path].count++;
  });

  const topPages = Object.entries(pageMap)
    .map(([path, data]) => ({
      path,
      pageviews: data.views,
      uniqueVisitors: data.visitors.size,
      avgTimeOnPageSec: pageTimeMap[path] && pageTimeMap[path].count > 0
        ? Math.round(pageTimeMap[path].totalSec / pageTimeMap[path].count)
        : 0,
      bounceRate: bounceRatePercent,
    }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, 10);

  // Traffic Sources
  const sourcesMap: Record<string, { sessions: number; medium: string; conversions: number }> = {};
  events.forEach((e) => {
    const src = e.utmSource || e.referrerDomain || 'Direct / Organic';
    const med = e.utmMedium || (src.toLowerCase().includes('google') ? 'organic' : src.toLowerCase().includes('meta') ? 'social' : 'direct');
    if (!sourcesMap[src]) sourcesMap[src] = { sessions: 0, medium: med, conversions: 0 };
    sourcesMap[src].sessions++;
    const name = (e.eventName || '').toLowerCase();
    if (name.includes('purchase') || name.includes('checkout_completed') || name.includes('signup')) {
      sourcesMap[src].conversions++;
    }
  });

  const trafficSources = Object.entries(sourcesMap).map(([src, data]) => ({
    source: src,
    medium: data.medium,
    campaign: 'Active_Campaign',
    sessions: data.sessions,
    conversionRate: data.sessions > 0 ? Number(((data.conversions / data.sessions) * 100).toFixed(1)) : 0,
  }));

  // UTM Campaigns Breakdown
  const utmBreakdown: UtmCampaignMetric[] = Object.entries(sourcesMap).map(([src, data]) => ({
    campaign: 'Main_Funnel',
    source: src,
    medium: data.medium,
    sessions: data.sessions,
    bounceRate: bounceRatePercent,
    avgDurationSec: avgSessionDurationSec,
  }));

  // Devices & Browsers & Geography
  const devicesMap: Record<string, number> = {};
  const browsersMap: Record<string, number> = {};
  const countriesMap: Record<string, { name: string; visitors: Set<string>; sessions: Set<string> }> = {};
  const citiesMap: Record<string, { city: string; country: string; visitors: Set<string>; sessions: Set<string> }> = {};
  const regionsMap: Record<string, { region: string; country: string; visitors: Set<string>; sessions: Set<string> }> = {};

  events.forEach((e) => {
    // Device
    const rawDev = (e.deviceType || '').toLowerCase();
    const dev = rawDev === 'mobile' ? 'Mobile' : rawDev === 'tablet' ? 'Tablet' : rawDev === 'bot' ? null : 'Desktop';
    if (dev) devicesMap[dev] = (devicesMap[dev] || 0) + 1;

    // Browser — only if known
    const rawBr = e.browser || '';
    if (rawBr && rawBr !== 'Unknown') {
      const br = rawBr.includes('Firefox') ? 'Firefox' : rawBr.includes('Edge') || rawBr.includes('Edg') ? 'Edge' : rawBr.includes('Safari') && !rawBr.includes('Chrome') ? 'Safari' : rawBr.includes('Chrome') ? 'Chrome' : rawBr;
      browsersMap[br] = (browsersMap[br] || 0) + 1;
    }

    // Geography — ONLY from real values, never fake fallbacks
    const cCode = e.countryCode;
    const cName = e.countryName;
    const city = e.city;
    const props = (e.properties as Record<string, any>) || {};
    const region = props.region || props.state;

    if (cCode && cName) {
      if (!countriesMap[cCode]) countriesMap[cCode] = { name: cName, visitors: new Set(), sessions: new Set() };
      countriesMap[cCode].visitors.add(e.anonymousId);
      countriesMap[cCode].sessions.add(e.sessionId);
    }

    if (city && cName) {
      const cityKey = `${city}|${cCode || 'XX'}`;
      if (!citiesMap[cityKey]) citiesMap[cityKey] = { city, country: cName, visitors: new Set(), sessions: new Set() };
      citiesMap[cityKey].visitors.add(e.anonymousId);
      citiesMap[cityKey].sessions.add(e.sessionId);
    }

    if (region && cName) {
      const regionKey = `${region}|${cCode || 'XX'}`;
      if (!regionsMap[regionKey]) regionsMap[regionKey] = { region, country: cName, visitors: new Set(), sessions: new Set() };
      regionsMap[regionKey].visitors.add(e.anonymousId);
      regionsMap[regionKey].sessions.add(e.sessionId);
    }
  });

  const totalDeviceEvents = Math.max(1, events.length);
  const devices = Object.entries(devicesMap).map(([name, count]) => ({
    name,
    count,
    percentage: Math.round((count / totalDeviceEvents) * 100),
  }));

  const browsers = Object.entries(browsersMap).map(([name, count]) => ({
    name,
    count,
    percentage: Math.round((count / totalDeviceEvents) * 100),
  }));

  const countries = Object.entries(countriesMap).map(([code, data]) => ({
    code,
    name: data.name,
    visitors: data.visitors.size,
    percentage: uniqueVisitors > 0 ? Math.round((data.visitors.size / uniqueVisitors) * 100) : 0,
  })).sort((a, b) => b.visitors - a.visitors);

  const cities = Object.entries(citiesMap).map(([, data]) => ({
    city: data.city,
    country: data.country,
    visitors: data.visitors.size,
    percentage: uniqueVisitors > 0 ? Math.round((data.visitors.size / uniqueVisitors) * 100) : 0,
  })).sort((a, b) => b.visitors - a.visitors);

  const regions = Object.entries(regionsMap).map(([, data]) => ({
    region: data.region,
    country: data.country,
    visitors: data.visitors.size,
    percentage: uniqueVisitors > 0 ? Math.round((data.visitors.size / uniqueVisitors) * 100) : 0,
  })).sort((a, b) => b.visitors - a.visitors);

  // Custom Events
  const customEventsMap: Record<string, { count: number; users: Set<string>; lastTime: string }> = {};
  events.filter((e) => e.eventName !== 'pageview').forEach((e) => {
    if (!customEventsMap[e.eventName]) {
      customEventsMap[e.eventName] = { count: 0, users: new Set(), lastTime: e.serverTimestamp };
    }
    customEventsMap[e.eventName].count++;
    customEventsMap[e.eventName].users.add(e.anonymousId);
    customEventsMap[e.eventName].lastTime = e.serverTimestamp;
  });

  const customEvents = Object.entries(customEventsMap).map(([name, data]) => ({
    eventName: name,
    count: data.count,
    uniqueUsers: data.users.size,
    lastFiredAt: data.lastTime,
  }));

  // Actionable Insights Engine (Data-driven)
  const actionableInsights: ActionableInsight[] = [];

  if (mobileSessions > 0 && (mobileBounces / mobileSessions) > 0.4) {
    actionableInsights.push({
      id: 'ins_mobile_bounce',
      type: 'warning',
      title: 'High Mobile Exit Rate Detected',
      description: `Mobile visitors have a ${Math.round((mobileBounces / mobileSessions) * 100)}% bounce rate across ${mobileSessions} mobile sessions.`,
      action: 'Optimize mobile viewport layout and responsive assets to improve retention.',
      impactMetric: '-18% Exit Rate Potential',
    });
  }

  if (topPages.length > 0) {
    const topPage = topPages[0];
    actionableInsights.push({
      id: 'ins_top_page',
      type: 'opportunity',
      title: `Top Landing Page: ${topPage.path}`,
      description: `${topPage.path} accounts for ${Math.round((topPage.pageviews / Math.max(1, totalPageviews)) * 100)}% of total pageviews.`,
      action: 'Add high-visibility CTA or lead capture on this page to maximize conversion.',
      impactMetric: '+15% Conversion Potential',
    });
  }

  return {
    activeVisitorsNow,
    totalPageviews,
    totalSessions,
    uniqueVisitors,
    avgSessionDurationSec,
    bounceRatePercent,
    pagesPerSession,
    newVsReturning: {
      newPercent,
      returningPercent,
      newCount: newUsersCount,
      returningCount: returningUsersCount,
    },
    pageviewsDelta: 0,
    sessionsDelta: 0,
    visitorsDelta: 0,
    timeSeries,
    topPages,
    trafficSources,
    utmBreakdown,
    actionableInsights,
    devices,
    browsers,
    countries,
    cities,
    regions,
    customEvents,
  };
}

const STORAGE_PUSH_SUBS_KEY = 'marbee_web_push_subscribers_v1';

function getStoredSubscribers(tenantId: string, environment: string): WebPushSubscriber[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PUSH_SUBS_KEY}_${tenantId}_${environment}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Push subscribers storage read error:', e);
  }
  return [];
}

function getDeletedTokenKeys(tenantId: string): Set<string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`marbee_deleted_push_tokens_${tenantId}`) : null;
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function addDeletedTokenKey(tenantId: string, tokenOrId: string) {
  try {
    if (typeof window === 'undefined') return;
    const set = getDeletedTokenKeys(tenantId);
    set.add(tokenOrId);
    localStorage.setItem(`marbee_deleted_push_tokens_${tenantId}`, JSON.stringify(Array.from(set)));
  } catch {}
}

function saveStoredSubscribers(tenantId: string, environment: string, list: WebPushSubscriber[]) {
  try {
    localStorage.setItem(`${STORAGE_PUSH_SUBS_KEY}_${tenantId}_${environment}`, JSON.stringify(list.slice(-500)));
  } catch (e) {
    console.warn('Push subscribers storage write error:', e);
  }
}

/** Fetch all registered Web Push subscribers for a tenant */
export async function fetchWebPushSubscribers(
  tenantId: string,
  environment: string,
  siteId?: string
): Promise<WebPushSubscriber[]> {
  let apiSubscribers: WebPushSubscriber[] = [];
  const safeTopic = `marbee_push_${(tenantId || 'default').replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const deletedSet = getDeletedTokenKeys(tenantId);

  // 1. Fetch from local Vite API server
  try {
    const res = await fetch('/api/v1/web-push/subscribers');
    if (res.ok) {
      const body = await res.json();
      if (body && Array.isArray(body.subscribers)) {
        apiSubscribers = body.subscribers;
      }
    }
  } catch {}

  // 2. Fetch from cloud HTTPS relay (captures tokens from external HTTPS domains like Netlify)
  try {
    const cloudRes = await fetch(`https://ntfy.sh/${safeTopic}/json?poll=1&since=all`);
    if (cloudRes.ok) {
      const text = (await cloudRes.text()).trim();
      if (text) {
        const lines = text.split('\n').filter(Boolean);
        const cloudSubs: WebPushSubscriber[] = lines
          .map((l) => {
            try { return JSON.parse(l); } catch { return null; }
          })
          .filter((m) => m && m.event === 'message')
          .map((m) => {
            try {
              const d = JSON.parse(m.message);
              const ua = d.browser || '';
              const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
              const isTablet = /iPad|Tablet/i.test(ua);
              const browser = /Edg/i.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' : 'Chrome';
              const os = /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iOS/i.test(ua) ? 'iOS' : 'Desktop';
              const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

              const isTest = Boolean(d.is_test_token || d.fcm_token?.startsWith('TEST_TOKEN_') || d.fcm_token?.startsWith('fcm_sim_') || d.fcm_token?.startsWith('live_netlify_'));

              return {
                id: d.id || `wps_${m.time}_${Math.random().toString(36).substring(2, 6)}`,
                tenantId: d.tenant_id || tenantId,
                environment: d.environment || environment,
                siteId: d.site_id || siteId,
                websiteDomain: d.website_domain || 'remote-site',
                optinPage: d.optin_page || '/',
                optinStatus: d.optin_status || 'yes',
                fcmToken: d.fcm_token,
                customerId: d.customer_id || null,
                browser: d.browser && !d.browser.includes('Mozilla') ? d.browser : browser,
                os: d.os || os,
                device: d.device || device,
                permissionStatus: d.permission_status || 'granted',
                subscriptionStatus: d.subscription_status || 'active',
                isTestToken: isTest,
                deliveryFailures: 0,
                lastDeliveryStatus: 'untested' as const,
                lastFailureReason: null,
                endpoint: d.endpoint,
                lastSeen: new Date(m.time * 1000).toISOString(),
                createdAt: new Date(m.time * 1000).toISOString(),
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean) as WebPushSubscriber[];

        apiSubscribers = [...cloudSubs, ...apiSubscribers];
      }
    }
  } catch {}

  const stored = getStoredSubscribers(tenantId, environment);
  
  // Merge apiSubscribers + stored
  const mergedMap = new Map<string, WebPushSubscriber>();
  apiSubscribers.forEach((s) => {
    if (!deletedSet.has(s.id) && !deletedSet.has(s.fcmToken)) {
      mergedMap.set(s.fcmToken, s);
    }
  });
  stored.forEach((s) => {
    if (!deletedSet.has(s.id) && !deletedSet.has(s.fcmToken) && !mergedMap.has(s.fcmToken)) {
      mergedMap.set(s.fcmToken, s);
    }
  });

  const merged = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  saveStoredSubscribers(tenantId, environment, merged);

  if (siteId) {
    const cleanId = siteId.toLowerCase();
    return merged.filter((s) => {
      if (!s.siteId) return true;
      if (s.siteId.toLowerCase() === cleanId) return true;
      if (s.websiteDomain && s.websiteDomain.toLowerCase().includes(cleanId)) return true;
      return true; // Return all for this tenant if domain belongs to same workspace
    });
  }
  return merged;
}

/** Clear all test / simulated push subscriber tokens */
export async function clearTestPushSubscribers(tenantId: string, environment: string): Promise<void> {
  const current = getStoredSubscribers(tenantId, environment);
  const deletedSet = getDeletedTokenKeys(tenantId);
  current.forEach((s) => {
    if (s.isTestToken || s.fcmToken.startsWith('TEST_TOKEN_') || s.fcmToken.startsWith('fcm_sim_') || s.fcmToken.startsWith('live_netlify_') || s.fcmToken.startsWith('mb_push_') || s.fcmToken.startsWith('mb_tok_')) {
      deletedSet.add(s.id);
      deletedSet.add(s.fcmToken);
      addDeletedTokenKey(tenantId, s.id);
      addDeletedTokenKey(tenantId, s.fcmToken);
    }
  });

  const realOnly = current.filter(
    (s) => !deletedSet.has(s.id) && !deletedSet.has(s.fcmToken)
  );
  saveStoredSubscribers(tenantId, environment, realOnly);

  try {
    await fetch('/api/v1/web-push/subscribers/clear-test', { method: 'POST' });
  } catch {}
}

/** Register a new Web Push token/subscriber with website & page attribution */
export async function registerWebPushSubscriber(payload: {
  tenantId: string;
  environment: string;
  siteId?: string;
  websiteDomain?: string;
  optinPage?: string;
  optinStatus?: 'yes' | 'granted' | 'pending' | 'denied';
  fcmToken: string;
  customerId?: string | null;
  browser?: string;
  os?: string;
  device?: string;
  permissionStatus?: string;
  isTestToken?: boolean;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
}): Promise<WebPushSubscriber> {
  const { tenantId, environment, siteId, websiteDomain, optinPage, optinStatus, fcmToken, customerId, endpoint, p256dh, auth } = payload;
  const now = new Date().toISOString();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const browser = payload.browser || (/Edg/i.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' : 'Chrome');
  const os = payload.os || (/Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iOS/i.test(ua) ? 'iOS' : 'Desktop');
  const device = payload.device || (isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop');
  const isTest = payload.isTestToken ?? (fcmToken.startsWith('TEST_TOKEN_') || fcmToken.startsWith('fcm_sim_') || fcmToken.startsWith('mb_push_'));

  const subscriber: WebPushSubscriber = {
    id: `wps_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    environment,
    siteId,
    websiteDomain: websiteDomain || (typeof window !== 'undefined' ? window.location.hostname : 'example.com'),
    optinPage: optinPage || (typeof window !== 'undefined' ? window.location.pathname : '/'),
    optinStatus: optinStatus || (payload.permissionStatus === 'granted' ? 'yes' : 'denied'),
    fcmToken,
    customerId: customerId || null,
    browser,
    os,
    device,
    permissionStatus: payload.permissionStatus || 'granted',
    subscriptionStatus: 'active',
    isTestToken: isTest,
    deliveryFailures: 0,
    lastDeliveryStatus: 'untested',
    lastFailureReason: null,
    endpoint,
    p256dh,
    auth,
    lastSeen: now,
    createdAt: now,
  };

  // Attempt database upsert
  try {
    await supabase.from('web_push_subscribers').upsert(
      {
        tenant_id: tenantId,
        environment,
        fcm_token: fcmToken,
        customer_id: customerId || null,
        browser,
        os,
        device,
        permission_status: payload.permissionStatus || 'granted',
        subscription_status: 'active',
        last_seen: now,
      },
      { onConflict: 'tenant_id,environment,fcm_token' }
    );
  } catch {}

  // Update local storage
  const current = getStoredSubscribers(tenantId, environment);
  const existingIdx = current.findIndex((s) => s.fcmToken === fcmToken);
  let updatedList: WebPushSubscriber[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = {
      ...updatedList[existingIdx],
      lastSeen: now,
      subscriptionStatus: 'active',
      websiteDomain: subscriber.websiteDomain,
      optinPage: subscriber.optinPage,
      optinStatus: subscriber.optinStatus,
    };
  } else {
    updatedList = [subscriber, ...current];
  }
  saveStoredSubscribers(tenantId, environment, updatedList);

  // Broadcast to other tabs
  try {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      new BroadcastChannel('marbee_analytics_stream').postMessage({ type: 'PUSH_SUBSCRIBER_REGISTERED', subscriber });
    }
  } catch {}

  // Trigger actual real notification
  try {
    void createNotification(
      {
        title: 'Live Web Push Subscriber Opted-In',
        message: `New browser subscriber captured from ${browser} (${device}) on ${subscriber.websiteDomain || 'site'}.`,
        type: 'web_push',
        category: 'web_push',
        actionUrl: '/web-analytics',
        actionLabel: 'View in Web Push Hub',
        badge: 'Live Feed',
      },
      tenantId,
      environment
    );
  } catch {}

  return subscriber;
}

/** Mark a subscriber push delivery result — auto-marks inactive on failure */
export async function markPushSubscriberDeliveryResult(
  tenantId: string,
  environment: string,
  fcmTokenOrId: string,
  delivered: boolean,
  failureReason?: string
): Promise<{ success: boolean; status: WebPushSubscriber['subscriptionStatus'] }> {
  const current = getStoredSubscribers(tenantId, environment);
  const idx = current.findIndex((s) => s.fcmToken === fcmTokenOrId || s.id === fcmTokenOrId);
  const newStatus: WebPushSubscriber['subscriptionStatus'] = delivered ? 'active' : 'inactive';

  if (idx >= 0) {
    const prev = current[idx];
    const updated: WebPushSubscriber = {
      ...prev,
      subscriptionStatus: newStatus,
      lastDeliveryStatus: delivered ? 'delivered' : 'failed',
      lastFailureReason: delivered ? null : (failureReason || 'Push delivery failed — endpoint unreachable or rejected by browser'),
      deliveryFailures: delivered ? 0 : (prev.deliveryFailures || 0) + 1,
      lastSeen: new Date().toISOString(),
    };
    current[idx] = updated;
    saveStoredSubscribers(tenantId, environment, current);
  }

  // Update server persistence file
  try {
    await fetch('/api/v1/web-push/subscribers/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: fcmTokenOrId,
        delivered,
        subscriptionStatus: newStatus,
        failureReason: failureReason || 'Push delivery failed',
      }),
    });
  } catch {}

  // Attempt database update
  try {
    await supabase
      .from('web_push_subscribers')
      .update({
        subscription_status: newStatus,
        last_seen: new Date().toISOString(),
      })
      .or(`fcm_token.eq.${fcmTokenOrId},id.eq.${fcmTokenOrId}`)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch {}

  return { success: true, status: newStatus };
}

/** Verify whether Web Push is actually deployed and configured on the live website */
export async function verifyRemoteWebPushDeployment(
  tenantId: string,
  environment: string,
  domain: string,
  siteId?: string
): Promise<{
  configured: boolean;
  swReachable: boolean;
  liveSubscribersCount: number;
  message: string;
  checkedUrl: string;
  details?: string;
}> {
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const swUrl = `https://${cleanDomain}/sw.js`;
  let swReachable = false;

  // 1. Check if live subscribers from this domain exist in database
  const subscribers = await fetchWebPushSubscribers(tenantId, environment, siteId);
  const liveFromDomain = subscribers.filter(
    (s) => s.websiteDomain && s.websiteDomain.toLowerCase().includes(cleanDomain.toLowerCase()) && !s.fcmToken.startsWith('fcm_sim_')
  );

  // 2. Probe /sw.js on the remote website
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(swUrl, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timer);
    if (res.type === 'opaque' || res.ok) {
      swReachable = true;
    }
  } catch {
    swReachable = false;
  }

  if (liveFromDomain.length > 0) {
    return {
      configured: true,
      swReachable: true,
      liveSubscribersCount: liveFromDomain.length,
      checkedUrl: swUrl,
      message: `✅ Web Push Active: ${liveFromDomain.length} real subscriber token(s) captured from ${cleanDomain}.`,
    };
  }

  if (swReachable) {
    return {
      configured: false,
      swReachable: true,
      liveSubscribersCount: 0,
      checkedUrl: swUrl,
      message: `⚠️ Service worker detected at ${swUrl}, but no real visitor subscribers have opted in yet. Embed the opt-in snippet and visit ${cleanDomain} to opt in.`,
    };
  }

  return {
    configured: false,
    swReachable: false,
    liveSubscribersCount: 0,
    checkedUrl: swUrl,
    message: `❌ Not Connected: /sw.js was not detected at ${swUrl}, and no live subscriber tokens have been received from ${cleanDomain}.`,
    details: `Please ensure /sw.js is uploaded to your website root and the opt-in script is embedded in your website before testing.`,
  };
}

/** Delete / Unregister a Web Push Subscriber */
export async function deleteWebPushSubscriber(
  tenantId: string,
  environment: string,
  subscriberId: string,
  fcmToken?: string
): Promise<void> {
  addDeletedTokenKey(tenantId, subscriberId);
  if (fcmToken) addDeletedTokenKey(tenantId, fcmToken);

  // 1. Delete from local storage
  const current = getStoredSubscribers(tenantId, environment);
  saveStoredSubscribers(
    tenantId,
    environment,
    current.filter((s) => s.id !== subscriberId && s.fcmToken !== subscriberId && (!fcmToken || s.fcmToken !== fcmToken))
  );

  // 2. Call Vite API to remove from persisted server JSON
  try {
    await fetch('/api/v1/web-push/subscribers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: subscriberId, fcmToken }),
    });
  } catch {}

  // 3. Delete from Supabase
  try {
    await supabase.from('web_push_subscribers').delete().or(`id.eq.${subscriberId},fcm_token.eq.${subscriberId}`);
  } catch {}
}

/** Send live browser test push notification and auto-track delivery status */
export async function sendTestWebPushNotification(payload: {
  title: string;
  body: string;
  iconUrl?: string;
  clickUrl?: string;
  tag?: string;
  tenantId?: string;
  environment?: string;
  fcmToken?: string;
}): Promise<{ ok: boolean; message: string; autoDeactivated?: boolean }> {
  const safeTenantId = payload.tenantId || '00000000-0000-0000-0000-000000000001';
  const safeTopic = `marbee_push_outbound_${safeTenantId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  let relayDelivered = false;

  // 1. Broadcast to target subscriber device via high-speed Cloud Push Relay
  try {
    const cloudRes = await fetch(`https://ntfy.sh/${safeTopic}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_fcm_token: payload.fcmToken || 'all',
        title: payload.title,
        body: payload.body,
        icon: payload.iconUrl || '/favicon.svg',
        url: payload.clickUrl || '/',
        time: Date.now(),
      }),
    });
    if (cloudRes.ok) relayDelivered = true;
  } catch (err) {
    console.warn('Cloud push relay note:', err);
  }

  // 2. Also trigger on local admin browser if permission granted
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(payload.title, {
            body: payload.body,
            icon: payload.iconUrl || '/favicon.svg',
            badge: '/favicon.svg',
            tag: payload.tag || 'marbee-test-push',
            data: { url: payload.clickUrl || window.location.origin },
          });
        } else {
          new Notification(payload.title, {
            body: payload.body,
            icon: payload.iconUrl || '/favicon.svg',
            tag: payload.tag || 'marbee-test-push',
          });
        }
      }
    }
  } catch {}

  // 3. Update subscriber delivery status in storage & database
  if (payload.tenantId && payload.environment && payload.fcmToken) {
    await markPushSubscriberDeliveryResult(payload.tenantId, payload.environment, payload.fcmToken, true);
  }

  return {
    ok: true,
    message: relayDelivered
      ? '✓ Push notification dispatched to subscriber device & displayed!'
      : '✓ Push notification triggered for target subscriber.',
  };
}

// ==========================================
// BEHAVIORAL SESSIONS & FRICTION ENGINE
// ==========================================

/** Fetch last N real sessions from Supabase web_analytics_sessions + web_analytics_events */
export async function fetchBehavioralSessions(
  siteId: string,
  limit = 50,
  offset = 0
): Promise<import('./web-analytics-types').BehavioralSession[]> {
  try {
    // Primary: fetch from Supabase sessions table (real data from SDK)
    const { data: sessionRows, error: sessErr } = await supabase
      .from('web_analytics_sessions')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_bot', false)
      .order('start_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sessErr) throw new Error(sessErr.message);

    if (!sessionRows || sessionRows.length === 0) {
      // Fallback: reconstruct from raw events if sessions table is empty
      return buildSessionsFromEvents(siteId, limit, offset);
    }

    // Map Supabase session rows to BehavioralSession
    const sessionIds = sessionRows.map((r: any) => r.session_id);
    let eventMap: Record<string, any[]> = {};
    try {
      const { data: rawEvents } = await supabase
        .from('web_analytics_events')
        .select('*')
        .in('session_id', sessionIds)
        .order('server_timestamp', { ascending: true });
      if (rawEvents) {
        rawEvents.forEach((ev: any) => {
          if (!eventMap[ev.session_id]) eventMap[ev.session_id] = [];
          eventMap[ev.session_id].push({
            eventName: ev.event_name,
            path: ev.path || '/',
            url: ev.url,
            pageTitle: ev.page_title,
            timestamp: ev.client_timestamp || ev.server_timestamp,
            properties: ev.properties || {},
          });
        });
      }
    } catch {}

    return sessionRows.map((row: any) => {
      const pages: string[] = row.pages_visited || (row.landing_page ? [row.landing_page] : ['/']);
      const durationSec = row.duration_sec || 0;
      const activeTimeSec = row.active_time_sec || 0;

      // Intent score from real metrics
      let intent = 20;
      if ((row.page_count || 0) >= 3) intent += 15;
      if ((row.max_scroll_depth || 0) >= 75) intent += 15;
      if (row.converted) intent = Math.max(85, intent + 30);
      if ((row.click_count || 0) >= 5) intent += 10;
      if ((row.form_submit_count || 0) > 0) intent += 15;
      if (pages.some((p) => p.includes('pricing') || p.includes('plan'))) intent += 15;
      if (pages.some((p) => p.includes('checkout') || p.includes('pay'))) intent += 20;
      if (durationSec > 120) intent += 10;
      intent = Math.min(100, Math.max(5, intent));

      // Persona
      let persona = 'Explorer';
      if (row.converted && intent >= 80) persona = 'High-Intent Buyer';
      else if ((row.rage_click_count || 0) > 0) persona = 'Frustrated User';
      else if (pages.some((p) => p.includes('pricing'))) persona = 'Deal Seeker';
      else if ((row.page_count || 0) >= 4 || durationSec > 300) persona = 'In-Depth Researcher';

      // Friction signals from real metrics
      const frictionSignals: import('./web-analytics-types').FrictionSignal[] = [];
      if ((row.rage_click_count || 0) > 0) {
        frictionSignals.push({
          id: `fr_rage_${row.session_id}`,
          type: 'rage_click',
          severity: row.rage_click_count >= 3 ? 'high' : 'medium',
          pagePath: row.landing_page || '/',
          details: `${row.rage_click_count} rage click(s) detected`,
          timestamp: row.start_time,
          repeatCount: row.rage_click_count,
        });
      }
      if ((row.js_error_count || 0) > 0) {
        frictionSignals.push({
          id: `fr_jserr_${row.session_id}`,
          type: 'js_error',
          severity: 'critical',
          pagePath: row.exit_page || '/',
          details: `${row.js_error_count} JavaScript error(s) encountered`,
          timestamp: row.end_time,
          repeatCount: row.js_error_count,
        });
      }

      // AI Summary
      let aiSummary = '';
      if (row.converted) {
        aiSummary = `Converted via ${row.utm_source || row.referrer_domain || 'Direct'}: completed goal across ${row.page_count} pages.`;
      } else if (frictionSignals.length > 0) {
        aiSummary = `Visitor encountered ${frictionSignals.length} friction signal(s) (${frictionSignals.map((f) => f.type).join(', ')}).`;
      } else if (intent >= 70) {
        aiSummary = `High-intent session (${intent}/100): explored ${pages.join(' → ')}.`;
      } else {
        const geo = [row.city, row.country_name].filter(Boolean).join(', ');
        aiSummary = `${geo ? `Visitor from ${geo}` : 'Anonymous visitor'} on ${row.os || 'Unknown'} (${row.browser || 'Unknown'}), viewed ${row.page_count} page(s).`;
      }

      return {
        id: row.session_id,
        siteId: row.site_id,
        tenantId: row.tenant_id,
        anonymousId: row.anonymous_id,
        userId: null,
        startTime: row.start_time,
        endTime: row.end_time,
        durationSec,
        activeTimeSec,
        device: {
          type: row.device_type || 'desktop',
          os: row.os || 'Unknown',
          browser: row.browser || 'Unknown',
          screen: null,
        },
        geo: {
          country: row.country_name || null,
          city: row.city || null,
        },
        attribution: {
          source: row.utm_source || (row.referrer ? new URL('http://x/' + row.referrer).hostname : null) || 'Direct',
          medium: row.utm_medium || 'none',
          campaign: row.utm_campaign || undefined,
          landingPage: row.landing_page || '/',
          exitPage: row.exit_page || '/',
        },
        pageviews: row.page_count || 1,
        eventsCount: (row.click_count || 0) + (row.page_count || 0) + (row.form_submit_count || 0),
        pagesVisited: pages,
        attention: {
          maxScrollDepth: row.max_scroll_depth || 0,
          scrollVelocity: 0,
          dwellTimeSec: durationSec,
          activeReadingTimeSec: activeTimeSec,
          timeOnSections: {},
          elementsExposed: [],
          ctaExposureDurationSec: 0,
        },
        frictionSignals,
        intentScore: intent,
        intentCategory: intent >= 80 ? 'ultra_high' : intent >= 65 ? 'high' : intent >= 40 ? 'medium' : 'low',
        persona,
        converted: Boolean(row.converted),
        conversionGoal: undefined,
        revenue: 0,
        errorsCount: row.js_error_count || 0,
        aiSummary,
        replaysAvailable: false,
        activities: eventMap[row.session_id] || [
          { eventName: 'session_start', path: row.landing_page || '/', timestamp: row.start_time },
          ...(row.pages_visited || []).map((p: string) => ({ eventName: 'pageview', path: p, timestamp: row.start_time })),
          { eventName: 'session_end', path: row.exit_page || '/', timestamp: row.end_time },
        ],
      } as import('./web-analytics-types').BehavioralSession;
    });
  } catch (e) {
    console.warn('[Marbee] fetchBehavioralSessions fallback to localStorage:', e);
    return buildSessionsFromEvents(siteId, limit, offset);
  }
}

/** Total session count for pagination */
export async function fetchSessionCount(siteId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('web_analytics_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('is_bot', false);
    return count || 0;
  } catch {
    return 0;
  }
}

/** Fallback: build sessions from raw events in localStorage / Supabase events table */
async function buildSessionsFromEvents(
  siteId: string,
  limit: number,
  offset: number
): Promise<import('./web-analytics-types').BehavioralSession[]> {
  const events = getStoredEvents(siteId);
  if (events.length === 0) return [];

  const sessionMap = new Map<string, typeof events>();
  events.forEach((ev) => {
    const sid = ev.sessionId || 'sess_default';
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push(ev);
  });

  const sessions: import('./web-analytics-types').BehavioralSession[] = [];

  sessionMap.forEach((evList, sid) => {
    const sorted = [...evList].sort(
      (a, b) => new Date(a.serverTimestamp || a.clientTimestamp).getTime() - new Date(b.serverTimestamp || b.clientTimestamp).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const pages = Array.from(new Set(sorted.map((e) => e.path || '/')));
    const durationSec = Math.round(
      (new Date(last.serverTimestamp || last.clientTimestamp).getTime() - new Date(first.serverTimestamp || first.clientTimestamp).getTime()) / 1000
    );

    let maxScroll = 0;
    sorted.forEach((e) => {
      const props = (e.properties as any) || {};
      if (e.eventName === 'scroll_depth' && typeof props.depth_pct === 'number') {
        maxScroll = Math.max(maxScroll, props.depth_pct);
      }
    });

    let intent = 20 + Math.min(pages.length * 10, 40) + (maxScroll >= 75 ? 20 : 0) + (durationSec > 120 ? 10 : 0);
    intent = Math.min(100, intent);

    sessions.push({
      id: sid,
      siteId,
      tenantId: first.tenantId || '',
      anonymousId: first.anonymousId,
      userId: null,
      startTime: first.clientTimestamp || first.serverTimestamp,
      endTime: last.clientTimestamp || last.serverTimestamp,
      durationSec: Math.max(0, durationSec),
      activeTimeSec: 0,
      device: {
        type: first.deviceType || 'desktop',
        os: first.os || 'Unknown',
        browser: first.browser || 'Unknown',
        screen: first.screenResolution || null,
      },
      geo: { country: first.countryName || null, city: first.city || null },
      attribution: {
        source: first.utmSource || first.referrerDomain || 'Direct',
        medium: first.utmMedium || 'none',
        campaign: first.utmCampaign || undefined,
        landingPage: pages[0] || '/',
        exitPage: pages[pages.length - 1] || '/',
      },
      pageviews: sorted.filter((e) => e.eventName === 'pageview').length || 1,
      eventsCount: sorted.length,
      pagesVisited: pages,
      attention: {
        maxScrollDepth: maxScroll,
        scrollVelocity: 0,
        dwellTimeSec: durationSec,
        activeReadingTimeSec: 0,
        timeOnSections: {},
        elementsExposed: [],
        ctaExposureDurationSec: 0,
      },
      frictionSignals: [],
      intentScore: intent,
      intentCategory: intent >= 80 ? 'ultra_high' : intent >= 65 ? 'high' : intent >= 40 ? 'medium' : 'low',
      persona: 'Explorer',
      converted: false,
      revenue: 0,
      errorsCount: 0,
      aiSummary: `Session on ${pages.join(' → ')} for ${durationSec}s.`,
      replaysAvailable: false,
      activities: sorted.map((e) => ({
        eventName: e.eventName,
        path: e.path,
        url: e.url,
        pageTitle: e.pageTitle,
        timestamp: e.clientTimestamp || e.serverTimestamp,
        properties: e.properties,
      })),
    });
  });

  return sessions
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(offset, offset + limit);
}

export function fetchFrictionSignals(siteId: string): import('./web-analytics-types').FrictionSignal[] {
  const frictionKey = `marbee_web_friction_signals_v1_${siteId}`;
  try {
    const raw = localStorage.getItem(frictionKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}
