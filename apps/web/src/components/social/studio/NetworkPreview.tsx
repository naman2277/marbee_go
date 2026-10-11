import { useState, type ReactElement } from 'react';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  Bookmark,
  ThumbsUp,
  Globe,
  MoreHorizontal,
  Play,
  ChevronLeft,
  ChevronRight,
  MapPin,
  BarChart2,
  Repeat,
  Share,
  Plus,
  Search,
} from 'lucide-react';
import type { MediaItem } from '@/lib/social-studio';
import { getNetwork, type SocialNetworkId } from '@/lib/social-networks';

export type PreviewInput = {
  network: SocialNetworkId;
  caption: string;
  media: MediaItem[];
  link?: string;
  firstComment?: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  poll?: { question: string; options: string[] } | null;
  location?: string;
  threadParts?: string[];
  title?: string;
  igMediaType?: 'IMAGE' | 'CAROUSEL' | 'REELS' | 'STORIES';
};

function Avatar({ url, name, className = 'h-9 w-9', gradient }: { url?: string; name: string; className?: string; gradient?: string }) {
  if (url) return <img src={url} alt={name} className={`${className} rounded-full object-cover`} />;
  return (
    <div
      className={`${className} rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-tr ${gradient ?? 'from-slate-500 to-slate-700'}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function MediaFrame({
  media,
  aspect,
  rounded = 'rounded-lg',
}: {
  media: MediaItem[];
  aspect: string;
  rounded?: string;
}) {
  const [i, setI] = useState(0);
  if (media.length === 0) return null;
  const item = media[Math.min(i, media.length - 1)];
  return (
    <div className={`relative overflow-hidden ${rounded} border border-black/5 bg-slate-100 ${aspect}`}>
      {item.kind === 'video' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <img src={item.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
          <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 fill-slate-900 text-slate-900" />
          </span>
        </div>
      ) : (
        <img src={item.url} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
      )}
      {media.length > 1 && (
        <>
          <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
            {i + 1}/{media.length}
          </div>
          {i > 0 && (
            <button type="button" onClick={() => setI((p) => p - 1)} className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {i < media.length - 1 && (
            <button type="button" onClick={() => setI((p) => p + 1)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LinkedInCard(p: PreviewInput) {
  const text = p.caption.trim() || 'Your LinkedIn commentary will show up here…';
  return (
    <div className="w-full max-w-[440px] rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-900 shadow-sm">
      <div className="mb-2 flex items-start gap-2.5">
        <Avatar url={p.avatarUrl} name={p.displayName} gradient="from-[#0A66C2] to-sky-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{p.displayName}</p>
          <p className="truncate text-[11px] text-slate-500">Marketing · Follower updates</p>
          <p className="flex items-center gap-1 text-[11px] text-slate-400">Now · <Globe className="h-3 w-3" /></p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mb-3 whitespace-pre-line leading-relaxed">{text}</p>
      {p.poll ? (
        <div className="mb-3 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[13px] font-semibold">{p.poll.question || 'Poll question'}</p>
          {p.poll.options.map((o, i) => (
            <div key={i} className="rounded-lg border border-[#0A66C2]/30 bg-white px-3 py-1.5 text-[12px] font-medium text-[#0A66C2]">
              {o || `Option ${i + 1}`}
            </div>
          ))}
        </div>
      ) : (
        <MediaFrame media={p.media} aspect="aspect-[1.91/1]" />
      )}
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[12px] font-medium text-slate-500">
        {['Like', 'Comment', 'Repost', 'Send'].map((a, i) => (
          <span key={a} className="flex items-center gap-1.5">
            {[<ThumbsUp key="a" className="h-4 w-4" />, <MessageCircle key="b" className="h-4 w-4" />, <Repeat2 key="c" className="h-4 w-4" />, <Send key="d" className="h-4 w-4" />][i]}
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

function XCard(p: PreviewInput) {
  const parts = [p.caption.trim() || 'What’s happening?', ...(p.threadParts ?? []).filter(Boolean)];
  return (
    <div className="w-full max-w-[440px] rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-900 shadow-sm">
      {parts.map((t, idx) => (
        <div key={idx} className={`flex gap-3 ${idx > 0 ? 'mt-1 border-t border-slate-100 pt-3' : ''}`}>
          <div className="flex flex-col items-center">
            <Avatar url={p.avatarUrl} name={p.displayName} className="h-9 w-9" gradient="from-slate-700 to-black" />
            {idx < parts.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[12px]">
              <span className="font-bold text-slate-900">{p.displayName}</span>
              <span className="text-slate-500">@{p.handle}</span>
              <span className="text-slate-400">· now</span>
            </p>
            <p className="mt-0.5 whitespace-pre-line leading-relaxed">{t}</p>
            {idx === 0 && <div className="mt-2"><MediaFrame media={p.media} aspect="aspect-[16/9]" rounded="rounded-2xl" /></div>}
            {idx === 0 && p.poll && (
              <div className="mt-2 space-y-1.5">
                {p.poll.options.map((o, i) => (
                  <div key={i} className="rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-sky-600">{o || `Choice ${i + 1}`}</div>
                ))}
              </div>
            )}
            <div className="mt-2 flex max-w-[240px] items-center justify-between text-slate-500">
              <MessageCircle className="h-4 w-4" /><Repeat2 className="h-4 w-4" /><Heart className="h-4 w-4" /><BarChart2 className="h-4 w-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InstagramCard(p: PreviewInput) {
  const vertical = p.igMediaType === 'REELS' || p.igMediaType === 'STORIES';
  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-[13px] text-slate-900 shadow-lg">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 p-[2px]">
            <Avatar url={p.avatarUrl} name={p.displayName} className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[12px] font-bold leading-tight">{p.handle}</p>
            {p.location && <p className="flex items-center gap-0.5 text-[10px] text-slate-500"><MapPin className="h-2.5 w-2.5" />{p.location}</p>}
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-400" />
      </div>
      {p.media.length > 0 ? (
        <MediaFrame media={p.media} aspect={vertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-square'} rounded="rounded-none" />
      ) : (
        <div className={`flex items-center justify-center bg-slate-900 text-slate-400 ${vertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-square'}`}>
          <span className="text-[11px]">Attach media to preview</span>
        </div>
      )}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Send className="h-5 w-5" /></div>
          <Bookmark className="h-5 w-5" />
        </div>
        <p className="text-[12px] font-bold">128 likes</p>
        <p className="whitespace-pre-line leading-relaxed"><span className="mr-1.5 font-bold">{p.handle}</span>{p.caption.trim() || 'Write a caption…'}</p>
        {p.firstComment && (
          <p className="rounded-lg bg-slate-50 p-2 text-[12px]"><span className="mr-1.5 font-semibold">{p.handle}</span><span className="text-slate-600">{p.firstComment}</span></p>
        )}
      </div>
    </div>
  );
}

function FacebookCard(p: PreviewInput) {
  return (
    <div className="w-full max-w-[440px] rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-900 shadow-sm">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar url={p.avatarUrl} name={p.displayName} gradient="from-[#1877F2] to-[#0D57C6]" />
        <div>
          <p className="font-semibold leading-tight">{p.displayName}</p>
          <p className="flex items-center gap-1 text-[11px] text-slate-400">Just now · <Globe className="h-3 w-3" /></p>
        </div>
        <MoreHorizontal className="ml-auto h-4 w-4 text-slate-400" />
      </div>
      <p className="mb-3 whitespace-pre-line leading-relaxed">{p.caption.trim() || 'Share an update with your Page…'}</p>
      <MediaFrame media={p.media} aspect="aspect-[1.91/1]" />
      {p.link && p.media.length === 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{safeHost(p.link)}</p>
          <p className="truncate text-[12px] font-medium">{p.link}</p>
        </div>
      )}
      <div className="mt-2 flex items-center justify-around border-t border-slate-100 pt-2 text-[12px] font-medium text-slate-500">
        <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" />Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" />Comment</span>
        <span className="flex items-center gap-1.5"><Share className="h-4 w-4" />Share</span>
      </div>
    </div>
  );
}

function YouTubeCard(p: PreviewInput) {
  return (
    <div className="w-full max-w-[440px] overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 shadow-sm">
      <MediaFrame media={p.media.length ? p.media : [{ url: '', kind: 'video' }]} aspect="aspect-[16/9]" rounded="rounded-none" />
      <div className="flex gap-3 p-3">
        <Avatar url={p.avatarUrl} name={p.displayName} gradient="from-[#FF0000] to-[#B80000]" />
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold leading-snug">{p.title?.trim() || p.caption.split('\n')[0] || 'Video title'}</p>
          <p className="text-[11px] text-slate-500">{p.displayName} · 0 views · now</p>
        </div>
      </div>
    </div>
  );
}

function TikTokCard(p: PreviewInput) {
  return (
    <div className="relative mx-auto w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-lg aspect-[9/16]">
      {p.media[0] ? (
        <img src={p.media[0].url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/70 to-transparent p-3 text-[12px]">
        <p className="font-bold">@{p.handle}</p>
        <p className="line-clamp-3 whitespace-pre-line">{p.caption.trim() || 'Your caption + #hashtags'}</p>
      </div>
      <div className="absolute bottom-4 right-2 flex flex-col items-center gap-3 text-white">
        <Heart className="h-6 w-6" /><MessageCircle className="h-6 w-6" /><Bookmark className="h-6 w-6" /><Share className="h-6 w-6" />
      </div>
    </div>
  );
}

function PinterestCard(p: PreviewInput) {
  return (
    <div className="w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-[13px] shadow-md">
      <MediaFrame media={p.media.length ? p.media : [{ url: '', kind: 'image' }]} aspect="aspect-[2/3]" rounded="rounded-none" />
      <div className="p-3">
        <p className="font-semibold leading-snug">{p.title?.trim() || p.caption.split('\n')[0] || 'Pin title'}</p>
        <p className="mt-1 line-clamp-2 text-[12px] text-slate-500">{p.caption.trim()}</p>
        {p.link && <p className="mt-1 truncate text-[11px] text-slate-400">{safeHost(p.link)}</p>}
      </div>
    </div>
  );
}

function ThreadsCard(p: PreviewInput) {
  const parts = [p.caption.trim() || 'Start a thread…', ...(p.threadParts ?? []).filter(Boolean)];
  return (
    <div className="w-full max-w-[440px] rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-900 shadow-sm">
      {parts.map((t, idx) => (
        <div key={idx} className={`flex gap-3 ${idx > 0 ? 'mt-1 pt-3' : ''}`}>
          <div className="flex flex-col items-center">
            <Avatar url={p.avatarUrl} name={p.displayName} className="h-8 w-8" gradient="from-slate-700 to-black" />
            {idx < parts.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold">{p.handle} <span className="ml-1 font-normal text-slate-400">· now</span></p>
            <p className="mt-0.5 whitespace-pre-line leading-relaxed">{t}</p>
            {idx === 0 && <div className="mt-2"><MediaFrame media={p.media} aspect="aspect-square" rounded="rounded-xl" /></div>}
            <div className="mt-2 flex items-center gap-4 text-slate-500"><Heart className="h-4 w-4" /><MessageCircle className="h-4 w-4" /><Repeat className="h-4 w-4" /><Send className="h-4 w-4" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

const RENDERERS: Record<SocialNetworkId, (p: PreviewInput) => ReactElement> = {
  linkedin: LinkedInCard,
  x: XCard,
  instagram: InstagramCard,
  facebook: FacebookCard,
  youtube: YouTubeCard,
  tiktok: TikTokCard,
  pinterest: PinterestCard,
  threads: ThreadsCard,
};

export function NetworkPreview({ input, framed = true }: { input: PreviewInput; framed?: boolean }) {
  const Renderer = RENDERERS[input.network] ?? LinkedInCard;
  const net = getNetwork(input.network);
  const card = <Renderer {...input} />;
  if (!framed) return card;
  return (
    <div className="relative mx-auto w-fit">
      <div className="rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 p-2 shadow-2xl">
        <div className="mx-auto mb-1 h-1.5 w-16 rounded-full bg-slate-700" />
        <div className="max-h-[560px] w-[300px] overflow-y-auto rounded-[1.4rem] bg-slate-50 p-2 sm:w-[360px]">
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold text-slate-400">
            <span>{net?.label}</span>
            <span className="flex items-center gap-1"><Search className="h-3 w-3" /><Plus className="h-3 w-3" /></span>
          </div>
          {card}
        </div>
      </div>
    </div>
  );
}
