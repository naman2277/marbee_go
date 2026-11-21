import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Unlink,
  User,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  fetchSocialAccounts,
  connectSocialAccount,
  disconnectSocialAccount,
  publishSocialPost,
} from '@/lib/social-media';
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  type SocialAccount,
} from '@/lib/social-providers';
import { copyText } from '@/lib/schema-export';
import { AnimatedSocialIcon } from './AnimatedSocialIcon';

type Props = {
  tenantId: string;
  environment: string;
};

const PLATFORM_CAPABILITIES: Record<SocialPlatform, string[]> = {
  linkedin: ['Company Pages', 'Rich Articles', 'PDF / Carousel', 'Interactive Polls', 'Lead CTAs'],
  instagram: ['Feed Photos', 'Multi-Image Carousels', 'Vertical Reels (9:16)', 'Auto First Comment'],
  facebook: ['Page Feed', 'High-Res Video', 'Link Previews', 'Engagement Tracking'],
  x: ['Instant Tweets', 'Media Attachments', 'Polls', 'Thread Series'],
};

export function SocialConnectionsManager({ tenantId, environment }: Props) {
  const queryClient = useQueryClient();
  const [connectingPlatform, setConnectingPlatform] = useState<SocialPlatform | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [disconnectingAccount, setDisconnectingAccount] = useState<SocialAccount | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<SocialPlatform | null>(null);
  const [testResult, setTestResult] = useState<{ platform: SocialPlatform; success: boolean; message: string } | null>(null);

  const [form, setForm] = useState<
    Record<SocialPlatform, { clientId: string; accountName: string; accessToken: string; accountId: string }>
  >({
    linkedin: { clientId: '', accountName: '', accessToken: '', accountId: '' },
    facebook: { clientId: '', accountName: '', accessToken: '', accountId: '' },
    instagram: { clientId: '', accountName: '', accessToken: '', accountId: '' },
    x: { clientId: '', accountName: '', accessToken: '', accountId: '' },
  });

  const { data: accounts } = useQuery({
    queryKey: ['social-accounts', tenantId, environment],
    queryFn: () => fetchSocialAccounts(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const connectMutation = useMutation({
    mutationFn: (platform: SocialPlatform) => {
      const f = form[platform];
      return connectSocialAccount({
        tenantId,
        environment,
        platform,
        accountName: f.accountName || `${SOCIAL_PLATFORMS.find((p) => p.id === platform)?.label} Account`,
        accountId: f.accountId || undefined,
        accessToken: f.accessToken,
        config: { client_id: f.clientId },
      });
    },
    onSuccess: () => {
      setConnectingPlatform(null);
      void queryClient.invalidateQueries({ queryKey: ['social-accounts', tenantId, environment] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (platform: SocialPlatform) => disconnectSocialAccount(tenantId, platform),
    onSuccess: () => {
      setDisconnectingAccount(null);
      void queryClient.invalidateQueries({ queryKey: ['social-accounts', tenantId, environment] });
    },
  });

  const handleTestPost = async (platform: SocialPlatform) => {
    setTestingPlatform(platform);
    setTestResult(null);
    try {
      const res = await publishSocialPost({
        tenantId,
        environment,
        content: `🎉 Marbee Social Connection Test for ${platform.toUpperCase()} — Published via BYOP API on ${new Date().toLocaleDateString()}`,
        mediaUrls: [],
        linkUrl: 'https://marbee.io',
        platforms: [platform],
      });
      if (res.status === 'failed' || res.errorMessage) {
        setTestResult({
          platform,
          success: false,
          message: res.errorMessage || 'Publish test failed. Please verify your token permissions.',
        });
      } else {
        setTestResult({
          platform,
          success: true,
          message: `Verified! Sample post broadcasted successfully to ${platform}.`,
        });
      }
    } catch (e: any) {
      setTestResult({
        platform,
        success: false,
        message: e?.message || 'Error executing publish test.',
      });
    } finally {
      setTestingPlatform(null);
    }
  };

  const accountMap = new Map((accounts ?? []).map((a) => [a.platform, a]));
  const connectedCount = accounts?.filter((a) => a.status === 'connected').length || 0;
  const redirectUri = `${window.location.origin}/settings/social/callback`;

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-brand-300">
                Omni-Channel Social Cloud
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Social Media Broadcast Connectors
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Connect your official brand channels to schedule, preview, and broadcast marketing campaigns natively with real-time token synchronization and API rate management.
            </p>
          </div>

          {/* KPI Ribbon */}
          <div className="flex items-center gap-3 self-start md:self-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-3 text-center min-w-[110px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Connected</p>
              <p className="mt-0.5 text-2xl font-black text-white">
                {connectedCount} <span className="text-xs font-normal text-slate-400">/ 4</span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-3 text-center min-w-[110px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
              <p className="mt-0.5 text-sm font-black text-emerald-400 flex items-center justify-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                {connectedCount > 0 ? 'Active' : 'Standby'}
              </p>
            </div>
          </div>
        </div>

        {/* OAuth Redirect URI Helper */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium">OAuth 2.0 Redirect URI:</span>
            <code className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1 font-mono text-[11px] text-brand-200">
              {redirectUri}
            </code>
          </div>

          <button
            type="button"
            onClick={async () => {
              await copyText(redirectUri);
              setCopiedRedirect(true);
              setTimeout(() => setCopiedRedirect(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition shadow-xs"
          >
            {copiedRedirect ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-300" />
                <span>Copy Redirect URI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Test Alert Output */}
      {testResult && (
        <div
          className={`flex items-start justify-between rounded-2xl border p-4 text-xs animate-in fade-in zoom-in-95 ${
            testResult.success
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
              : 'border-rose-200 bg-rose-50/80 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {testResult.success ? 'Broadcast Test Passed' : 'Broadcast Test Failed'}
              </p>
              <p className="mt-0.5 text-slate-600">{testResult.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTestResult(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Connection Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const connected = accountMap.get(platform.id);
          const isConnected = connected?.status === 'connected';
          const capabilities = PLATFORM_CAPABILITIES[platform.id] || [];

          return (
            <div
              key={platform.id}
              className={`group relative overflow-hidden rounded-3xl border transition-all duration-300 hover:shadow-xl ${
                isConnected
                  ? 'border-slate-200 bg-white shadow-sm ring-1 ring-slate-100'
                  : 'border-slate-200/80 bg-slate-50/40 hover:bg-white shadow-2xs'
              }`}
            >
              {/* Top Accent Line */}
              <div
                className="h-1.5 w-full transition-all duration-300"
                style={{ backgroundColor: platform.color }}
              />

              <div className="p-6 space-y-5">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <AnimatedSocialIcon
                      platform={platform.id}
                      size="lg"
                      connected={isConnected}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900">
                          {platform.label}
                        </h3>
                        {isConnected && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Live
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Limit: {platform.charLimit.toLocaleString()} chars
                      </p>
                    </div>
                  </div>

                  <Badge variant={isConnected ? 'success' : 'default'} className="rounded-xl px-2.5 py-1 font-bold text-[11px]">
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>

                {/* Capabilities Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded-lg bg-slate-100/80 px-2 py-1 text-[10px] font-semibold text-slate-600"
                    >
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Body Content */}
                {isConnected && connected ? (
                  <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-700 text-xs shrink-0">
                          {connected.accountName?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {connected.accountName}
                          </p>
                          {connected.accountId && (
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              ID: {connected.accountId}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="text-[10px] font-semibold text-slate-400">
                        {connected.connectedAt
                          ? `Linked ${new Date(connected.connectedAt).toLocaleDateString()}`
                          : 'Active'}
                      </span>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={testingPlatform === platform.id}
                        onClick={() => handleTestPost(platform.id)}
                        className="rounded-xl font-bold border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-100 shadow-2xs"
                      >
                        {testingPlatform === platform.id ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Broadcasting…
                          </>
                        ) : (
                          <>
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            Send Test Post
                          </>
                        )}
                      </Button>

                      <div className="flex items-center gap-2">
                        <a
                          href={platform.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-700 transition"
                          title="View API Documentation"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDisconnectingAccount(connected)}
                          className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-semibold"
                        >
                          <Unlink className="mr-1.5 h-3.5 w-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Connect your {platform.label} Developer App or Page Token to automate campaign broadcasts, publish media, and track engagement.
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <a
                        href={platform.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline font-bold"
                      >
                        <span>API Docs</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      <Button
                        size="sm"
                        onClick={() => setConnectingPlatform(platform.id)}
                        className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs transition hover:scale-102"
                      >
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        Connect {platform.label}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Configuration Modal */}
      {connectingPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center gap-3">
                <AnimatedSocialIcon platform={connectingPlatform} size="md" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Connect {SOCIAL_PLATFORMS.find((p) => p.id === connectingPlatform)?.label}
                  </h3>
                  <p className="text-xs text-slate-500">API Credentials & Page Token Setup</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConnectingPlatform(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Quick Instructions */}
              <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 text-slate-700 space-y-2">
                <p className="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-600" />
                  Integration Steps:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>
                    Register a Developer App on the{' '}
                    <a
                      href={SOCIAL_PLATFORMS.find((p) => p.id === connectingPlatform)?.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-brand-700 underline"
                    >
                      {SOCIAL_PLATFORMS.find((p) => p.id === connectingPlatform)?.label} Developer Portal
                    </a>.
                  </li>
                  <li>
                    Set the OAuth Redirect URI to: <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-800">{redirectUri}</code>
                  </li>
                  <li>
                    Generate an Access Token with publishing permissions and paste below.
                  </li>
                </ol>
              </div>

              {/* Input Fields */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Account / Brand Name *</label>
                  <input
                    type="text"
                    value={form[connectingPlatform].accountName}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [connectingPlatform]: { ...form[connectingPlatform], accountName: e.target.value },
                      })
                    }
                    placeholder={`e.g. ${SOCIAL_PLATFORMS.find((p) => p.id === connectingPlatform)?.label} Official`}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Client ID / App ID</label>
                  <input
                    type="text"
                    value={form[connectingPlatform].clientId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [connectingPlatform]: { ...form[connectingPlatform], clientId: e.target.value },
                      })
                    }
                    placeholder="From Developer App Dashboard"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Access Token / Page Access Token *</label>
                  <input
                    type="password"
                    value={form[connectingPlatform].accessToken}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [connectingPlatform]: { ...form[connectingPlatform], accessToken: e.target.value },
                      })
                    }
                    placeholder="Paste permanent bearer or page access token"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Page ID / Organization URN (Optional)</label>
                  <input
                    type="text"
                    value={form[connectingPlatform].accountId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [connectingPlatform]: { ...form[connectingPlatform], accountId: e.target.value },
                      })
                    }
                    placeholder="e.g. urn:li:organization:12345 or Page ID"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <Button variant="secondary" onClick={() => setConnectingPlatform(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => connectMutation.mutate(connectingPlatform)}
                disabled={connectMutation.isPending || !form[connectingPlatform].accessToken.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-xs"
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Link2 className="mr-1.5 h-4 w-4" />
                    Save & Activate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Dialog */}
      {disconnectingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <AnimatedSocialIcon platform={disconnectingAccount.platform} size="md" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Disconnect Platform?</h3>
                <p className="text-xs text-slate-500">{disconnectingAccount.accountName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to disconnect this channel? Automated scheduled posts to {disconnectingAccount.platform} will be paused.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDisconnectingAccount(null)}
                disabled={disconnectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                onClick={() => disconnectMutation.mutate(disconnectingAccount.platform)}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? 'Disconnecting…' : 'Yes, Disconnect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
