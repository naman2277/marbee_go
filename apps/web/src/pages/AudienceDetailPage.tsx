import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  Pencil,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { AudienceDiyBuilder } from '@/components/audiences/AudienceDiyBuilder';
import { AudienceRefreshPanel } from '@/components/audiences/AudienceRefreshPanel';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { AuditTrailPanel } from '@/components/audit/AuditTrailPanel';
import { useAudienceLiveRefresh } from '@/components/audiences/useAudienceScheduler';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAudience,
  refreshAudience,
  evaluateAudienceMembers,
  fetchAudienceRefreshLogs,
  buildAudienceFilterFields,
  deleteAudience,
  cronLabel,
  formatRelativeTime,
} from '@/lib/audiences';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { formatFilterRoot } from '@/lib/schema-filters';
import { fetchSchemaRows } from '@/lib/schema-records';

type DetailTab = 'members' | 'rules' | 'schedule' | 'history' | 'audit';

export function AudienceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const tabParam = searchParams.get('tab');
  const tab: DetailTab =
    tabParam === 'rules' || tabParam === 'schedule' || tabParam === 'history' || tabParam === 'audit'
      ? tabParam
      : 'members';
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setTab = (t: DetailTab) => {
    setSearchParams(t === 'members' ? {} : { tab: t }, { replace: true });
  };

  const { data: audience, isLoading, refetch: refetchAudience } = useQuery({
    queryKey: ['audience', id],
    queryFn: () => fetchAudience(id!),
    enabled: Boolean(id),
  });

  useAudienceLiveRefresh(audience, tenantId, environment, () => {
    refetchAudience();
    refetchMembers();
    refetchLogs();
  });

  const { data: schemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const schema = useMemo(
    () => schemas?.find((s) => s.slug === audience?.schema_slug),
    [schemas, audience?.schema_slug],
  );

  const { data: rows } = useQuery({
    queryKey: ['audience-detail-rows', schema?.table_name, tenantId],
    queryFn: () => fetchSchemaRows(schema!.table_name!, tenantId, environment),
    enabled: Boolean(schema?.table_name),
  });

  const filterFields = useMemo(
    () => (schema && rows ? buildAudienceFilterFields(schema, rows) : []),
    [schema, rows],
  );

  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ['audience-members', id, audience?.filter_json, audience?.member_count],
    queryFn: () =>
      evaluateAudienceMembers({
        tenantId,
        environment,
        schema: schema!,
        filterRoot: audience!.filter_json,
        quickSearch: audience!.quick_search ?? '',
        limit: 100,
      }),
    enabled: Boolean(audience && schema),
  });

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ['audience-refresh-logs', id],
    queryFn: () => fetchAudienceRefreshLogs(id!),
    enabled: Boolean(id),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshAudience(audience!, tenantId, environment, 'manual'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audience', id] });
      refetchMembers();
      refetchLogs();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAudience(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audiences'] });
      navigate('/customers/audiences');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  if (!audience) return <p className="p-8 text-center text-slate-500">Cohort not found</p>;

  const queryText = formatFilterRoot(audience.filter_json, filterFields);
  const lastLog = logs?.[0];
  const delta = lastLog?.previous_count != null ? lastLog.member_count - lastLog.previous_count : null;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/customers/audiences"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Audience Cohorts
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setTab('rules')}
              className="font-bold text-xs shadow-2xs"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit Rules
            </Button>
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="font-bold text-xs shadow-xs"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(true)}
              className="font-bold text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-200"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between border-t border-slate-100 pt-5">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-bold shadow-2xs ${
                audience.creation_mode === 'ai'
                  ? 'bg-purple-50 text-purple-600 border border-purple-100'
                  : audience.creation_mode === 'diy'
                  ? 'bg-blue-50 text-blue-600 border border-blue-100'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {audience.creation_mode === 'ai' ? (
                <Sparkles className="h-7 w-7" />
              ) : (
                <Target className="h-7 w-7" />
              )}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">{audience.name}</h1>
              {audience.description && (
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">{audience.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {audience.schema_slug} Schema
                </span>
                <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                  {audience.creation_mode === 'ai' ? 'AI Prompt' : audience.creation_mode === 'diy' ? 'Visual Rules' : 'Template'}
                </span>
                {audience.auto_refresh && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-700">
                    <Zap className="h-3 w-3" />
                    {cronLabel(audience.refresh_cron) ?? 'Auto-refresh'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 min-w-[200px] text-right space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Evaluated Members
            </span>
            <div className="flex items-baseline justify-end gap-1.5">
              <Users className="h-5 w-5 text-brand-600 self-center" />
              <span className="text-3xl font-black tabular-nums text-slate-900">
                {(members?.total ?? audience.member_count).toLocaleString()}
              </span>
            </div>
            {delta != null && delta !== 0 && (
              <p
                className={`flex items-center justify-end gap-1 text-xs font-bold ${
                  delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {delta > 0 ? '+' : ''}
                {delta} since last sync
              </p>
            )}
            {audience.last_refreshed_at && (
              <p className="text-[10px] text-slate-400 font-medium">
                Updated {formatRelativeTime(audience.last_refreshed_at)}
              </p>
            )}
          </div>
        </div>

        {audience.ai_prompt && (
          <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-3 text-xs text-purple-950 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
            <span>Prompt: <span className="font-semibold italic">"{audience.ai_prompt}"</span></span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 pt-4">
          {[
            { id: 'members' as const, label: 'Members Preview', icon: Users },
            { id: 'rules' as const, label: 'Filter Rules', icon: Pencil },
            { id: 'schedule' as const, label: 'Sync Schedule', icon: Zap },
            { id: 'history' as const, label: 'Refresh History', icon: History },
            { id: 'audit' as const, label: 'Audit Trail', icon: Shield },
          ].map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
                tab === tabId
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200/90 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="py-2">
        {tab === 'members' && (
          <>
            {queryText && (
              <Card className="mb-6 border-violet-100 bg-violet-50/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Filter rules</p>
                    <p className="mt-2 font-mono text-sm text-slate-800">{queryText}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setTab('rules')}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </Card>
            )}

            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-violet-600" />
                  Cohort members
                  <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                    {members?.total ?? 0}
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      {(members?.members[0]
                        ? Object.keys(members.members[0]).filter((k) => !['tenant_id', 'environment'].includes(k)).slice(0, 6)
                        : ['email', 'first_name', 'status']
                      ).map((col) => (
                        <th key={col} className="px-6 py-3 font-medium capitalize">{col.replace(/_/g, ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(members?.members ?? []).map((row) => (
                      <tr key={String(row.id)} className="border-b border-slate-50 hover:bg-violet-50/30">
                        {(members?.members[0]
                          ? Object.keys(members.members[0]).filter((k) => !['tenant_id', 'environment'].includes(k)).slice(0, 6)
                          : []
                        ).map((col) => (
                          <td key={col} className="px-6 py-3 text-slate-700">
                            {String(row[col] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!members?.members?.length && (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                          No members match this cohort
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {tab === 'rules' && (
          <AudienceDiyBuilder
            tenantId={tenantId}
            environment={environment}
            audienceId={audience.id}
            editMode
            initialName={audience.name}
            initialDescription={audience.description ?? ''}
            initialSchemaSlug={audience.schema_slug}
            initialFilterRoot={audience.filter_json}
            initialQuickSearch={audience.quick_search ?? ''}
            onUpdated={() => {
              refetchAudience();
              refetchMembers();
              refetchLogs();
            }}
          />
        )}

        {tab === 'schedule' && (
          <div className="max-w-2xl">
            <AudienceRefreshPanel
              audience={audience}
              onUpdated={() => {
                refetchAudience();
                refetchLogs();
              }}
            />
          </div>
        )}

        {tab === 'audit' && (
          <AuditTrailPanel
            tenantId={tenantId}
            environment={environment}
            resourceType="audience"
            resourceId={audience.id}
            title="Cohort audit trail"
            subtitle="Who changed rules, schedule, and settings"
          />
        )}

        {tab === 'history' && (
          <Card>
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="font-semibold text-slate-900">Refresh history</h3>
            </div>
            {!logs?.length ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">No refresh runs yet</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const change = log.previous_count != null ? log.member_count - log.previous_count : null;
                  return (
                    <li key={log.id} className="flex items-center gap-4 px-6 py-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        log.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                      }`}>
                        <RefreshCw className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {log.member_count.toLocaleString()} members
                          {change != null && change !== 0 && (
                            <span className={change > 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {' '}({change > 0 ? '+' : ''}{change})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatRelativeTime(log.created_at)} · {log.triggered_by}
                          {log.message ? ` · ${log.message}` : ''}
                        </p>
                      </div>
                      <Badge variant="default">{log.triggered_by}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete cohort?"
        message={`"${audience.name}" will be permanently removed along with its refresh history.`}
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
