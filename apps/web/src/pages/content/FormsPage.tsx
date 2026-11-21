import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  LayoutGrid,
  List,
  Users,
  FileInput,
  ArrowRight,
  Database,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button } from '@/components/ui';
import { BulkActionBar } from '@/components/bulk/BulkActionBar';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { CreateFormWizard } from '@/components/forms/CreateFormWizard';
import { useListBulkDelete } from '@/hooks/useListBulkDelete';
import { useModuleDeleteAccess } from '@/hooks/useModuleDeleteAccess';
import { useAuth } from '@/contexts/AuthContext';
import { deleteForm, fetchForms, fetchFormSubmissionCounts, getFormPublicUrl } from '@/lib/forms';
import { formatSchemaDate } from '@/lib/schema-stats';
import { copyText } from '@/lib/schema-export';

export function FormsPage() {
  const { tenantId, environment } = useAuth();
  const { canDelete, deleteDeniedReason } = useModuleDeleteAccess('content.forms');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [storageFilter, setStorageFilter] = useState<'all' | 'customer' | 'schema'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [singleDelete, setSingleDelete] = useState<{ id: string; name: string } | null>(null);
  const [singleDeleting, setSingleDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: forms, refetch } = useQuery({
    queryKey: ['forms', tenantId, environment],
    queryFn: () => fetchForms(tenantId, environment),
  });

  const formIds = useMemo(() => forms?.map((f) => f.id) ?? [], [forms]);

  const { data: submissionCounts } = useQuery({
    queryKey: ['form-submission-counts', formIds.join(',')],
    queryFn: () => fetchFormSubmissionCounts(formIds),
    enabled: formIds.length > 0,
  });

  // Calculate high-level KPIs
  const totalSubmissions = useMemo(() => {
    if (!submissionCounts) return 0;
    let sum = 0;
    submissionCounts.forEach((count) => {
      sum += count;
    });
    return sum;
  }, [submissionCounts]);

  const publishedCount = useMemo(() => {
    return forms?.filter((f) => f.status === 'published').length ?? 0;
  }, [forms]);

  const filtered = useMemo(() => {
    let list = forms ?? [];
    if (statusFilter !== 'all') {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (storageFilter !== 'all') {
      list = list.filter((f) => (f.schema_mapping.storage_target ?? 'customer') === storageFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.slug.toLowerCase().includes(q) ||
          (f.settings.description ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [forms, search, statusFilter, storageFilter]);

  const listItems = useMemo(() => filtered.map((f) => ({ id: f.id, label: f.name })), [filtered]);

  const bulk = useListBulkDelete({
    module: 'content.forms',
    items: listItems,
    deleteFn: deleteForm,
    onComplete: () => refetch(),
  });

  const handleSingleDelete = async () => {
    if (!singleDelete) return;
    setSingleDeleting(true);
    const result = await deleteForm(singleDelete.id);
    setSingleDeleting(false);
    if (result.error) {
      bulk.setLastError(result.error);
      return;
    }
    setSingleDelete(null);
    refetch();
  };

  const copyUrl = async (formId: string, slug: string) => {
    await copyText(getFormPublicUrl(slug, tenantId, environment));
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Capture & Forms Studio"
        description="Build responsive lead capture forms, surveys, and RSVP flows synced directly to your Customer 360 database."
        action={
          <Button onClick={() => setShowCreate(true)} className="shadow-xs">
            <Plus className="mr-1.5 h-4 w-4" />
            Create New Form
          </Button>
        }
      />

      {!canDelete && deleteDeniedReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {deleteDeniedReason}
        </div>
      )}

      {/* KPI METRICS RIBBON */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Forms</span>
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
              <FileInput className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{forms?.length ?? 0}</p>
          <span className="text-[11px] text-slate-400">All environments</span>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Leads Captured</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalSubmissions.toLocaleString()}</p>
          <span className="text-[11px] text-emerald-600 font-semibold">Synced to CRM</span>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Published (Live)</span>
            <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{publishedCount}</p>
          <span className="text-[11px] text-slate-400">Accepting responses</span>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Customer 360 Mapped</span>
            <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Database className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {forms?.filter((f) => (f.schema_mapping.storage_target ?? 'customer') === 'customer').length ?? 0}
          </p>
          <span className="text-[11px] text-purple-600 font-medium">Auto-upsert enabled</span>
        </Card>
      </div>

      {/* FILTER & VIEW TOOLBAR */}
      <Card className="border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-1 items-center gap-3 min-w-[280px]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search forms by name, slug, description…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published (Live)</option>
              <option value="draft">Drafts</option>
            </select>

            <select
              value={storageFilter}
              onChange={(e) => setStorageFilter(e.target.value as typeof storageFilter)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Data Targets</option>
              <option value="customer">Customer 360</option>
              <option value="schema">Custom Schema Entity</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Showing {filtered.length} of {forms?.length ?? 0}
            </span>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-1.5 transition ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-1.5 transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <BulkActionBar
          count={bulk.selection.count}
          resourceLabel={bulk.resourceLabel}
          onDelete={bulk.openDeleteConfirm}
          onClear={bulk.selection.clear}
          disabled={!canDelete || bulk.deleting}
        />

        {bulk.lastError && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-xs text-red-700">{bulk.lastError}</div>
        )}

        {/* VIEW MODE 1: RICH GRID VIEW */}
        {viewMode === 'grid' && (
          <div className="p-6">
            {filtered.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((form) => {
                  const count = submissionCounts?.get(form.id) ?? 0;
                  const isPublished = form.status === 'published';
                  const isCustomerTarget = (form.schema_mapping.storage_target ?? 'customer') === 'customer';

                  return (
                    <div
                      key={form.id}
                      className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-300 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <Badge variant={isPublished ? 'success' : 'warning'}>
                            {isPublished ? `Live v${form.settings.live_version || 1}` : 'Draft'}
                          </Badge>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {isCustomerTarget ? <Users className="h-3 w-3 text-purple-600" /> : <Database className="h-3 w-3 text-sky-600" />}
                            <span>{isCustomerTarget ? 'Customer 360' : 'Custom Schema'}</span>
                          </span>
                        </div>

                        <div>
                          <Link
                            to={`/content/forms/${form.id}`}
                            className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition"
                          >
                            {form.name}
                          </Link>
                          <p className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                            /forms/{form.slug}
                          </p>
                          {form.settings.description && (
                            <p className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                              {form.settings.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-4 pt-1 text-xs text-slate-600">
                          <div>
                            <span className="font-bold text-slate-900 text-sm">{count.toLocaleString()}</span>
                            <span className="text-[11px] text-slate-400 ml-1">leads</span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-sm">{form.fields.length}</span>
                            <span className="text-[11px] text-slate-400 ml-1">fields</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {isPublished && (
                            <button
                              type="button"
                              onClick={() => copyUrl(form.id, form.slug)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition"
                              title="Copy public link"
                            >
                              {copiedId === form.id ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setSingleDelete({ id: form.id, name: form.name })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                              title="Delete form"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <Link
                          to={`/content/forms/${form.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                        >
                          <span>Open Builder</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <FileInput className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <h4 className="text-sm font-bold text-slate-900">No forms found</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {forms?.length ? 'No forms match your search filters.' : 'Get started by creating your first lead capture form.'}
                </p>
                <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Form
                </Button>
              </div>
            )}
          </div>
        )}

        {/* VIEW MODE 2: DENSE TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500 bg-slate-50/50">
                  {canDelete && (
                    <th className="w-10 px-4 py-3">
                      <SelectCheckbox
                        checked={bulk.selection.allSelected && listItems.length > 0}
                        indeterminate={bulk.selection.someSelected && !bulk.selection.allSelected}
                        onChange={() => bulk.selection.toggleAll()}
                        aria-label="Select all forms"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 font-semibold">Form Details</th>
                  <th className="px-4 py-3 font-semibold">Storage Target</th>
                  <th className="px-4 py-3 font-semibold">Responses</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((form) => {
                  const count = submissionCounts?.get(form.id) ?? 0;
                  const isCustomerTarget = (form.schema_mapping.storage_target ?? 'customer') === 'customer';

                  return (
                    <tr key={form.id} className="hover:bg-slate-50/80 transition">
                      {canDelete && (
                        <td className="px-4 py-3">
                          <SelectCheckbox
                            checked={bulk.selection.isSelected(form.id)}
                            onChange={() => bulk.selection.toggle(form.id)}
                            aria-label={`Select ${form.name}`}
                          />
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <Link
                          to={`/content/forms/${form.id}`}
                          className="font-bold text-slate-900 hover:text-brand-600 transition"
                        >
                          {form.name}
                        </Link>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">/forms/{form.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {isCustomerTarget ? <Users className="h-3 w-3 text-purple-600" /> : <Database className="h-3 w-3 text-sky-600" />}
                          <span>{isCustomerTarget ? 'Customer 360' : 'Custom Schema'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-800">
                        {count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={form.status === 'published' ? 'success' : 'warning'}>
                          {form.status === 'published' ? 'Live' : 'Draft'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatSchemaDate(form.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {form.status === 'published' && (
                            <button
                              type="button"
                              title="Copy form URL"
                              onClick={() => copyUrl(form.id, form.slug)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition"
                            >
                              {copiedId === form.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <Link
                            to={`/content/forms/${form.id}`}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition"
                            title="Edit form"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          {canDelete && (
                            <button
                              type="button"
                              title="Delete form"
                              onClick={() => setSingleDelete({ id: form.id, name: form.name })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && <CreateFormWizard onClose={() => setShowCreate(false)} />}

      <BulkDeleteDialog
        open={bulk.confirmOpen}
        title="Delete forms"
        resourceLabel={bulk.resourceLabel}
        items={bulk.selectedItems}
        loading={bulk.deleting}
        onConfirm={bulk.confirmBulkDelete}
        onCancel={() => bulk.setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(singleDelete)}
        title="Delete form"
        message={
          singleDelete
            ? `You are about to permanently delete the form "${singleDelete.name}" and all its captured submissions. This action cannot be undone.`
            : ''
        }
        loading={singleDeleting}
        onConfirm={handleSingleDelete}
        onCancel={() => setSingleDelete(null)}
      />
    </div>
  );
}
