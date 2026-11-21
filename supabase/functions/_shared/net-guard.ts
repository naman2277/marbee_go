// Outbound request guard against SSRF (Phase 0 · SEC-08).
//
// Any edge function that fetches a URL supplied by a tenant (connector tests, outbound
// webhooks, API lookups) must call assertPublicHttpUrl() first and fetch with
// redirect: 'manual'. Otherwise a tenant could make Marbee's servers reach internal
// services — e.g. the cloud metadata endpoint 169.254.169.254, localhost admin ports,
// or other hosts inside the provider's network.

export class BlockedUrlError extends Error {}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inCidr(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** True for loopback, private, link-local (incl. cloud metadata), CGNAT, multicast, reserved. */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4ToInt(a);
  if (v4 !== null) return PRIVATE_V4.some(([base, bits]) => inCidr(v4, base, bits));
  if (!a.includes(':')) return false;
  // IPv6
  if (a === '::' || a === '::1') return true;
  // IPv4-mapped (::ffff:a.b.c.d) — URL parsing normalises it to hex (::ffff:7f00:1).
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // IPv4-compatible / NAT64 forms embedding an IPv4 address: treat as private to be safe.
  if (/^::(ffff:0:)?[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a) || a.startsWith('64:ff9b:')) return true;
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

function isIpLiteral(host: string): boolean {
  return ipv4ToInt(host) !== null || host.includes(':');
}

/**
 * Throws BlockedUrlError unless `raw` is an http(s) URL to a public host.
 * Resolves the hostname (when the runtime allows) and rejects if ANY address is private,
 * which also stops "public name → internal IP" tricks at check time.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BlockedUrlError('Only http(s) URLs are allowed');
  if (url.username || url.password) throw new BlockedUrlError('URLs with embedded credentials are not allowed');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new BlockedUrlError('URL has no host');
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new BlockedUrlError('Internal hostnames are not allowed');
  }
  if (isIpLiteral(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError('Private or internal IP addresses are not allowed');
    return url;
  }
  if (!host.includes('.')) throw new BlockedUrlError('Single-label hostnames are not allowed');

  // deno-lint-ignore no-explicit-any
  const resolve = (globalThis as any).Deno?.resolveDns as undefined | ((h: string, t: string) => Promise<string[]>);
  if (resolve) {
    const addrs: string[] = [];
    for (const type of ['A', 'AAAA']) {
      try { addrs.push(...await resolve(host, type)); } catch { /* no records of this type */ }
    }
    if (addrs.length === 0) throw new BlockedUrlError('Hostname does not resolve');
    if (addrs.some(isPrivateAddress)) throw new BlockedUrlError('Hostname resolves to a private or internal address');
  }
  return url;
}
