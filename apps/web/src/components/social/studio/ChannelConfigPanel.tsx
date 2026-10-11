import { useState, type ReactNode } from 'react';
import {
  Plus,
  Trash2,
  Hash,
  Link2,
  Clock,
  ShieldCheck,
  Sparkles,
  Bot,
  RotateCcw,
  PenLine,
  Building2,
  Check,
  X as XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { AnimatedSocialIcon } from '@/components/social/AnimatedSocialIcon';
import {
  SOCIAL_NETWORK_LIST,
  getNetwork,
  describeBestTimes,
  DAY_LABELS,
  type SocialNetworkId,
} from '@/lib/social-networks';
import { TIMEZONES, type SocialConfig } from '@/lib/social-config';

type UpdateFn = (recipe: (draft: SocialConfig) => SocialConfig | void) => void;

type Props = {
  config: SocialConfig;
  update: UpdateFn;
  reset: () => void;
  connected: Set<SocialNetworkId>;
  onConnect?: (id: SocialNetworkId) => void;
};

type Section = 'brand' | 'hashtags' | 'ai' | 'approval' | 'automation' | SocialNetworkId;

export function ChannelConfigPanel({ config, update, reset, connected, onConnect }: Props) {
  const [section, setSection] = useState<Section>('brand');
  const [savedFlash, setSavedFlash] = useState(false);

  const flash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };
  const set: UpdateFn = (recipe) => { update(recipe); flash(); };

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      {/* nav */}
      <nav className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-2">
        <div>
          <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</p>
          <NavItem active={section === 'brand'} onClick={() => setSection('brand')} icon={Building2}>Brand identity</NavItem>
          <NavItem active={section === 'hashtags'} onClick={() => setSection('hashtags')} icon={Hash}>Hashtag sets</NavItem>
          <NavItem active={section === 'ai'} onClick={() => setSection('ai')} icon={Bot}>AI voice</NavItem>
          <NavItem active={section === 'approval'} onClick={() => setSection('approval')} icon={ShieldCheck}>Approval workflow</NavItem>
          <NavItem active={section === 'automation'} onClick={() => setSection('automation')} icon={Sparkles}>Automation</NavItem>
        </div>
        <div>
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Per network</p>
          {SOCIAL_NETWORK_LIST.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition ${
                section === n.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AnimatedSocialIcon platform={n.id} size="sm" animated={false} className="h-5 w-5 rounded-md p-0.5" />
              <span className="flex-1">{n.shortLabel}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${connected.has(n.id) ? 'bg-emerald-400' : config.networks[n.id].enabled ? 'bg-amber-400' : 'bg-slate-300'}`} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-rose-600"
        >
          <RotateCcw className="h-3 w-3" /> Reset to defaults
        </button>
      </nav>

      {/* body */}
      <div className="min-w-0 space-y-5">
        <div className="flex h-5 items-center justify-end">
          {savedFlash && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>

        {section === 'brand' && <BrandSection config={config} set={set} />}
        {section === 'hashtags' && <HashtagSection config={config} set={set} />}
        {section === 'ai' && <AiSection config={config} set={set} />}
        {section === 'approval' && <ApprovalSection config={config} set={set} />}
        {section === 'automation' && <AutomationSection config={config} set={set} />}
        {isNetwork(section) && (
          <NetworkSection
            key={section}
            id={section}
            config={config}
            set={set}
            connected={connected.has(section)}
            onConnect={onConnect}
          />
        )}
      </div>
    </div>
  );
}

function isNetwork(s: Section): s is SocialNetworkId {
  return !['brand', 'hashtags', 'ai', 'approval', 'automation'].includes(s);
}

function NavItem({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Hash;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function Panel({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none';

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-slate-300"
    >
      <span>
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        {desc && <span className="mt-0.5 block text-[11px] text-slate-500">{desc}</span>}
      </span>
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-brand-600' : 'bg-slate-200'}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function BrandSection({ config, set }: { config: SocialConfig; set: UpdateFn }) {
  return (
    <Panel title="Brand identity" desc="Shown in every preview and appended where a signature is configured.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name">
          <input className={input} value={config.brand.name} onChange={(e) => set((d) => { d.brand.name = e.target.value; })} />
        </Field>
        <Field label="Handle" hint="Without the @">
          <input className={input} value={config.brand.handle} onChange={(e) => set((d) => { d.brand.handle = e.target.value.replace(/^@/, ''); })} />
        </Field>
        <Field label="Avatar URL">
          <input className={input} placeholder="https://…" value={config.brand.avatarUrl} onChange={(e) => set((d) => { d.brand.avatarUrl = e.target.value; })} />
        </Field>
        <Field label="Website">
          <input className={input} value={config.brand.website} onChange={(e) => set((d) => { d.brand.website = e.target.value; })} />
        </Field>
        <Field label="Timezone" hint="Drives scheduling & best-time suggestions">
          <select className={input} value={config.brand.timezone} onChange={(e) => set((d) => { d.brand.timezone = e.target.value; })}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
      </div>
    </Panel>
  );
}

function HashtagSection({ config, set }: { config: SocialConfig; set: UpdateFn }) {
  const [name, setName] = useState('');
  return (
    <Panel title="Hashtag sets" desc="Reusable tag stacks. Apply one as a network default or drop it in from the composer.">
      {config.hashtagSets.map((s) => (
        <div key={s.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <input
              className="rounded border-0 bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
              value={s.name}
              onChange={(e) => set((d) => { const t = d.hashtagSets.find((x) => x.id === s.id); if (t) t.name = e.target.value; })}
            />
            <button type="button" onClick={() => set((d) => { d.hashtagSets = d.hashtagSets.filter((x) => x.id !== s.id); })} className="text-slate-300 hover:text-rose-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] focus:border-brand-500 focus:outline-none"
            rows={2}
            value={s.tags.join(' ')}
            onChange={(e) => set((d) => {
              const t = d.hashtagSets.find((x) => x.id === s.id);
              if (t) t.tags = e.target.value.split(/\s+/).map((w) => (w.startsWith('#') || !w ? w : `#${w}`)).filter(Boolean);
            })}
          />
          <p className="mt-1 text-[10px] text-slate-400">{s.tags.length} tags</p>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={input} placeholder="New set name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!name.trim()) return;
            set((d) => { d.hashtagSets.push({ id: slug(name), name: name.trim(), tags: [] }); });
            setName('');
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </Panel>
  );
}

function AiSection({ config, set }: { config: SocialConfig; set: UpdateFn }) {
  const [banned, setBanned] = useState('');
  return (
    <Panel title="AI voice" desc="Guides the composer's AI-assist transforms.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tone">
          <select className={input} value={config.ai.tone} onChange={(e) => set((d) => { d.ai.tone = e.target.value as SocialConfig['ai']['tone']; })}>
            {['professional', 'friendly', 'bold', 'playful', 'informative'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Emoji">
          <select className={input} value={config.ai.emoji} onChange={(e) => set((d) => { d.ai.emoji = e.target.value as SocialConfig['ai']['emoji']; })}>
            {['none', 'light', 'expressive'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Perspective">
          <select className={input} value={config.ai.perspective} onChange={(e) => set((d) => { d.ai.perspective = e.target.value as SocialConfig['ai']['perspective']; })}>
            {['brand', 'founder', 'team'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Banned words" hint="Comma-separated — AI assist avoids these">
        <div className="flex flex-wrap gap-1.5">
          {config.ai.bannedWords.map((w) => (
            <span key={w} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {w}
              <button type="button" onClick={() => set((d) => { d.ai.bannedWords = d.ai.bannedWords.filter((x) => x !== w); })}><XIcon className="h-3 w-3" /></button>
            </span>
          ))}
          <input
            className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:outline-none"
            placeholder="Add word + Enter"
            value={banned}
            onChange={(e) => setBanned(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && banned.trim()) {
                set((d) => { if (!d.ai.bannedWords.includes(banned.trim())) d.ai.bannedWords.push(banned.trim()); });
                setBanned('');
              }
            }}
          />
        </div>
      </Field>
    </Panel>
  );
}

function ApprovalSection({ config, set }: { config: SocialConfig; set: UpdateFn }) {
  const [reviewer, setReviewer] = useState('');
  return (
    <Panel title="Approval workflow" desc="Require sign-off before anything publishes.">
      <Toggle
        checked={config.approval.enabled}
        onChange={(v) => set((d) => { d.approval.enabled = v; })}
        label="Require approval before publishing"
        desc="Posts land in an “In review” state until approved."
      />
      {config.approval.enabled && (
        <>
          <Field label="Minimum approvals">
            <input
              type="number"
              min={1}
              max={5}
              className={input}
              value={config.approval.minApprovals}
              onChange={(e) => set((d) => { d.approval.minApprovals = Math.max(1, Number(e.target.value)); })}
            />
          </Field>
          <Field label="Reviewers">
            <div className="flex flex-wrap gap-1.5">
              {config.approval.reviewers.map((r) => (
                <span key={r} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {r}
                  <button type="button" onClick={() => set((d) => { d.approval.reviewers = d.approval.reviewers.filter((x) => x !== r); })}><XIcon className="h-3 w-3" /></button>
                </span>
              ))}
              <input
                className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:outline-none"
                placeholder="reviewer@email — Enter"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reviewer.trim()) {
                    set((d) => { if (!d.approval.reviewers.includes(reviewer.trim())) d.approval.reviewers.push(reviewer.trim()); });
                    setReviewer('');
                  }
                }}
              />
            </div>
          </Field>
          <Field label="Notify channel" hint="Slack channel or webhook label">
            <input className={input} value={config.approval.notifyChannel} onChange={(e) => set((d) => { d.approval.notifyChannel = e.target.value; })} />
          </Field>
        </>
      )}
    </Panel>
  );
}

function AutomationSection({ config, set }: { config: SocialConfig; set: UpdateFn }) {
  const a = config.automation;
  return (
    <Panel title="Automation" desc="Standing rules that run without you.">
      <Toggle checked={a.autoQueue} onChange={(v) => set((d) => { d.automation.autoQueue = v; })} label="Auto-fill the queue" desc="New scheduled posts drop into the next open slot." />
      <Toggle checked={a.recycleEvergreen} onChange={(v) => set((d) => { d.automation.recycleEvergreen = v; })} label="Recycle evergreen posts" desc="Re-queue posts tagged evergreen after they publish." />
      <Toggle checked={a.pauseOnFailure} onChange={(v) => set((d) => { d.automation.pauseOnFailure = v; })} label="Pause a channel on repeated failures" desc="Stops the queue if a network rejects 3 posts in a row." />
      <Toggle checked={a.utmEverywhere} onChange={(v) => set((d) => { d.automation.utmEverywhere = v; })} label="Force UTM tagging on every link" desc="Applies each network's UTM defaults even if the toggle is off." />
      <Toggle checked={a.linkInBioSync} onChange={(v) => set((d) => { d.automation.linkInBioSync = v; })} label="Sync link-in-bio" desc="Push the latest post link to your bio landing page." />
    </Panel>
  );
}

function NetworkSection({
  id,
  config,
  set,
  connected,
  onConnect,
}: {
  id: SocialNetworkId;
  config: SocialConfig;
  set: UpdateFn;
  connected: boolean;
  onConnect?: (id: SocialNetworkId) => void;
}) {
  const n = getNetwork(id)!;
  const nc = config.networks[id];
  const patch = (mut: (c: SocialConfig['networks'][SocialNetworkId]) => void) => set((d) => { mut(d.networks[id]); });

  return (
    <>
      <div className="flex items-center gap-2.5 px-1">
        <AnimatedSocialIcon platform={id} size="sm" animated={false} connected={connected} className="h-7 w-7 rounded-lg p-1" />
        <h2 className="text-base font-bold text-slate-900">{n.label} settings</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${connected ? 'bg-emerald-50 text-emerald-700' : n.publishable ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
          {connected ? 'Connected' : n.publishable ? 'Not connected' : 'Planning only'}
        </span>
        {!connected && n.publishable && onConnect && (
          <button type="button" onClick={() => onConnect(id)} className="ml-auto text-[11px] font-semibold text-brand-600 hover:underline">
            Manage connection →
          </button>
        )}
      </div>

      <Panel title="Posting defaults">
        <Toggle checked={nc.enabled} onChange={(v) => patch((c) => { c.enabled = v; })} label={`${n.label} enabled in this workspace`} />
        <Field label={<><PenLine className="mr-1 inline h-3 w-3" />Signature</>} hint="Appended to the caption on publish">
          <textarea
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            rows={2}
            value={nc.signature}
            onChange={(e) => patch((c) => { c.signature = e.target.value; })}
            placeholder="— The team · marbee.io"
          />
        </Field>
        <Field label="Auto first comment" hint="Only used where the network supports it">
          <textarea
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            rows={2}
            value={nc.firstCommentTemplate}
            onChange={(e) => patch((c) => { c.firstCommentTemplate = e.target.value; })}
          />
        </Field>
        <Toggle checked={nc.watermark} onChange={(v) => patch((c) => { c.watermark = v; })} label="Watermark media before upload" />
        <Toggle checked={nc.approvalRequired} onChange={(v) => patch((c) => { c.approvalRequired = v; })} label="Require approval for this network specifically" />
      </Panel>

      <Panel title={<><Hash className="mr-1 inline h-3.5 w-3.5" />Default hashtags</>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hashtag set">
            <select
              className={input}
              value={nc.defaultHashtagSetId ?? ''}
              onChange={(e) => patch((c) => { c.defaultHashtagSetId = e.target.value || null; })}
            >
              <option value="">None</option>
              {config.hashtagSets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.tags.length})</option>)}
            </select>
          </Field>
          <Field label="Placement">
            <select
              className={input}
              value={nc.hashtagPlacement}
              onChange={(e) => patch((c) => { c.hashtagPlacement = e.target.value as typeof c.hashtagPlacement; })}
            >
              <option value="caption">End of caption</option>
              <option value="firstComment">First comment</option>
              <option value="none">Don’t auto-add</option>
            </select>
          </Field>
        </div>
        <p className="text-[10px] text-slate-400">Sweet spot for {n.shortLabel}: {n.hashtagSweetSpot[0]}–{n.hashtagSweetSpot[1]} tags.</p>
      </Panel>

      <Panel title={<><Link2 className="mr-1 inline h-3.5 w-3.5" />UTM &amp; links</>}>
        <Toggle checked={nc.utm.enabled} onChange={(v) => patch((c) => { c.utm.enabled = v; })} label="Auto-tag links from this network" />
        {nc.utm.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="utm_source"><input className={input} value={nc.utm.source} onChange={(e) => patch((c) => { c.utm.source = e.target.value; })} /></Field>
            <Field label="utm_medium"><input className={input} value={nc.utm.medium} onChange={(e) => patch((c) => { c.utm.medium = e.target.value; })} /></Field>
            <Field label="utm_campaign" hint="Blank = per-post"><input className={input} value={nc.utm.campaign} onChange={(e) => patch((c) => { c.utm.campaign = e.target.value; })} /></Field>
            <Field label="Shortener domain" hint="Cosmetic in this build"><input className={input} value={nc.utm.shortenDomain} onChange={(e) => patch((c) => { c.utm.shortenDomain = e.target.value; })} placeholder="mrb.ee" /></Field>
          </div>
        )}
      </Panel>

      <Panel title={<><Clock className="mr-1 inline h-3.5 w-3.5" />Publishing schedule</>} desc={`Queue slots for ${n.label}. Best-time hint: ${describeBestTimes(id)}`}>
        <QueueEditor slots={nc.queue} onChange={(next) => patch((c) => { c.queue = next; })} />
      </Panel>
    </>
  );
}

function QueueEditor({
  slots,
  onChange,
}: {
  slots: SocialConfig['networks'][SocialNetworkId]['queue'];
  onChange: (next: SocialConfig['networks'][SocialNetworkId]['queue']) => void;
}) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('09:00');
  const byDay = DAY_LABELS.map((_, d) => slots.filter((s) => s.day === d).sort((a, b) => a.time.localeCompare(b.time)));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((label, d) => (
          <div key={label} className="rounded-lg border border-slate-200 p-1.5">
            <p className="mb-1 text-center text-[10px] font-bold uppercase text-slate-400">{label}</p>
            <div className="space-y-1">
              {byDay[d].map((s, i) => (
                <button
                  key={`${s.time}-${i}`}
                  type="button"
                  onClick={() => onChange(slots.filter((x) => !(x.day === s.day && x.time === s.time)))}
                  className="group flex w-full items-center justify-center gap-1 rounded bg-brand-50 px-1 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-rose-50 hover:text-rose-600"
                  title="Remove slot"
                >
                  {s.time}
                  <Trash2 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
              {byDay[d].length === 0 && <p className="text-center text-[9px] text-slate-300">—</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAY_LABELS.map((l, d) => <option key={l} value={d}>{l}</option>)}
        </select>
        <input type="time" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (slots.some((s) => s.day === day && s.time === time)) return;
            onChange([...slots, { day, time }]);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add slot
        </Button>
        <span className="ml-auto text-[11px] text-slate-400">{slots.length} slots / week</span>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `set-${Date.now()}`;
}
