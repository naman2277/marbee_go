import React, { useState } from 'react';
import {
  ThumbsUp,
  MessageSquare,
  Repeat2,
  Send,
  Heart,
  Bookmark,
  Share2,
  Globe,
  MoreHorizontal,
  ExternalLink,
  MessageCircle,
  BarChart2,
  Sparkles,
  CheckCircle2,
  Vote,
  MapPin,
  Music,
  Layers,
  ChevronLeft,
  ChevronRight,
  Film,
} from 'lucide-react';
import type { SocialPlatform, LinkedInPostOptions, InstagramPostOptions } from '@/lib/social-providers';

type Props = {
  platform: SocialPlatform;
  content: string;
  mediaUrls?: string[];
  linkUrl?: string;
  accountName?: string;
  linkedinOptions?: LinkedInPostOptions;
  instagramOptions?: InstagramPostOptions;
};

export function SocialPostPreviewMockup({
  platform,
  content,
  mediaUrls = [],
  linkUrl,
  accountName = 'Marbee Marketing',
  linkedinOptions,
  instagramOptions,
}: Props) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const displayContent = content.trim() || 'Your post content will appear here...';
  const hasMedia = mediaUrls.length > 0;
  const firstMedia = mediaUrls[0];

  if (platform === 'linkedin') {
    const isPoll = linkedinOptions?.postType === 'poll' && (linkedinOptions.poll?.options?.length ?? 0) >= 2;
    const isReshare = linkedinOptions?.postType === 'reshare' && Boolean(linkedinOptions.reshareParentUrn);
    const isArticle = (linkedinOptions?.postType === 'article' || Boolean(linkedinOptions?.article?.source)) && Boolean(linkedinOptions?.article?.title);
    const hasCta = Boolean(linkedinOptions?.cta?.label && linkedinOptions.cta.landingPageUrl);

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left max-w-lg mx-auto text-slate-900 font-sans text-xs">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0A66C2] to-sky-400 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              {accountName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-900 text-xs">{accountName}</span>
                <span className="text-[10px] text-slate-400">• 1st</span>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-1">Official Company Updates</p>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span>Just now</span>
                <span>•</span>
                <Globe className="h-2.5 w-2.5" />
                {linkedinOptions?.visibility === 'CONNECTIONS' && (
                  <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-500">Connections</span>
                )}
              </div>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>

        {/* Commentary Content */}
        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line mb-3">
          {displayContent}
        </p>

        {/* 1. Poll View */}
        {isPoll && linkedinOptions?.poll && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 mb-1">
              <Vote className="h-4 w-4 text-[#0A66C2]" />
              <span>{linkedinOptions.poll.question || 'Poll Question'}</span>
            </div>
            <div className="space-y-1.5">
              {linkedinOptions.poll.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left rounded-lg border border-[#0A66C2]/30 bg-white px-3 py-2 text-xs font-medium text-[#0A66C2] hover:bg-[#0A66C2]/5 transition shadow-2xs"
                >
                  {opt || `Option ${i + 1}`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 pt-1 font-medium">
              Duration: {linkedinOptions.poll.duration.replace('_', ' ').toLowerCase()} • 0 votes
            </p>
          </div>
        )}

        {/* 2. Article View */}
        {isArticle && linkedinOptions?.article && (
          <a
            href={linkedinOptions.article.source}
            target="_blank"
            rel="noreferrer"
            className="mb-3 block rounded-xl border border-slate-200 overflow-hidden bg-slate-50 hover:bg-slate-100 transition shadow-2xs"
          >
            {linkedinOptions.article.thumbnail && (
              <div className="h-36 w-full bg-slate-200 overflow-hidden">
                <img
                  src={linkedinOptions.article.thumbnail}
                  alt="Article Thumbnail"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              </div>
            )}
            <div className="p-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {new URL(linkedinOptions.article.source.startsWith('http') ? linkedinOptions.article.source : `https://${linkedinOptions.article.source}`).hostname}
              </p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{linkedinOptions.article.title}</p>
              {linkedinOptions.article.description && (
                <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{linkedinOptions.article.description}</p>
              )}
            </div>
          </a>
        )}

        {/* 3. Reshare View */}
        {isReshare && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reshared Content</p>
            <p className="text-xs font-mono text-slate-700">{linkedinOptions?.reshareParentUrn}</p>
          </div>
        )}

        {/* 4. Media or Generic Link View */}
        {!isPoll && !isArticle && !isReshare && (
          hasMedia ? (
            <div className="mb-3 rounded-lg overflow-hidden border border-slate-100 bg-slate-100 max-h-64 flex items-center justify-center">
              <img src={firstMedia} alt="Post media" className="w-full h-auto object-cover max-h-64" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
            </div>
          ) : linkUrl ? (
            <a href={linkUrl} target="_blank" rel="noreferrer" className="mb-3 block rounded-lg border border-slate-200 overflow-hidden bg-slate-50 hover:bg-slate-100 transition">
              <div className="p-2.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{new URL(linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`).hostname}</p>
                <p className="text-xs font-medium text-slate-800 truncate mt-0.5">{linkUrl}</p>
              </div>
            </a>
          ) : null
        )}

        {/* LinkedIn Official CTA Button if enabled */}
        {hasCta && linkedinOptions?.cta && (
          <div className="mb-3 pt-1">
            <a
              href={linkedinOptions.cta.landingPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-[#0A66C2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#004182] transition shadow-xs"
            >
              {linkedinOptions.cta.label.replace('_', ' ')}
            </a>
          </div>
        )}

        {/* Engagement Footer */}
        <div className="border-t border-slate-100 pt-2.5 mt-2 flex items-center justify-between text-slate-500 text-[11px]">
          <button type="button" className="flex items-center gap-1.5 hover:text-[#0A66C2] transition font-medium">
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>Like</span>
          </button>
          <button type="button" className="flex items-center gap-1.5 hover:text-[#0A66C2] transition font-medium">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Comment</span>
          </button>
          <button type="button" className="flex items-center gap-1.5 hover:text-[#0A66C2] transition font-medium">
            <Repeat2 className="h-3.5 w-3.5" />
            <span>Repost</span>
          </button>
          <button type="button" className="flex items-center gap-1.5 hover:text-[#0A66C2] transition font-medium">
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        </div>
      </div>
    );
  }

  if (platform === 'instagram') {
    const isCarousel = (instagramOptions?.mediaType === 'CAROUSEL' || mediaUrls.length > 1) && mediaUrls.length > 1;
    const isReel = instagramOptions?.mediaType === 'REELS';
    const isStory = instagramOptions?.mediaType === 'STORIES';
    const handleName = accountName.toLowerCase().replace(/\s+/g, '_');

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg text-left max-w-sm mx-auto text-slate-900 font-sans text-xs">
        {/* Instagram Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 p-[2px]">
              <div className="h-full w-full rounded-full bg-white flex items-center justify-center font-bold text-xs text-slate-800">
                {accountName.charAt(0).toUpperCase()}
              </div>
            </div>
            <div>
              <span className="font-bold text-slate-900 text-xs">{handleName}</span>
              {instagramOptions?.locationName && (
                <div className="flex items-center gap-0.5 text-[10px] text-slate-500">
                  <MapPin className="h-2.5 w-2.5 text-slate-400" />
                  <span>{instagramOptions.locationName}</span>
                </div>
              )}
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>

        {/* Media Frame (Carousel / Reels / Single Image / Stories) */}
        <div className={`w-full bg-slate-900 relative flex items-center justify-center overflow-hidden ${
          isReel || isStory ? 'aspect-[9/16] max-h-96' : 'aspect-square'
        }`}>
          {hasMedia ? (
            <img
              src={isCarousel ? mediaUrls[carouselIndex] || firstMedia : firstMedia}
              alt="Instagram Media"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="text-center p-6 text-slate-400">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-rose-400 opacity-60" />
              <p className="text-xs font-semibold text-slate-200">Instagram Media</p>
              <p className="text-[10px] mt-1 text-slate-400">Attach an image or video to render preview</p>
            </div>
          )}

          {/* Carousel Arrows & Counter Badge */}
          {isCarousel && (
            <>
              <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                {carouselIndex + 1}/{mediaUrls.length}
              </div>
              {carouselIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/80"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {carouselIndex < mediaUrls.length - 1 && (
                <button
                  type="button"
                  onClick={() => setCarouselIndex((prev) => Math.min(mediaUrls.length - 1, prev + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/80"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {/* Carousel Pagination Dots */}
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
                {mediaUrls.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === carouselIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Reel Badge if Reel */}
          {isReel && (
            <div className="absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1">
              <Film className="h-3 w-3" />
              <span>Reels</span>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-slate-900 hover:text-rose-500 cursor-pointer transition" />
              <MessageCircle className="h-5 w-5 text-slate-900 cursor-pointer" />
              <Send className="h-5 w-5 text-slate-900 cursor-pointer" />
            </div>
            <Bookmark className="h-5 w-5 text-slate-900 cursor-pointer" />
          </div>

          <p className="text-[11px] font-bold text-slate-900">128 likes</p>

          <p className="text-xs text-slate-800 leading-relaxed">
            <strong className="font-bold mr-1.5 text-slate-900">{handleName}</strong>
            <span className="whitespace-pre-line">{displayContent}</span>
          </p>

          {/* First Comment if specified */}
          {instagramOptions?.firstComment && (
            <div className="rounded-lg bg-slate-50 p-2 border border-slate-100 text-xs text-slate-700">
              <strong className="font-semibold mr-1.5 text-slate-900">{handleName}</strong>
              <span className="text-slate-600">{instagramOptions.firstComment}</span>
            </div>
          )}

          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold pt-1">Just now</p>
        </div>
      </div>
    );
  }

  if (platform === 'x') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left max-w-lg mx-auto text-slate-900 font-sans text-xs">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {accountName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-900 text-xs truncate">{accountName}</span>
                <span className="text-slate-500 text-[11px]">@{accountName.toLowerCase().replace(/\s+/g, '')}</span>
                <span className="text-slate-400 text-[10px]">· Just now</span>
              </div>
              <MoreHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
            </div>

            <p className="text-xs text-slate-900 mt-1.5 leading-relaxed whitespace-pre-line">
              {displayContent}
            </p>

            {hasMedia ? (
              <div className="mt-3 rounded-2xl overflow-hidden border border-slate-100 bg-slate-100 max-h-60">
                <img src={firstMedia} alt="Tweet media" className="w-full h-auto object-cover max-h-60" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
            ) : linkUrl ? (
              <div className="mt-3 rounded-xl border border-slate-200 p-2.5 bg-slate-50">
                <p className="text-[10px] text-slate-500 truncate">{linkUrl}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-slate-500 mt-3 pt-2 text-[11px] max-w-xs">
              <button type="button" className="flex items-center gap-1 hover:text-sky-500">
                <MessageCircle className="h-3.5 w-3.5" />
                <span>0</span>
              </button>
              <button type="button" className="flex items-center gap-1 hover:text-emerald-500">
                <Repeat2 className="h-3.5 w-3.5" />
                <span>0</span>
              </button>
              <button type="button" className="flex items-center gap-1 hover:text-rose-500">
                <Heart className="h-3.5 w-3.5" />
                <span>0</span>
              </button>
              <button type="button" className="flex items-center gap-1 hover:text-sky-500">
                <BarChart2 className="h-3.5 w-3.5" />
                <span>0</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Facebook
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left max-w-lg mx-auto text-slate-900 font-sans text-xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white font-bold text-sm">
            {accountName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-semibold text-slate-900 text-xs">{accountName}</span>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span>Just now</span>
              <span>•</span>
              <Globe className="h-2.5 w-2.5" />
            </div>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-400" />
      </div>

      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line mb-3">
        {displayContent}
      </p>

      {hasMedia ? (
        <div className="mb-3 rounded-lg overflow-hidden border border-slate-100 bg-slate-100 max-h-64">
          <img src={firstMedia} alt="Facebook post media" className="w-full h-auto object-cover max-h-64" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
        </div>
      ) : linkUrl ? (
        <a href={linkUrl} target="_blank" rel="noreferrer" className="mb-3 block rounded-lg border border-slate-200 overflow-hidden bg-slate-50 hover:bg-slate-100 transition">
          <div className="p-2.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{new URL(linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`).hostname}</p>
            <p className="text-xs font-medium text-slate-800 truncate mt-0.5">{linkUrl}</p>
          </div>
        </a>
      ) : null}

      <div className="border-t border-slate-100 pt-2.5 mt-2 flex items-center justify-between text-slate-500 text-[11px]">
        <button type="button" className="flex items-center gap-1.5 hover:text-[#1877F2] transition font-medium">
          <ThumbsUp className="h-3.5 w-3.5" />
          <span>Like</span>
        </button>
        <button type="button" className="flex items-center gap-1.5 hover:text-[#1877F2] transition font-medium">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Comment</span>
        </button>
        <button type="button" className="flex items-center gap-1.5 hover:text-[#1877F2] transition font-medium">
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
}
