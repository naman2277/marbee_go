import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  X as CloseIcon,
  Sparkles,
  Image as ImageIcon,
  Link as LinkIcon,
  Hash,
  Smile,
  AtSign,
  Vote,
  ListOrdered,
  MapPin,
  MessageSquarePlus,
  Clock,
  Send,
  CalendarClock,
  Wand2,
  Layers,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Trash2,
  GripVertical,
  Type as TypeIcon,
  Monitor,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { AnimatedSocialIcon } from '@/components/social/AnimatedSocialIcon';
import {
  SOCIAL_NETWORK_LIST,
  getNetwork,
  nextBestTime,
  describeBestTimes,
  isPublishableNetwork,
  type SocialNetworkId,
} from '@/lib/social-networks';
import type { SocialConfig } from '@/lib/social-config';
import { buildUtmUrl } from '@/lib/social-config';
import {
  captionFor,
  compileDraft,
  emptyOverride,
  getOverride,
  isCustomised,
  mediaFor,
  newDraft,
  type CompiledPost,
  type MediaItem,
  type NetworkOverride,
  type StudioDraft,
} from '@/lib/social-studio';
import { analyseCaption, runAssist, type AssistAction } from '@/lib/social-ai';
import { NetworkPreview, type PreviewInput } from './NetworkPreview';
import { uploadSocialMediaAsset } from '@/lib/assets';
import { LINKEDIN_CTA_OPTIONS } from '@/lib/social-providers';

export type ComposerSaveMode = 'draft' | 'schedule' | 'publish' | 'review';

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  environment: string;
  config: SocialConfig;
  connected: Set<SocialNetworkId>;
  initialDraft?: StudioDraft | null;
  onSubmit: (args: {
    mode: ComposerSaveMode;
    draft: StudioDraft;
    compiled: CompiledPost;
  }) => Promise<void> | void;
  /** override for the dev harness */
  uploadMedia?: (file: File) => Promise<string>;
};

const EMOJI = ['🚀', '🔥', '✨', '🙌', '💡', '📈', '🎉', '👀', '✅', '💬', '🧵', '⚡', '❤️', '🤝', '🌟', '📌', '😄', '🙏', '👇', '💯'];

const ASSIST_ITEMS: { id: AssistAction; label: string; hint: string }[] = [
  { id: 'hook', label: 'Add a hook', hint: 'Prepend a scroll-stopping first line' },
  { id: 'shorten', label: 'Make it punchier', hint: 'Cut ~40% while keeping the point' },
  { id: 'expand', label: 'Expand into bullets', hint: 'Turn a line into a short list' },
  { id: 'hashtags', label: 'Suggest hashtags', hint: 'Append relevant tags' },
  { id: 'emoji', label: 'Sprinkle emoji', hint: 'On-brand, tone-matched' },
  { id: 'cta', label: 'Add a call to action', hint: 'End with an ask' },
  { id: 'thread', label: 'Split into a thread', hint: 'Number each sentence' },
  { id: 'plain', label: 'Strip formatting', hint: 'Remove emoji & extra spacing' },
];

function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StudioComposer({
  open,
  onClose,
  tenantId,
  environment,
  config,
  connected,
  initialDraft,
  onSubmit,
  uploadMedia,
}: Props) {
  const [draft, setDraft] = useState<StudioDraft>(() => initialDraft ?? newDraft(['linkedin']));
  const [customise, setCustomise] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | SocialNetworkId>('all');
  const [previewNet, setPreviewNet] = useState<SocialNetworkId>('linkedin');
  const [framed, setFramed] = useState(true);
  const [drawer, setDrawer] = useState<null | 'poll' | 'thread' | 'cta' | 'location' | 'link' | 'firstComment' | 'title'>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [hashOpen, setHashOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<ComposerSaveMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = initialDraft ?? newDraft(connectedFirst(connected));
    setDraft(next);
    setCustomise(Object.keys(next.overrides).length > 0);
    setActiveTab('all');
    setPreviewNet(next.networks[0] ?? 'linkedin');
    setDrawer(null);
    setError(null);
    setBusy(null);
  }, [open, initialDraft, connected]);

  // keep preview target valid
  useEffect(() => {
    if (!draft.networks.includes(previewNet) && draft.networks[0]) setPreviewNet(draft.networks[0]);
    if (activeTab !== 'all' && !draft.networks.includes(activeTab)) setActiveTab('all');
  }, [draft.networks, previewNet, activeTab]);

  const editingNet: SocialNetworkId | null = activeTab === 'all' ? null : activeTab;
  const editingFeatures = editingNet ? getNetwork(editingNet)?.features ?? [] : unionFeatures(draft.networks);

  const currentCaption = editingNet ? captionFor(draft, editingNet) : draft.masterCaption;
  const insight = useMemo(
    () => analyseCaption(currentCaption, editingNet ?? previewNet),
    [currentCaption, editingNet, previewNet],
  );

  if (!open) return null;

  function patch(mut: (d: StudioDraft) => void) {
    setDraft((prev) => {
      const clone: StudioDraft = JSON.parse(JSON.stringify(prev));
      mut(clone);
      return clone;
    });
  }

  function patchOverride(id: SocialNetworkId, mut: (o: NetworkOverride) => void) {
    patch((d) => {
      const o = d.overrides[id] ?? emptyOverride();
      mut(o);
      d.overrides[id] = o;
    });
  }

  function setCaption(value: string) {
    if (editingNet) patchOverride(editingNet, (o) => { o.caption = value; });
    else patch((d) => { d.masterCaption = value; });
  }

  function insertAtCursor(text: string) {
    const el = captionRef.current;
    if (!el) { setCaption(currentCaption + text); return; }
    const start = el.selectionStart ?? currentCaption.length;
    const end = el.selectionEnd ?? currentCaption.length;
    const next = currentCaption.slice(0, start) + text + currentCaption.slice(end);
    setCaption(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }

  function toggleNetwork(id: SocialNetworkId) {
    patch((d) => {
      if (d.networks.includes(id)) d.networks = d.networks.filter((n) => n !== id);
      else d.networks = [...d.networks, id];
      if (d.networks.length === 0) d.networks = [id];
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: MediaItem[] = [];
      for (const file of Array.from(files)) {
        let url: string;
        if (uploadMedia) url = await uploadMedia(file);
        else {
          const res = await uploadSocialMediaAsset(tenantId, environment, file);
          if (res.error || !res.publicUrl) throw new Error(res.error || 'Upload failed');
          url = res.publicUrl;
        }
        uploaded.push({ url, kind: file.type.startsWith('video') ? 'video' : file.type.includes('gif') ? 'gif' : 'image' });
      }
      if (editingNet) patchOverride(editingNet, (o) => { o.media = [...(o.media ?? mediaFor(draft, editingNet)), ...uploaded]; });
      else patch((d) => { d.media = [...d.media, ...uploaded]; });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Media upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeMedia(idx: number) {
    if (editingNet) {
      patchOverride(editingNet, (o) => {
        const list = [...(o.media ?? mediaFor(draft, editingNet))];
        list.splice(idx, 1);
        o.media = list;
      });
    } else {
      patch((d) => { d.media.splice(idx, 1); });
    }
  }

  function moveMedia(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    const list = editingNet ? [...mediaFor(draft, editingNet)] : [...draft.media];
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    if (editingNet) patchOverride(editingNet, (o) => { o.media = list; });
    else patch((d) => { d.media = list; });
  }

  function applyAssist(action: AssistAction) {
    const out = runAssist(action, currentCaption, {
      voice: config.ai,
      network: editingNet ?? previewNet,
      hashtags: config.hashtagSets[0]?.tags,
    });
    setCaption(out);
    setAssistOpen(false);
  }

  const activeMedia = editingNet ? mediaFor(draft, editingNet) : draft.media;

  const warnings = draft.networks.flatMap((id) => {
    const n = getNetwork(id)!;
    const cap = captionFor(draft, id);
    const list: string[] = [];
    if (cap.length > n.charLimit) list.push(`${n.label}: caption is ${cap.length - n.charLimit} chars over the ${n.charLimit} limit`);
    if (id === 'instagram' && mediaFor(draft, id).length === 0) list.push('Instagram: needs at least one image or video');
    if (!isPublishableNetwork(id)) list.push(`${n.label}: not wired for direct publishing yet — will be saved as a draft`);
    return list;
  });

  const canPublish = draft.networks.length > 0 && currentAnyText(draft) && !hasBlockingLimit(draft);

  async function submit(mode: ComposerSaveMode) {
    setBusy(mode);
    setError(null);
    try {
      const finalDraft: StudioDraft = { ...draft };
      if (mode === 'schedule' && !finalDraft.scheduledAt) {
        finalDraft.scheduledAt = nextBestTime(previewNet).toISOString();
      }
      if (mode === 'publish') finalDraft.scheduledAt = null;
      finalDraft.status = mode === 'review' ? 'in_review' : mode === 'schedule' ? 'scheduled' : mode === 'publish' ? 'publishing' : 'draft';
      await onSubmit({ mode, draft: finalDraft, compiled: compileDraft(finalDraft, config) });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const previewInput = buildPreview(draft, previewNet, config);

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950/70 backdrop-blur-sm">
      <div className="m-auto flex h-[95vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* ================= EDITOR ================= */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-fuchsia-500 text-white">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{draft.id ? 'Edit post' : 'Create post'}</p>
                <p className="text-[11px] text-slate-500">Compose once, tailor per network</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* network selector */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5">
            {SOCIAL_NETWORK_LIST.map((n) => {
              const on = draft.networks.includes(n.id);
              const conn = connected.has(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => toggleNetwork(n.id)}
                  className={`group relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  title={conn ? `${n.label} · connected` : `${n.label} · not connected`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: conn ? '#10b981' : '#cbd5e1' }} />
                  <span>{n.shortLabel}</span>
                </button>
              );
            })}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={customise}
                onChange={(e) => { setCustomise(e.target.checked); if (!e.target.checked) setActiveTab('all'); }}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Customize per network
            </label>
          </div>

          {/* per-network tabs */}
          {customise && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-5 py-1.5">
              <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>All</TabButton>
              {draft.networks.map((id) => (
                <TabButton key={id} active={activeTab === id} onClick={() => setActiveTab(id)} dot={isCustomised(draft, id)}>
                  {getNetwork(id)?.shortLabel}
                </TabButton>
              ))}
            </div>
          )}

          {/* body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {editingNet && (
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{getNetwork(editingNet)?.label} override</span>
                {draft.overrides[editingNet]?.caption !== null && draft.overrides[editingNet] && (
                  <button className="text-brand-600 hover:underline" onClick={() => patchOverride(editingNet, (o) => { o.caption = null; })}>
                    reset to master
                  </button>
                )}
              </div>
            )}

            <textarea
              ref={captionRef}
              value={currentCaption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={editingNet ? `Tailor the ${getNetwork(editingNet)?.label} caption…` : 'What do you want to share?'}
              rows={7}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />

            {/* health meter */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Gauge className="h-3.5 w-3.5" /> Content health
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${insight.score >= 70 ? 'bg-emerald-500' : insight.score >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${insight.score}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-slate-600">{insight.score}</span>
              <span className={`text-[11px] font-mono ${insight.overLimit ? 'text-rose-600' : 'text-slate-400'}`}>
                {insight.chars}{editingNet || previewNet ? `/${getNetwork(editingNet ?? previewNet)?.charLimit}` : ''}
              </span>
            </div>
            {insight.tips.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {insight.tips.slice(0, 3).map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-300" />{t}
                  </li>
                ))}
              </ul>
            )}

            {/* toolbar */}
            <div className="mt-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
              <ToolbarBtn icon={ImageIcon} label="Media" onClick={() => fileRef.current?.click()} busy={uploading} />
              <div className="relative">
                <ToolbarBtn icon={Smile} label="Emoji" onClick={() => { setEmojiOpen((v) => !v); setHashOpen(false); setAssistOpen(false); }} />
                {emojiOpen && (
                  <Popover onClose={() => setEmojiOpen(false)}>
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI.map((e) => (
                        <button key={e} type="button" className="rounded-md p-1 text-lg hover:bg-slate-100" onClick={() => { insertAtCursor(e); setEmojiOpen(false); }}>{e}</button>
                      ))}
                    </div>
                  </Popover>
                )}
              </div>
              <div className="relative">
                <ToolbarBtn icon={Hash} label="Hashtags" onClick={() => { setHashOpen((v) => !v); setEmojiOpen(false); setAssistOpen(false); }} />
                {hashOpen && (
                  <Popover onClose={() => setHashOpen(false)}>
                    <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Hashtag sets</p>
                    {config.hashtagSets.map((s) => (
                      <button key={s.id} type="button" onClick={() => { insertAtCursor(`\n\n${s.tags.join(' ')}`); setHashOpen(false); }} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100">
                        <span className="font-semibold text-slate-700">{s.name}</span>
                        <span className="ml-1 text-slate-400">{s.tags.slice(0, 3).join(' ')}…</span>
                      </button>
                    ))}
                    {config.hashtagSets.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">Create sets in Channels → Hashtag sets</p>}
                  </Popover>
                )}
              </div>
              <ToolbarBtn icon={AtSign} label="Mention" onClick={() => insertAtCursor('@')} />
              <ToolbarBtn icon={LinkIcon} label="Link" onClick={() => setDrawer(drawer === 'link' ? null : 'link')} active={drawer === 'link' || !!draft.link} />
              {editingFeatures.includes('firstComment') && (
                <ToolbarBtn icon={MessageSquarePlus} label="1st comment" onClick={() => setDrawer(drawer === 'firstComment' ? null : 'firstComment')} active={drawer === 'firstComment'} />
              )}
              {editingFeatures.includes('poll') && (
                <ToolbarBtn icon={Vote} label="Poll" onClick={() => setDrawer(drawer === 'poll' ? null : 'poll')} active={drawer === 'poll'} />
              )}
              {editingFeatures.includes('thread') && (
                <ToolbarBtn icon={ListOrdered} label="Thread" onClick={() => setDrawer(drawer === 'thread' ? null : 'thread')} active={drawer === 'thread'} />
              )}
              {editingFeatures.includes('location') && (
                <ToolbarBtn icon={MapPin} label="Location" onClick={() => setDrawer(drawer === 'location' ? null : 'location')} active={drawer === 'location'} />
              )}
              {editingFeatures.includes('cta') && (
                <ToolbarBtn icon={Layers} label="CTA" onClick={() => setDrawer(drawer === 'cta' ? null : 'cta')} active={drawer === 'cta'} />
              )}
              {editingFeatures.includes('title') && (
                <ToolbarBtn icon={TypeIcon} label="Title" onClick={() => setDrawer(drawer === 'title' ? null : 'title')} active={drawer === 'title'} />
              )}
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => { setAssistOpen((v) => !v); setEmojiOpen(false); setHashOpen(false); }}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-tr from-brand-600 to-fuchsia-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95"
                >
                  <Sparkles className="h-3.5 w-3.5" /> AI assist <ChevronDown className="h-3 w-3" />
                </button>
                {assistOpen && (
                  <Popover align="right" onClose={() => setAssistOpen(false)} width="w-64">
                    {ASSIST_ITEMS.map((a) => (
                      <button key={a.id} type="button" onClick={() => applyAssist(a.id)} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-100">
                        <span className="text-xs font-semibold text-slate-800">{a.label}</span>
                        <span className="block text-[10px] text-slate-400">{a.hint}</span>
                      </button>
                    ))}
                    <p className="mt-1 border-t border-slate-100 px-2 pt-1.5 text-[10px] text-slate-400">Voice: {config.ai.tone} · {config.ai.emoji} emoji</p>
                  </Popover>
                )}
              </div>
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => addFiles(e.target.files)} />

            {/* media tray */}
            {activeMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {activeMedia.map((m, idx) => (
                  <div key={idx} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-square">
                    {m.kind === 'video'
                      ? <div className="flex h-full items-center justify-center text-[10px] font-bold text-slate-500">VIDEO</div>
                      : <img src={m.url} alt={m.altText ?? ''} className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />}
                    <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition group-hover:opacity-100">
                      <button type="button" onClick={() => moveMedia(idx, -1)} className="rounded bg-black/55 p-0.5 text-white"><GripVertical className="h-3 w-3" /></button>
                      <button type="button" onClick={() => removeMedia(idx)} className="rounded bg-black/55 p-0.5 text-white hover:bg-rose-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <input
                      value={m.altText ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingNet) patchOverride(editingNet, (o) => { const list = [...(o.media ?? activeMedia)]; list[idx] = { ...list[idx], altText: v }; o.media = list; });
                        else patch((d) => { d.media[idx] = { ...d.media[idx], altText: v }; });
                      }}
                      placeholder="Alt text"
                      className="absolute inset-x-0 bottom-0 border-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white placeholder:text-white/60 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
            {editingNet && getNetwork(editingNet) && (
              <p className="mt-1.5 text-[10px] text-slate-400">
                {getNetwork(editingNet)!.aspectRatios.map((r) => `${r.label} ${r.hint}`).join('  ·  ')}
              </p>
            )}

            {/* drawers */}
            {drawer === 'link' && (
              <Drawer title="Link & UTM">
                <input
                  value={draft.link}
                  onChange={(e) => patch((d) => { d.link = e.target.value; })}
                  placeholder="https://your-landing-page.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                />
                {draft.link && (
                  <p className="mt-1.5 break-all rounded bg-slate-50 p-2 text-[10px] text-slate-500">
                    Tracked: {buildUtmUrl(draft.link, { ...config.networks[previewNet].utm, enabled: true })}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-400">Per-network UTM defaults live in Channels → UTM &amp; links.</p>
              </Drawer>
            )}
            {drawer === 'firstComment' && (
              <Drawer title="Auto first comment">
                <FirstCommentField draft={draft} net={editingNet ?? previewNet} patchOverride={patchOverride} />
              </Drawer>
            )}
            {drawer === 'poll' && (
              <PollDrawer net={editingNet ?? previewNet} draft={draft} patchOverride={patchOverride} />
            )}
            {drawer === 'thread' && (
              <ThreadDrawer net={editingNet ?? previewNet} draft={draft} patchOverride={patchOverride} />
            )}
            {drawer === 'location' && (
              <Drawer title="Location tag">
                <input
                  value={getOverride(draft, editingNet ?? previewNet).location}
                  onChange={(e) => patchOverride(editingNet ?? previewNet, (o) => { o.location = e.target.value; })}
                  placeholder="e.g. Cape Town, South Africa"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                />
              </Drawer>
            )}
            {drawer === 'cta' && (
              <Drawer title="Call-to-action button">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={getOverride(draft, 'linkedin').cta?.label ?? 'LEARN_MORE'}
                    onChange={(e) => patchOverride('linkedin', (o) => { o.cta = { label: e.target.value, url: o.cta?.url ?? '' }; })}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                  >
                    {LINKEDIN_CTA_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <input
                    value={getOverride(draft, 'linkedin').cta?.url ?? ''}
                    onChange={(e) => patchOverride('linkedin', (o) => { o.cta = { label: o.cta?.label ?? 'LEARN_MORE', url: e.target.value }; })}
                    placeholder="Destination URL"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </Drawer>
            )}
            {drawer === 'title' && (
              <Drawer title="Title / headline">
                <input
                  value={getOverride(draft, editingNet ?? previewNet).title}
                  onChange={(e) => patchOverride(editingNet ?? previewNet, (o) => { o.title = e.target.value; })}
                  placeholder="Video title / Pin headline"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                />
              </Drawer>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="border-t border-slate-200 px-5 py-3">
            {warnings.length > 0 && (
              <div className="mb-2 space-y-0.5">
                {warnings.slice(0, 3).map((w, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-[11px] text-amber-700">
                    <AlertTriangle className="h-3 w-3" />{w}
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSchedOpen((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    draft.scheduledAt ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {draft.scheduledAt ? new Date(draft.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Schedule'}
                </button>
                {schedOpen && (
                  <Popover onClose={() => setSchedOpen(false)} width="w-72">
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => { patch((d) => { d.scheduledAt = nextBestTime(previewNet).toISOString(); }); setSchedOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-2 text-left text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Next best time for {getNetwork(previewNet)?.shortLabel}
                      </button>
                      <p className="px-1 text-[10px] text-slate-400">{describeBestTimes(previewNet)}</p>
                      <input
                        type="datetime-local"
                        value={draft.scheduledAt ? fmtLocal(new Date(draft.scheduledAt)) : ''}
                        onChange={(e) => patch((d) => { d.scheduledAt = e.target.value ? new Date(e.target.value).toISOString() : null; })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                      />
                      {draft.scheduledAt && (
                        <button type="button" onClick={() => { patch((d) => { d.scheduledAt = null; }); }} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                          Clear
                        </button>
                      )}
                    </div>
                  </Popover>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => submit('draft')}>
                  {busy === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save draft'}
                </Button>
                {config.approval.enabled && (
                  <Button variant="secondary" size="sm" disabled={busy !== null || !canPublish} onClick={() => submit('review')}>
                    {busy === 'review' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Submit for review'}
                  </Button>
                )}
                {draft.scheduledAt ? (
                  <Button size="sm" disabled={busy !== null || !canPublish} onClick={() => submit('schedule')}>
                    {busy === 'schedule' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Clock className="mr-1 h-3.5 w-3.5" />Schedule ({draft.networks.length})</>}
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy !== null || !canPublish} onClick={() => submit('publish')}>
                    {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" />Publish ({draft.networks.length})</>}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= PREVIEW ================= */}
        <div className="hidden w-[380px] shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:flex xl:w-[440px]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {draft.networks.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreviewNet(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    previewNet === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {getNetwork(id)?.shortLabel}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFramed((v) => !v)}
              className={`rounded-lg p-1.5 ${framed ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}
              title="Toggle device frame"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <NetworkPreview input={previewInput} framed={framed} />
            <div className="mx-auto mt-4 max-w-[440px] rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <AnimatedSocialIcon platform={previewNet} size="sm" animated={false} className="h-5 w-5 rounded-md p-0.5" />
                {getNetwork(previewNet)?.label} checklist
              </div>
              <ChecklistRow ok={!!currentCaptionForNet(draft, previewNet)} label="Caption written" />
              <ChecklistRow
                ok={captionFor(draft, previewNet).length <= (getNetwork(previewNet)?.charLimit ?? 9999)}
                label={`Within ${getNetwork(previewNet)?.charLimit.toLocaleString()} characters`}
              />
              <ChecklistRow ok={connected.has(previewNet)} label="Account connected" soft />
              {getNetwork(previewNet)?.features.includes('media') && (
                <ChecklistRow ok={mediaFor(draft, previewNet).length > 0} label="Media attached" soft={previewNet !== 'instagram'} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// small local components
// ---------------------------------------------------------------------------

function TabButton({ active, dot, onClick, children }: { active: boolean; dot?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
    </button>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
  busy,
}: {
  icon: typeof Hash;
  label: string;
  onClick: () => void;
  active?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
        active ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-white'
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Popover({
  children,
  onClose,
  align = 'left',
  width = 'w-56',
}: {
  children: ReactNode;
  onClose: () => void;
  align?: 'left' | 'right';
  width?: string;
}) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="close" onClick={onClose} />
      <div className={`absolute z-20 mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} ${width} rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl`}>
        {children}
      </div>
    </>
  );
}

function Drawer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function ChecklistRow({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px]">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <span className={`h-3.5 w-3.5 rounded-full border ${soft ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`} />
      )}
      <span className={ok ? 'text-slate-600' : soft ? 'text-slate-400' : 'text-amber-700'}>{label}</span>
    </div>
  );
}

function FirstCommentField({
  draft,
  net,
  patchOverride,
}: {
  draft: StudioDraft;
  net: SocialNetworkId;
  patchOverride: (id: SocialNetworkId, mut: (o: NetworkOverride) => void) => void;
}) {
  return (
    <textarea
      value={getOverride(draft, net).firstComment}
      onChange={(e) => patchOverride(net, (o) => { o.firstComment = e.target.value; })}
      rows={2}
      placeholder="Posted automatically right after publish — great for hashtag stacks"
      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
    />
  );
}

function PollDrawer({
  net,
  draft,
  patchOverride,
}: {
  net: SocialNetworkId;
  draft: StudioDraft;
  patchOverride: (id: SocialNetworkId, mut: (o: NetworkOverride) => void) => void;
}) {
  const poll = getOverride(draft, net).poll ?? { question: '', options: ['', ''], durationDays: 3 };
  const set = (mut: (p: NonNullable<NetworkOverride['poll']>) => void) =>
    patchOverride(net, (o) => {
      const p = o.poll ?? { question: '', options: ['', ''], durationDays: 3 };
      mut(p);
      o.poll = p;
    });
  return (
    <Drawer title={`${getNetwork(net)?.label} poll`}>
      <input
        value={poll.question}
        onChange={(e) => set((p) => { p.question = e.target.value; })}
        placeholder="Poll question"
        className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
      />
      <div className="space-y-1.5">
        {poll.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={opt}
              onChange={(e) => set((p) => { p.options[i] = e.target.value; })}
              placeholder={`Option ${i + 1}`}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            />
            {poll.options.length > 2 && (
              <button type="button" onClick={() => set((p) => { p.options.splice(i, 1); })} className="text-slate-400 hover:text-rose-500">
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {poll.options.length < 4 ? (
          <button type="button" onClick={() => set((p) => { p.options.push(''); })} className="text-[11px] font-bold text-brand-600 hover:underline">
            + Add option
          </button>
        ) : <span />}
        <select
          value={poll.durationDays}
          onChange={(e) => set((p) => { p.durationDays = Number(e.target.value); })}
          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold"
        >
          <option value={1}>1 day</option>
          <option value={3}>3 days</option>
          <option value={7}>1 week</option>
          <option value={14}>2 weeks</option>
        </select>
      </div>
    </Drawer>
  );
}

function ThreadDrawer({
  net,
  draft,
  patchOverride,
}: {
  net: SocialNetworkId;
  draft: StudioDraft;
  patchOverride: (id: SocialNetworkId, mut: (o: NetworkOverride) => void) => void;
}) {
  const parts = getOverride(draft, net).threadParts;
  return (
    <Drawer title={`${getNetwork(net)?.label} thread`}>
      <p className="mb-1.5 text-[10px] text-slate-400">The caption above is post 1. Add follow-ups below.</p>
      <div className="space-y-1.5">
        {parts.map((p, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-2 text-[10px] font-bold text-slate-400">{i + 2}/</span>
            <textarea
              value={p}
              onChange={(e) => patchOverride(net, (o) => { o.threadParts[i] = e.target.value; })}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            />
            <button type="button" onClick={() => patchOverride(net, (o) => { o.threadParts.splice(i, 1); })} className="mt-2 text-slate-400 hover:text-rose-500">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => patchOverride(net, (o) => { o.threadParts.push(''); })} className="mt-2 text-[11px] font-bold text-brand-600 hover:underline">
        + Add post
      </button>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function connectedFirst(connected: Set<SocialNetworkId>): SocialNetworkId[] {
  const list = SOCIAL_NETWORK_LIST.filter((n) => connected.has(n.id)).map((n) => n.id);
  return list.length ? list : ['linkedin'];
}

function unionFeatures(ids: SocialNetworkId[]): string[] {
  const s = new Set<string>();
  for (const id of ids) for (const f of getNetwork(id)?.features ?? []) s.add(f);
  return Array.from(s);
}

function currentAnyText(draft: StudioDraft): boolean {
  if (draft.masterCaption.trim()) return true;
  return draft.networks.some((id) => Boolean((draft.overrides[id]?.caption ?? '').trim()));
}

function currentCaptionForNet(draft: StudioDraft, id: SocialNetworkId): string {
  return captionFor(draft, id).trim();
}

function hasBlockingLimit(draft: StudioDraft): boolean {
  return draft.networks.some((id) => {
    const n = getNetwork(id);
    return n ? captionFor(draft, id).length > n.charLimit : false;
  });
}

function buildPreview(draft: StudioDraft, net: SocialNetworkId, config: SocialConfig): PreviewInput {
  const o = draft.overrides[net];
  return {
    network: net,
    caption: captionFor(draft, net),
    media: mediaFor(draft, net),
    link: draft.link,
    firstComment: o?.firstComment,
    handle: config.brand.handle || 'yourbrand',
    displayName: config.brand.name || 'Your Brand',
    avatarUrl: config.brand.avatarUrl || undefined,
    poll: o?.poll ? { question: o.poll.question, options: o.poll.options } : null,
    location: o?.location,
    threadParts: o?.threadParts,
    title: o?.title,
    igMediaType: o?.igMediaType,
  };
}
