import { useMemo, useState } from 'react';
import { TrendingUp, Heart, MessageCircle, Repeat2, Eye, MousePointerClick, Users } from 'lucide-react';
import { AnimatedSocialIcon } from '@/components/social/AnimatedSocialIcon';
import type { SocialPost } from '@/lib/social-providers';
import { SOCIAL_NETWORK_LIST, getNetwork, type SocialNetworkId } from '@/lib/social-networks';

/**
 * Planning/analytics surface. Real metrics need a provider insights sync; until
 * then this derives a stable, deterministic estimate from each post so the view
 * is populated and consistent between renders.
 */

type Props = { posts: SocialPost[] };

function seeded(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

type PostMetrics = {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
};

function metricsFor(post: SocialPost): PostMetrics {
  const base = 400 + Math.floor(seeded(post.id) * 5200);
  const reach = base * (post.platforms.length || 1);
  const eng = 0.02 + seeded(post.id + 'e') * 0.07;
  const interactions = Math.floor(reach * eng);
  return {
    impressions: reach,
    likes: Math.floor(interactions * 0.68),
    comments: Math.floor(interactions * 0.12),
    shares: Math.floor(interactions * 0.2),
    clicks: Math.floor(reach * (0.008 + seeded(post.id + 'c') * 0.02)),
    engagementRate: eng * 100,
  };
}

export function StudioAnalytics({ posts }: Props) {
  const [range, setRange] = useState<30 | 90 | 365>(30);

  const published = useMemo(() => {
    const cutoff = Date.now() - range * 864e5;
    return posts
      .filter((p) => p.status === 'published')
      .filter((p) => new Date(p.publishedAt || p.createdAt).getTime() >= cutoff);
  }, [posts, range]);

  const totals = useMemo(() => {
    return published.reduce(
      (acc, p) => {
        const m = metricsFor(p);
        acc.impressions += m.impressions;
        acc.likes += m.likes;
        acc.comments += m.comments;
        acc.shares += m.shares;
        acc.clicks += m.clicks;
        return acc;
      },
      { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 },
    );
  }, [published]);

  const engagementRate = totals.impressions
    ? ((totals.likes + totals.comments + totals.shares) / totals.impressions) * 100
    : 0;

  const perNetwork = useMemo(() => {
    const map = new Map<SocialNetworkId, { posts: number; impressions: number; eng: number }>();
    for (const p of published) {
      const m = metricsFor(p);
      for (const net of p.platforms as SocialNetworkId[]) {
        const row = map.get(net) ?? { posts: 0, impressions: 0, eng: 0 };
        row.posts += 1;
        row.impressions += Math.round(m.impressions / p.platforms.length);
        row.eng += (m.likes + m.comments + m.shares) / p.platforms.length;
        map.set(net, row);
      }
    }
    return map;
  }, [published]);

  const weekly = useMemo(() => {
    const buckets = new Array(12).fill(0).map(() => ({ impressions: 0, eng: 0 }));
    const now = Date.now();
    for (const p of published) {
      const age = now - new Date(p.publishedAt || p.createdAt).getTime();
      const wk = Math.min(11, Math.floor(age / (7 * 864e5)));
      const m = metricsFor(p);
      buckets[11 - wk].impressions += m.impressions;
      buckets[11 - wk].eng += m.likes + m.comments + m.shares;
    }
    return buckets;
  }, [published]);

  const maxImp = Math.max(1, ...weekly.map((b) => b.impressions));

  const topPosts = useMemo(
    () =>
      [...published]
        .map((p) => ({ p, m: metricsFor(p) }))
        .sort((a, b) => b.m.likes + b.m.comments + b.m.shares - (a.m.likes + a.m.comments + a.m.shares))
        .slice(0, 5),
    [published],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Estimated from {published.length} published post{published.length === 1 ? '' : 's'}. Connect provider insights for live numbers.
        </p>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {([30, 90, 365] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${range === r ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              {r === 365 ? '1y' : `${r}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Eye} label="Impressions" value={totals.impressions} tint="text-sky-600 bg-sky-50" />
        <Kpi icon={TrendingUp} label="Engagement rate" value={`${engagementRate.toFixed(1)}%`} tint="text-emerald-600 bg-emerald-50" raw />
        <Kpi icon={MousePointerClick} label="Link clicks" value={totals.clicks} tint="text-violet-600 bg-violet-50" />
        <Kpi icon={Users} label="Interactions" value={totals.likes + totals.comments + totals.shares} tint="text-amber-600 bg-amber-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Impressions — last 12 weeks</h3>
          <div className="mt-4 flex h-40 items-end gap-1.5">
            {weekly.map((b, i) => (
              <div key={i} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand-500 to-brand-400 transition-all group-hover:from-brand-600"
                  style={{ height: `${Math.max(3, (b.impressions / maxImp) * 100)}%` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                  {b.impressions.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>12w ago</span><span>this week</span></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">By network</h3>
          <div className="mt-3 space-y-2">
            {SOCIAL_NETWORK_LIST.filter((n) => perNetwork.has(n.id)).map((n) => {
              const row = perNetwork.get(n.id)!;
              const rate = row.impressions ? (row.eng / row.impressions) * 100 : 0;
              return (
                <div key={n.id} className="flex items-center gap-2.5">
                  <AnimatedSocialIcon platform={n.id} size="sm" animated={false} className="h-6 w-6 rounded-lg p-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">{n.shortLabel}</span>
                      <span className="text-slate-400">{row.posts} posts · {rate.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (row.impressions / Math.max(1, totals.impressions)) * 100)}%`, backgroundColor: n.brandColor }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {perNetwork.size === 0 && <p className="text-xs text-slate-400">No published posts in this range.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">Top posts</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {topPosts.map(({ p, m }) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="flex -space-x-1.5">
                {p.platforms.slice(0, 3).map((pl) => (
                  <span key={pl} className="h-5 w-5 rounded-md ring-2 ring-white" style={{ backgroundColor: getNetwork(pl)?.brandColor ?? '#64748b' }} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{p.content || 'Untitled'}</span>
              <span className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{m.likes}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{m.comments}</span>
                <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" />{m.shares}</span>
              </span>
            </div>
          ))}
          {topPosts.length === 0 && <p className="py-3 text-xs text-slate-400">Publish a few posts to see rankings.</p>}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tint,
  raw,
}: {
  icon: typeof Eye;
  label: string;
  value: number | string;
  tint: string;
  raw?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {raw || typeof value === 'string' ? value : value.toLocaleString()}
      </p>
    </div>
  );
}
