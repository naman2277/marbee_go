import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Rocket,
} from 'lucide-react';
import { Card, Badge, Button, EmptyState } from '@/components/ui';
import { LandingStudio } from '@/components/landing-pages/studio/LandingStudio';
import { AuditTrailPanel } from '@/components/audit/AuditTrailPanel';
import {
  fetchLandingPageById,
  publishLandingPage,
  updateLandingPage,
  getLandingPagePublicUrl,
  getLandingPageEmbedCode,
  getLandingPageEffectiveStatus,
  type LandingContent,
  type LandingSeo,
} from '@/lib/landing-pages';
import { fetchForms } from '@/lib/forms';
import { copyText } from '@/lib/schema-export';
import { useTenantScope } from '@/contexts/AuthContext';

function toLocalDatetimeInputValue(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalDatetimeInputValue(inputValue: string): string | null {
  if (!inputValue) return null;
  const date = new Date(inputValue);
  return isNaN(date.getTime()) ? null : date.toISOString();
}
function formatUserFriendlyDate(inputValue: string): string {
  if (!inputValue) return '';
  const date = new Date(inputValue);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function LandingPageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [draftContent, setDraftContent] = useState<LandingContent | null>(null);
  const [draftSeo, setDraftSeo] = useState<LandingSeo | null>(null);
  const [draftValidFrom, setDraftValidFrom] = useState('');
  const [draftValidUntil, setDraftValidUntil] = useState('');
  const [validityEnabled, setValidityEnabled] = useState(false);
  const [draftFallbackType, setDraftFallbackType] = useState<'default' | 'message' | 'redirect' | 'custom_html'>('default');
  const [draftFallbackTitle, setDraftFallbackTitle] = useState('');
  const [draftFallbackMessage, setDraftFallbackMessage] = useState('');
  const [draftFallbackRedirectUrl, setDraftFallbackRedirectUrl] = useState('');
  const [draftFallbackCustomHtml, setDraftFallbackCustomHtml] = useState('');
  const [dirty, setDirty] = useState(false);

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['landing-page', id],
    queryFn: () => fetchLandingPageById(id!),
    enabled: Boolean(id),
  });

  const { data: forms } = useQuery({
    queryKey: ['forms', tenantId, environment],
    queryFn: () => fetchForms(tenantId, environment),
  });

  const formOptions =
    forms?.filter((f) => f.status === 'published').map((f) => ({ slug: f.slug, name: f.name })) ?? [];

  useEffect(() => {
    if (page) {
      setDraftContent(page.content);
      setDraftSeo(page.seo);
      setDraftValidFrom(toLocalDatetimeInputValue(page.content.valid_from));
      setDraftValidUntil(toLocalDatetimeInputValue(page.content.valid_until));
      setValidityEnabled(Boolean(page.content.valid_from || page.content.valid_until));
      const fb = page.content.fallback || {};
      setDraftFallbackType(fb.type || 'default');
      setDraftFallbackTitle(fb.title || '');
      setDraftFallbackMessage(fb.message || '');
      setDraftFallbackRedirectUrl(fb.redirectUrl || '');
      setDraftFallbackCustomHtml(fb.customHtml || '');
      setDirty(false);
    }
  }, [page]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['landing-page', id] });
    queryClient.invalidateQueries({ queryKey: ['landing-pages', tenantId, environment] });
  };

  const buildContentWithValidity = (): LandingContent => ({
    ...draftContent!,
    valid_from: validityEnabled && draftValidFrom ? fromLocalDatetimeInputValue(draftValidFrom) : null,
    valid_until: validityEnabled && draftValidUntil ? fromLocalDatetimeInputValue(draftValidUntil) : null,
    fallback: {
      type: draftFallbackType,
      title: draftFallbackTitle,
      message: draftFallbackMessage,
      redirectUrl: draftFallbackRedirectUrl,
      customHtml: draftFallbackCustomHtml,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftContent || !draftSeo) return;
      const result = await updateLandingPage(id!, { content: buildContentWithValidity(), seo: draftSeo });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Changes saved');
      setDirty(false);
      invalidate();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!draftContent || !draftSeo) return;
      const contentWithValidity = buildContentWithValidity();
      const saveResult = await updateLandingPage(id!, { content: contentWithValidity, seo: draftSeo });
      if (saveResult.error) throw new Error(saveResult.error);
      const result = await publishLandingPage(id!, publish, tenantId, environment, page!.slug, contentWithValidity);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: (_, publish) => {
      setMessage(
        publish
          ? page?.status === 'published'
            ? 'Page republished with latest changes'
            : 'Page published — open Settings for the live URL'
          : 'Page unpublished and converted to draft',
      );
      setDirty(false);
      invalidate();
      setTimeout(() => setMessage(''), 4000);
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const result = await updateLandingPage(id!, { name });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => invalidate(),
  });

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-slate-500">Loading page…</p>;
  }

  if (error || !page || !draftContent || !draftSeo) {
    return (
      <EmptyState
        title="Page not found"
        description="This landing page does not exist for your tenant."
        action={
          <Link to="/content/landing-pages" className="text-sm font-medium text-brand-600 hover:underline">
            Back to Landing Pages
          </Link>
        }
      />
    );
  }

  const isPublished = page.status === 'published';
  const publicToken = page.content.public_token;
  const publicUrl = publicToken ? getLandingPagePublicUrl(publicToken) : page.published_url ?? '';
  const draftPage = { ...page, content: draftContent, seo: draftSeo };
  const { label: statusLabel, badgeVariant } = getLandingPageEffectiveStatus({
    status: page.status,
    content: buildContentWithValidity(),
  });

  const settings = (
    <PageSettingsPanel
      isPublished={isPublished}
      publicUrl={publicUrl}
      copied={copied}
      onCopy={async () => {
        await copyText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      draftSeo={draftSeo}
      onSeoChange={(seo) => {
        setDraftSeo(seo);
        setDirty(true);
      }}
      userTimezone={userTimezone}
      validityEnabled={validityEnabled}
      onToggleValidity={() => {
        const next = !validityEnabled;
        setValidityEnabled(next);
        if (!next) {
          setDraftValidFrom('');
          setDraftValidUntil('');
        }
        setDirty(true);
      }}
      draftValidFrom={draftValidFrom}
      draftValidUntil={draftValidUntil}
      onValidFrom={(v) => {
        setDraftValidFrom(v);
        setDirty(true);
      }}
      onValidUntil={(v) => {
        setDraftValidUntil(v);
        setDirty(true);
      }}
      fallbackType={draftFallbackType}
      fallbackTitle={draftFallbackTitle}
      fallbackMessage={draftFallbackMessage}
      fallbackRedirectUrl={draftFallbackRedirectUrl}
      fallbackCustomHtml={draftFallbackCustomHtml}
      onFallback={(patch) => {
        if (patch.type !== undefined) setDraftFallbackType(patch.type);
        if (patch.title !== undefined) setDraftFallbackTitle(patch.title);
        if (patch.message !== undefined) setDraftFallbackMessage(patch.message);
        if (patch.redirectUrl !== undefined) setDraftFallbackRedirectUrl(patch.redirectUrl);
        if (patch.customHtml !== undefined) setDraftFallbackCustomHtml(patch.customHtml);
        setDirty(true);
      }}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      dirty={dirty}
      tenantId={tenantId}
      environment={environment}
      pageId={page.id}
    />
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white">
      {message && (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 shadow-sm">
          {message}
        </div>
      )}
      <LandingStudio
        page={draftPage}
        tenantId={tenantId}
        environment={environment}
        formOptions={formOptions}
        fullScreen
        onChange={(content) => {
          setDraftContent(content);
          setDirty(true);
        }}
        onRename={(name) => renameMutation.mutate(name)}
        onSave={() => saveMutation.mutate()}
        onPublish={(publish) => publishMutation.mutate(publish)}
        saving={saveMutation.isPending}
        publishing={publishMutation.isPending}
        dirty={dirty}
        statusBadge={<Badge variant={badgeVariant}>{statusLabel}</Badge>}
        settingsContent={settings}
        onApplySeo={(title, description) => {
          setDraftSeo({ ...draftSeo, title, description });
          setDirty(true);
        }}
        onBack={() => navigate('/content/landing-pages')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings drawer body — SEO, publish, schedule & validity, history
// ---------------------------------------------------------------------------

function PageSettingsPanel(props: {
  isPublished: boolean;
  publicUrl: string;
  copied: boolean;
  onCopy: () => void;
  draftSeo: LandingSeo;
  onSeoChange: (seo: LandingSeo) => void;
  userTimezone: string;
  validityEnabled: boolean;
  onToggleValidity: () => void;
  draftValidFrom: string;
  draftValidUntil: string;
  onValidFrom: (v: string) => void;
  onValidUntil: (v: string) => void;
  fallbackType: 'default' | 'message' | 'redirect' | 'custom_html';
  fallbackTitle: string;
  fallbackMessage: string;
  fallbackRedirectUrl: string;
  fallbackCustomHtml: string;
  onFallback: (patch: Partial<{ type: 'default' | 'message' | 'redirect' | 'custom_html'; title: string; message: string; redirectUrl: string; customHtml: string }>) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  tenantId: string;
  environment: string;
  pageId: string;
}) {
  const {
    isPublished,
    publicUrl,
    copied,
    onCopy,
    draftSeo,
    onSeoChange,
    userTimezone,
    validityEnabled,
    onToggleValidity,
    draftValidFrom,
    draftValidUntil,
    onValidFrom,
    onValidUntil,
    fallbackType,
    fallbackTitle,
    fallbackMessage,
    fallbackRedirectUrl,
    fallbackCustomHtml,
    onFallback,
    onSave,
    saving,
    dirty,
    tenantId,
    environment,
    pageId,
  } = props;

  const now = new Date();
  const vf = draftValidFrom ? new Date(draftValidFrom) : null;
  const vu = draftValidUntil ? new Date(draftValidUntil) : null;
  const isExpired = validityEnabled && vu && !isNaN(vu.getTime()) ? now > vu : false;
  const isScheduled = validityEnabled && vf && !isNaN(vf.getTime()) ? now < vf : false;

  const setPresetUntil = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    onValidUntil(toLocalDatetimeInputValue(d.toISOString()));
  };

  return (
    <div className="space-y-6">
      {/* SEO */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">SEO</h3>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Page title
            <input
              value={draftSeo.title ?? ''}
              onChange={(e) => onSeoChange({ ...draftSeo, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Meta description
            <textarea
              value={draftSeo.description ?? ''}
              onChange={(e) => onSeoChange({ ...draftSeo, description: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            OG image URL
            <input
              value={draftSeo.og_image ?? ''}
              onChange={(e) => onSeoChange({ ...draftSeo, og_image: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Card>

      {/* Publish */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Publish</h3>
        </div>
        {isPublished ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Live public URL</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {publicUrl}
                </code>
                <button type="button" onClick={onCopy} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Copy URL">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="Open live page">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Embed code</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
                {getLandingPageEmbedCode(publicUrl)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This page is a <strong>draft</strong>. Use <strong>Publish</strong> in the top bar to make it live.
          </div>
        )}
      </Card>

      {/* Schedule & validity */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Schedule &amp; validity</h3>
          </div>
          <span className="font-mono text-[11px] text-slate-400">TZ: {userTimezone}</span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
          <div className="pr-2">
            <p className="text-sm font-semibold text-slate-900">
              {validityEnabled ? 'Schedule & expiry active' : 'Always live'}
            </p>
            <p className="text-xs text-slate-500">
              {validityEnabled ? 'Access limited to the window below' : 'Live 24/7 once published'}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleValidity}
            role="switch"
            aria-checked={validityEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${validityEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${validityEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {validityEnabled && (
          <div className="mt-4 space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">Publish from</label>
                <button type="button" onClick={() => onValidFrom(toLocalDatetimeInputValue(new Date().toISOString()))} className="text-[11px] font-medium text-brand-600 hover:underline">
                  Set to now
                </button>
              </div>
              <input type="datetime-local" value={draftValidFrom} onChange={(e) => onValidFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {draftValidFrom && <p className="mt-1 text-xs font-medium text-brand-700">Starts: {formatUserFriendlyDate(draftValidFrom)}</p>}
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">Expires on</label>
                <div className="flex gap-1.5">
                  {[1, 7, 30].map((d) => (
                    <button key={d} type="button" onClick={() => setPresetUntil(d)} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200">
                      +{d}d
                    </button>
                  ))}
                </div>
              </div>
              <input type="datetime-local" value={draftValidUntil} onChange={(e) => onValidUntil(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {draftValidUntil && <p className="mt-1 text-xs font-medium text-amber-700">Ends: {formatUserFriendlyDate(draftValidUntil)}</p>}
            </div>
          </div>
        )}

        {validityEnabled && isExpired && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong className="block font-semibold">Expired</strong>Visitors see the fallback below.</span>
          </div>
        )}
        {validityEnabled && isScheduled && !isExpired && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong className="block font-semibold">Scheduled</strong>Goes live automatically at the start date.</span>
          </div>
        )}
        {validityEnabled && !isExpired && !isScheduled && (draftValidFrom || draftValidUntil) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong className="block font-semibold">Active</strong>Current time is within the window.</span>
          </div>
        )}

        {validityEnabled && (
          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">Fallback when inactive</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['default', 'Default'],
                ['message', 'Message'],
                ['redirect', 'Redirect'],
                ['custom_html', 'HTML'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onFallback({ type: v })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${fallbackType === v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {fallbackType === 'message' && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input type="text" placeholder="Custom title" value={fallbackTitle} onChange={(e) => onFallback({ title: e.target.value })} className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs" />
                <textarea placeholder="Custom message" value={fallbackMessage} onChange={(e) => onFallback({ message: e.target.value })} rows={2} className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs" />
              </div>
            )}
            {fallbackType === 'redirect' && (
              <input type="url" placeholder="https://example.com/next" value={fallbackRedirectUrl} onChange={(e) => onFallback({ redirectUrl: e.target.value })} className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs" />
            )}
            {fallbackType === 'custom_html' && (
              <textarea placeholder="<div>See you next time!</div>" value={fallbackCustomHtml} onChange={(e) => onFallback({ customHtml: e.target.value })} rows={3} className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono text-xs" />
            )}
          </div>
        )}

        <Button onClick={onSave} disabled={saving || !dirty} className="mt-4 w-full">
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </Card>

      {/* History */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">History</h3>
        </div>
        <AuditTrailPanel
          tenantId={tenantId}
          environment={environment}
          resourceType="landing_page"
          resourceId={pageId}
          title="Change history"
          subtitle="Who changed what and when"
        />
      </Card>
    </div>
  );
}
