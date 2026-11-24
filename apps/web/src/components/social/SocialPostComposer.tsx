import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  X as CloseIcon,
  Send,
  Image as ImageIcon,
  AlertCircle,
  Eye,
  Clock,
  ChevronDown,
  Vote,
  FileText,
  MousePointerClick,
  Globe,
  Users,
  Plus,
  FolderOpen,
  Loader2,
  Folder,
  Hash,
  Calendar,
  MapPin,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui';


import {
  SOCIAL_PLATFORMS,
  LINKEDIN_CTA_OPTIONS,
  INSTAGRAM_MEDIA_TYPES,
  type SocialPlatform,
  type SocialPost,
  type LinkedInPostOptions,
  type LinkedInCtaLabel,
  type LinkedInPollDuration,
  type InstagramMediaType,
  type InstagramPostOptions,
} from '@/lib/social-providers';
import { saveSocialPost, publishSocialPost } from '@/lib/social-media';
import {
  uploadSocialMediaAsset,
  fetchAssets,
  getAssetDisplayUrl,
} from '@/lib/assets';
import { SocialPostPreviewMockup } from './SocialPostPreviewMockup';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  environment: string;
  connectedPlatforms: Set<SocialPlatform>;
  initialPost?: SocialPost | null;
  onSuccess: () => void;
};

export function SocialPostComposer({
  isOpen,
  onClose,
  tenantId,
  environment,
  connectedPlatforms,
  initialPost,
  onSuccess,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active channel context: switches between isolated LinkedIn, Instagram, X, Facebook experiences
  const [activeChannel, setActiveChannel] = useState<SocialPlatform>('linkedin');
  // Broadcast targets: which platforms receive this broadcast
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['linkedin']);

  const [content, setContent] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);

  // Media upload state
  const [, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // ----------------------------------------------------
  // LINKEDIN DEDICATED STATE
  // ----------------------------------------------------
  const [linkedinFeature, setLinkedinFeature] = useState<'none' | 'poll' | 'article' | 'cta'>('none');
  const [linkedinVisibility, setLinkedinVisibility] = useState<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [linkedinFeedDistribution, setLinkedinFeedDistribution] = useState<'MAIN_FEED' | 'NONE'>('MAIN_FEED');
  const [linkedinDisableReshare, setLinkedinDisableReshare] = useState(false);
  // Poll
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDuration, setPollDuration] = useState<LinkedInPollDuration>('THREE_DAYS');
  // Article
  const [articleTitle, setArticleTitle] = useState('');
  const [articleDesc, setArticleDesc] = useState('');
  const [articleThumb, setArticleThumb] = useState('');
  // CTA
  const [ctaLabel, setCtaLabel] = useState<LinkedInCtaLabel>('LEARN_MORE');
  const [ctaUrl, setCtaUrl] = useState('');

  // ----------------------------------------------------
  // INSTAGRAM DEDICATED STATE
  // ----------------------------------------------------
  const [instagramFeature, setInstagramFeature] = useState<'none' | 'format' | 'location' | 'comment'>('none');
  const [igMediaType, setIgMediaType] = useState<InstagramMediaType>('IMAGE');
  const [igLocation, setIgLocation] = useState('');
  const [igFirstComment, setIgFirstComment] = useState('');
  const [igShareToFeed, setIgShareToFeed] = useState(true);

  // Hashtag suggestions popover
  const [showHashtags, setShowHashtags] = useState(false);

  // Fetch assets for asset library drawer
  const { data: allAssets } = useQuery({
    queryKey: ['assets', tenantId, environment],
    queryFn: () => fetchAssets(tenantId, environment),
    enabled: isOpen && showAssetPicker,
  });

  useEffect(() => {
    if (initialPost) {
      setContent(initialPost.content || '');
      setPlatforms(initialPost.platforms || ['linkedin']);
      setActiveChannel(initialPost.platforms?.[0] || 'linkedin');
      setMediaUrls(initialPost.mediaUrls || []);
      setLinkUrl(initialPost.linkUrl || '');
      setScheduledAt(initialPost.scheduledAt ? initialPost.scheduledAt.slice(0, 16) : '');

      if (initialPost.linkedinOptions) {
        setLinkedinVisibility(initialPost.linkedinOptions.visibility || 'PUBLIC');
        setLinkedinFeedDistribution(initialPost.linkedinOptions.feedDistribution || 'MAIN_FEED');
        setLinkedinDisableReshare(Boolean(initialPost.linkedinOptions.isReshareDisabledByAuthor));

        if (initialPost.linkedinOptions.poll) {
          setLinkedinFeature('poll');
          setPollQuestion(initialPost.linkedinOptions.poll.question);
          setPollOptions(initialPost.linkedinOptions.poll.options);
          setPollDuration(initialPost.linkedinOptions.poll.duration);
        } else if (initialPost.linkedinOptions.article) {
          setLinkedinFeature('article');
          setArticleTitle(initialPost.linkedinOptions.article.title);
          setArticleDesc(initialPost.linkedinOptions.article.description || '');
          setArticleThumb(initialPost.linkedinOptions.article.thumbnail || '');
        } else if (initialPost.linkedinOptions.cta) {
          setLinkedinFeature('cta');
          setCtaLabel(initialPost.linkedinOptions.cta.label);
          setCtaUrl(initialPost.linkedinOptions.cta.landingPageUrl);
        }
      }

      if (initialPost.instagramOptions) {
        setIgMediaType(initialPost.instagramOptions.mediaType || 'IMAGE');
        setIgLocation(initialPost.instagramOptions.locationName || '');
        setIgFirstComment(initialPost.instagramOptions.firstComment || '');
        setIgShareToFeed(initialPost.instagramOptions.shareToFeed !== false);
        if (initialPost.instagramOptions.locationName) setInstagramFeature('location');
        else if (initialPost.instagramOptions.firstComment) setInstagramFeature('comment');
      }
    } else {
      setContent('');
      const defaultPlats: SocialPlatform[] =
        connectedPlatforms.size > 0 ? Array.from(connectedPlatforms) : ['linkedin', 'instagram'];
      setPlatforms(defaultPlats);
      setActiveChannel(defaultPlats[0] || 'linkedin');
      setMediaUrls([]);
      setLinkUrl('');
      setScheduledAt('');
      setError(null);
      setLinkedinFeature('none');
      setPollQuestion('');
      setPollOptions(['', '']);
      setArticleTitle('');
      setArticleDesc('');
      setArticleThumb('');
      setCtaUrl('');
      setInstagramFeature('none');
      setIgMediaType('IMAGE');
      setIgLocation('');
      setIgFirstComment('');
      setIgShareToFeed(true);
      setShowScheduleDialog(false);
    }
  }, [initialPost, isOpen, connectedPlatforms]);

  const toggleIncludePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      if (next.length === 0) return [p];
      return next;
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgressMsg('Uploading media to /Social in Assets...');
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressMsg(`Uploading ${file.name} to Assets > Social...`);
        const res = await uploadSocialMediaAsset(tenantId, environment, file);
        if (res.error) throw new Error(res.error);
        if (res.publicUrl) {
          setMediaUrls((prev) => {
            const next = [...prev, res.publicUrl!];
            if (next.length > 1 && igMediaType === 'IMAGE') setIgMediaType('CAROUSEL');
            return next;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media upload failed');
    } finally {
      setUploading(false);
      setUploadProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMediaUrl = (index: number) => {
    setMediaUrls((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length <= 1 && igMediaType === 'CAROUSEL') setIgMediaType('IMAGE');
      return next;
    });
  };


  const setPresetSchedule = (hoursFromNow: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hoursFromNow);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduledAt(val);
  };

  // Compile full LinkedIn Post Options
  const currentLinkedinOptions: LinkedInPostOptions = {
    postType: linkedinFeature === 'poll' ? 'poll' : linkedinFeature === 'article' ? 'article' : 'standard',
    visibility: linkedinVisibility,
    feedDistribution: linkedinFeedDistribution,
    isReshareDisabledByAuthor: linkedinDisableReshare,
    ...(linkedinFeature === 'cta' && ctaUrl.trim()
      ? { cta: { label: ctaLabel, landingPageUrl: ctaUrl.trim() } }
      : {}),
    ...(linkedinFeature === 'article' && (linkUrl.trim() || articleTitle.trim())
      ? {
          article: {
            source: linkUrl.trim() || 'https://marbee.io',
            title: articleTitle.trim() || linkUrl.trim(),
            description: articleDesc.trim() || undefined,
            thumbnail: articleThumb.trim() || undefined,
          },
        }
      : {}),
    ...(linkedinFeature === 'poll' && pollQuestion.trim()
      ? {
          poll: {
            question: pollQuestion.trim(),
            options: pollOptions.filter((o) => o.trim().length > 0),
            duration: pollDuration,
          },
        }
      : {}),
  };

  // Compile full Instagram Post Options
  const currentInstagramOptions: InstagramPostOptions = {
    mediaType: mediaUrls.length > 1 ? 'CAROUSEL' : igMediaType,
    locationName: igLocation.trim() || undefined,
    firstComment: igFirstComment.trim() || undefined,
    shareToFeed: igShareToFeed,
  };

  const saveMutation = useMutation({
    mutationFn: async (publishNow: boolean) => {
      setError(null);
      if (!content.trim() && linkedinFeature !== 'poll' && igMediaType !== 'STORIES') {
        throw new Error('Please enter post text or caption');
      }
      if (!platforms.length) throw new Error('Select at least one broadcast channel');

      if (platforms.includes('instagram') && mediaUrls.length === 0) {
        throw new Error('Instagram requires at least one image or video attachment');
      }

      const postId = await saveSocialPost({
        tenantId,
        environment,
        id: initialPost?.id,
        content,
        platforms,
        mediaUrls,
        linkUrl: linkUrl.trim() || undefined,
        linkedinOptions: platforms.includes('linkedin') ? currentLinkedinOptions : undefined,
        instagramOptions: platforms.includes('instagram') ? currentInstagramOptions : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: publishNow ? 'draft' : scheduledAt ? 'scheduled' : 'draft',
      });

      if (publishNow) {
        const result = await publishSocialPost(tenantId, environment, postId);
        if (!result.ok) throw new Error(result.error ?? 'Publishing failed. Please check connection credentials.');
      }

      return postId;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (!isOpen) return null;

  const currentPlatformLimit = SOCIAL_PLATFORMS.find((p) => p.id === activeChannel)?.charLimit ?? 3000;
  const isOverCharLimit = content.length > currentPlatformLimit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl rounded-2xl border border-slate-200">
        {/* Top Header: Platform Tabs + Broadcast Channel Selectors */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50/70">
          {/* Dedicated Platform Switcher Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Platform:</span>
            {SOCIAL_PLATFORMS.map((p) => {
              const isActiveTab = activeChannel === p.id;
              const isIncluded = platforms.includes(p.id);

              return (
                <div key={p.id} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveChannel(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      isActiveTab
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span>{p.label}</span>
                    {isIncluded && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Included in broadcast" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Toggle active in broadcast */}
            <button
              type="button"
              onClick={() => toggleIncludePlatform(activeChannel)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition ${
                platforms.includes(activeChannel)
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-300 bg-white text-slate-500'
              }`}
            >
              {platforms.includes(activeChannel) ? '✓ Active for Broadcast' : '+ Include in Broadcast'}
            </button>

            {/* Live Preview Toggle */}
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                showLivePreview
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{showLivePreview ? 'Editor' : 'Preview'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* CHANNEL CONTEXT SUB-HEADER */}
        <div className="border-b border-slate-100 px-6 py-2.5 bg-white flex items-center justify-between">
          {/* 1. LinkedIn Context Sub-Header */}
          {activeChannel === 'linkedin' && (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#0A66C2] flex items-center justify-center text-white font-bold text-sm shadow-xs">
                in
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">LinkedIn Post</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    {linkedinVisibility === 'PUBLIC' ? (
                      <>
                        <Globe className="h-3 w-3 text-slate-500" />
                        <span>Anyone</span>
                      </>
                    ) : (
                      <>
                        <Users className="h-3 w-3 text-slate-500" />
                        <span>Connections only</span>
                      </>
                    )}
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </button>

                  {showVisibilityMenu && (
                    <div className="absolute left-0 top-full mt-1.5 z-20 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setLinkedinVisibility('PUBLIC'); setShowVisibilityMenu(false); }}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-sky-50"
                      >
                        <Globe className="h-3.5 w-3.5 text-[#0A66C2]" />
                        <span>Anyone (Public)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLinkedinVisibility('CONNECTIONS'); setShowVisibilityMenu(false); }}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-sky-50"
                      >
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        <span>Connections only</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Instagram Context Sub-Header */}
          {activeChannel === 'instagram' && (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 p-[2px]">
                <div className="h-full w-full rounded-full bg-white flex items-center justify-center font-bold text-xs text-[#E4405F]">
                  ig
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">Instagram Media</span>
                {/* Format Badges */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                  {INSTAGRAM_MEDIA_TYPES.map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setIgMediaType(fmt.id)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                        igMediaType === fmt.id
                          ? 'bg-white text-[#E4405F] shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. X Context Sub-Header */}
          {activeChannel === 'x' && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xs">
                𝕏
              </div>
              <span className="font-bold text-slate-900 text-xs">X (Twitter) Post</span>
            </div>
          )}

          {/* 4. Facebook Context Sub-Header */}
          {activeChannel === 'facebook' && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#1877F2] flex items-center justify-center text-white font-bold text-xs">
                f
              </div>
              <span className="font-bold text-slate-900 text-xs">Facebook Page Broadcast</span>
            </div>
          )}

          {/* Character limit pill */}
          <span className={`text-xs font-mono font-bold ${isOverCharLimit ? 'text-red-600' : 'text-slate-400'}`}>
            {content.length} / {currentPlatformLimit} chars
          </span>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-between">
          {!showLivePreview ? (
            <div className="space-y-4 flex-1 flex flex-col">
              {/* Native Post Textarea */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  activeChannel === 'linkedin'
                    ? 'What do you want to talk about on LinkedIn?'
                    : activeChannel === 'instagram'
                    ? 'Write a caption for Instagram... (e.g. #growth #marketing)'
                    : activeChannel === 'x'
                    ? 'What is happening?!'
                    : 'Write a post for Facebook...'
                }
                rows={6}
                className="w-full border-0 p-0 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed"
                autoFocus
              />

              {/* Upload Progress Indicator */}
              {uploadProgressMsg && (
                <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs font-semibold text-[#0A66C2] border border-sky-200">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{uploadProgressMsg}</span>
                </div>
              )}

              {/* Uploaded Media Grid */}
              {mediaUrls.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
                    <span className="flex items-center gap-1">
                      <Folder className="h-3.5 w-3.5 text-amber-500" />
                      Uploaded to <strong>Assets &gt; Social</strong> folder
                    </span>
                    <span className="font-semibold text-slate-700">
                      {mediaUrls.length} item{mediaUrls.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {mediaUrls.map((url, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-white shadow-2xs">
                        <img src={url} alt="Media" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMediaUrl(idx)}
                          className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                        >
                          <CloseIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* LINKEDIN-ONLY INLINE FEATURE DRAWERS */}
              {/* ---------------------------------------------------- */}
              {activeChannel === 'linkedin' && linkedinFeature === 'poll' && (
                <div className="rounded-2xl border border-[#0A66C2]/30 bg-sky-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Vote className="h-4 w-4 text-[#0A66C2]" />
                      <span className="text-xs font-bold text-slate-900">LinkedIn Poll</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedinFeature('none')}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      Remove Poll
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Poll Question (e.g. Which feature do you use most?)"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#0A66C2] focus:outline-none"
                  />

                  <div className="space-y-2">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[i] = e.target.value;
                            setPollOptions(next);
                          }}
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#0A66C2] focus:outline-none"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <CloseIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {pollOptions.length < 4 ? (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ''])}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#0A66C2] hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add option
                      </button>
                    ) : <div />}

                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span>Duration:</span>
                      <select
                        value={pollDuration}
                        onChange={(e) => setPollDuration(e.target.value as LinkedInPollDuration)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold focus:outline-none"
                      >
                        <option value="ONE_DAY">1 Day</option>
                        <option value="THREE_DAYS">3 Days</option>
                        <option value="SEVEN_DAYS">7 Days</option>
                        <option value="FOURTEEN_DAYS">2 Weeks</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeChannel === 'linkedin' && linkedinFeature === 'article' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#0A66C2]" />
                      <span className="text-xs font-bold text-slate-900">LinkedIn Article Details</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedinFeature('none')}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="url"
                    placeholder="Article Source URL (e.g. https://marbee.io/blog/latest)"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#0A66C2] focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Article Title"
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#0A66C2] focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Summary Description"
                    value={articleDesc}
                    onChange={(e) => setArticleDesc(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#0A66C2] focus:outline-none"
                  />
                </div>
              )}

              {activeChannel === 'linkedin' && linkedinFeature === 'cta' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">LinkedIn Official CTA Button</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedinFeature('none')}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      Remove CTA
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={ctaLabel}
                      onChange={(e) => setCtaLabel(e.target.value as LinkedInCtaLabel)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      {LINKEDIN_CTA_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="url"
                      placeholder="Destination Landing Page URL"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* INSTAGRAM-ONLY INLINE FEATURE DRAWERS */}
              {/* ---------------------------------------------------- */}
              {activeChannel === 'instagram' && instagramFeature === 'location' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <MapPin className="h-3.5 w-3.5 text-[#E4405F]" />
                      <span>Instagram Location Tag</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIgLocation(''); setInstagramFeature('none'); }}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Location Name (e.g. San Francisco, California)"
                    value={igLocation}
                    onChange={(e) => setIgLocation(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#E4405F] focus:outline-none"
                  />
                </div>
              )}

              {activeChannel === 'instagram' && instagramFeature === 'comment' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <MessageSquare className="h-3.5 w-3.5 text-[#E4405F]" />
                      <span>Instagram First Comment (Auto-Posted)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIgFirstComment(''); setInstagramFeature('none'); }}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Write first comment (e.g. #marketing #saas #social)"
                    value={igFirstComment}
                    onChange={(e) => setIgFirstComment(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#E4405F] focus:outline-none"
                  />
                </div>
              )}

              {/* Asset Library Picker Overlay */}
              {showAssetPicker && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Select from Assets Library
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAssetPicker(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-40 overflow-y-auto p-1">
                    {allAssets
                      ?.filter((a) => a.mime_type?.startsWith('image/'))
                      .map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={async () => {
                            const url = await getAssetDisplayUrl(asset);
                            if (url && !mediaUrls.includes(url)) {
                              setMediaUrls((prev) => [...prev, url]);
                            }
                          }}
                          className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square group hover:border-brand-500 transition shadow-2xs"
                        >
                          <img
                            src={asset.public_url || undefined}
                            alt={asset.name}
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                          {asset.folder === '/Social' && (
                            <span className="absolute bottom-1 left-1 bg-brand-600 text-[9px] text-white px-1.5 py-0.2 rounded-md font-semibold">
                              Social
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Scheduled Banner if scheduled */}
              {scheduledAt && (
                <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs font-semibold text-amber-900">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span>Scheduled for: {new Date(scheduledAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduledAt('')}
                    className="text-amber-700 hover:text-amber-900 underline font-medium"
                  >
                    Clear
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            /* Live Simulated Mockup Preview */
            <div className="py-4">
              <SocialPostPreviewMockup
                platform={activeChannel}
                content={content}
                mediaUrls={mediaUrls}
                linkUrl={linkUrl}
                linkedinOptions={currentLinkedinOptions}
                instagramOptions={currentInstagramOptions}
              />
            </div>
          )}
        </div>

        {/* Bottom Feature Toolbar (Context-Aware for Active Channel) */}
        <div className="border-t border-slate-100 bg-white px-6 py-3.5 flex items-center justify-between">
          {/* LEFT TOOLBAR: Specific to active platform */}
          <div className="flex items-center gap-1.5 text-slate-500">
            {/* Common 1: Upload Photo / Video to /Social */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full p-2.5 hover:bg-slate-100 hover:text-brand-600 transition"
              title="Add media (auto-saved to Assets > Social)"
            >
              <ImageIcon className="h-5 w-5" />
            </button>

            {/* Common 2: Asset Library */}
            <button
              type="button"
              onClick={() => setShowAssetPicker(!showAssetPicker)}
              className="rounded-full p-2.5 hover:bg-slate-100 hover:text-brand-600 transition"
              title="Select from Assets Library"
            >
              <FolderOpen className="h-5 w-5" />
            </button>

            {/* LINKEDIN ONLY TOOLS */}
            {activeChannel === 'linkedin' && (
              <>
                <button
                  type="button"
                  onClick={() => setLinkedinFeature(linkedinFeature === 'poll' ? 'none' : 'poll')}
                  className={`rounded-full p-2.5 transition ${
                    linkedinFeature === 'poll' ? 'bg-sky-100 text-[#0A66C2]' : 'hover:bg-slate-100 hover:text-[#0A66C2]'
                  }`}
                  title="Create a LinkedIn Poll"
                >
                  <Vote className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setLinkedinFeature(linkedinFeature === 'article' ? 'none' : 'article')}
                  className={`rounded-full p-2.5 transition ${
                    linkedinFeature === 'article' ? 'bg-sky-100 text-[#0A66C2]' : 'hover:bg-slate-100 hover:text-[#0A66C2]'
                  }`}
                  title="Add an Article"
                >
                  <FileText className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setLinkedinFeature(linkedinFeature === 'cta' ? 'none' : 'cta')}
                  className={`rounded-full p-2.5 transition ${
                    linkedinFeature === 'cta' ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 hover:text-emerald-600'
                  }`}
                  title="Add LinkedIn CTA button"
                >
                  <MousePointerClick className="h-5 w-5" />
                </button>
              </>
            )}

            {/* INSTAGRAM ONLY TOOLS */}
            {activeChannel === 'instagram' && (
              <>
                <button
                  type="button"
                  onClick={() => setInstagramFeature(instagramFeature === 'location' ? 'none' : 'location')}
                  className={`rounded-full p-2.5 transition ${
                    instagramFeature === 'location' ? 'bg-rose-100 text-[#E4405F]' : 'hover:bg-slate-100 hover:text-[#E4405F]'
                  }`}
                  title="Add Instagram Location Tag"
                >
                  <MapPin className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setInstagramFeature(instagramFeature === 'comment' ? 'none' : 'comment')}
                  className={`rounded-full p-2.5 transition ${
                    instagramFeature === 'comment' ? 'bg-rose-100 text-[#E4405F]' : 'hover:bg-slate-100 hover:text-[#E4405F]'
                  }`}
                  title="Add Auto First Comment"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Hashtags Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHashtags(!showHashtags)}
                className="rounded-full p-2.5 hover:bg-slate-100 hover:text-brand-600 transition"
                title="Add hashtag"
              >
                <Hash className="h-5 w-5" />
              </button>

              {showHashtags && (
                <div className="absolute left-0 bottom-full mb-2 z-20 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg flex flex-wrap gap-1">
                  {['#Marketing', '#Growth', '#SaaS', '#Tech', '#Design'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setContent((prev) => (prev ? `${prev} ${tag}` : tag));
                        setShowHashtags(false);
                      }}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT TOOLBAR: Schedule & Broadcast */}
          <div className="flex items-center gap-3">
            {/* Schedule Clock Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowScheduleDialog(!showScheduleDialog)}
                className={`rounded-full p-2.5 transition ${
                  scheduledAt ? 'bg-amber-100 text-amber-700 font-bold' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
                title="Schedule broadcast"
              >
                <Clock className="h-5 w-5" />
              </button>

              {/* Schedule Popover Dialog */}
              {showScheduleDialog && (
                <div className="absolute right-0 bottom-full mb-2 z-30 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-brand-600" />
                      <span className="text-xs font-bold text-slate-900">Schedule Broadcast</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowScheduleDialog(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Choose date and time to automatically publish this broadcast.
                  </p>

                  <div className="space-y-2">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium focus:border-brand-500 focus:outline-none"
                    />

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPresetSchedule(1)}
                        className="flex-1 rounded-lg bg-slate-100 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setPresetSchedule(24)}
                        className="flex-1 rounded-lg bg-slate-100 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => { setScheduledAt(''); setShowScheduleDialog(false); }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                    <Button
                      size="sm"
                      disabled={!scheduledAt}
                      onClick={() => setShowScheduleDialog(false)}
                      className="bg-brand-600 hover:bg-brand-700 text-white rounded-full px-4"
                    >
                      Confirm Schedule
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Post / Schedule Action Button */}
            {scheduledAt ? (
              <button
                type="button"
                disabled={(!content.trim() && linkedinFeature !== 'poll') || !platforms.length || isOverCharLimit || saveMutation.isPending}
                onClick={() => saveMutation.mutate(false)}
                className="rounded-full bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                <span>Schedule ({platforms.length})</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={(!content.trim() && linkedinFeature !== 'poll') || !platforms.length || isOverCharLimit || saveMutation.isPending}
                onClick={() => saveMutation.mutate(true)}
                className="rounded-full bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Publish ({platforms.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
