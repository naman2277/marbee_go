import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Folder,
  FileText,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button } from '@/components/ui';
import { BulkActionBar } from '@/components/bulk/BulkActionBar';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { NewLandingPageModal } from '@/components/landing-pages/NewLandingPageModal';
import { LandingThumbnail } from '@/components/landing-pages/LandingThumbnail';
import { useListBulkDelete } from '@/hooks/useListBulkDelete';
import { useModuleDeleteAccess } from '@/hooks/useModuleDeleteAccess';
import { useAuth } from '@/contexts/AuthContext';
import {
  createLandingPage,
  deleteLandingPage,
  fetchLandingPages,
  getLandingPagePublicUrl,
  getLandingPageEffectiveStatus,
  type LandingContent,
  type LandingPageEffectiveStatus,
  type MarbeeLandingPage,
} from '@/lib/landing-pages';
import { countBlocks } from '@/lib/landing-blocks';
import { formatSchemaDate } from '@/lib/schema-stats';
import { copyText } from '@/lib/schema-export';
import {
  OOTB_LANDING_PAGE_TEMPLATES,
  OOTB_TEMPLATE_CATEGORIES,
  type OOTBLandingPageTemplate,
} from '@/lib/landing-page-templates';

export function LandingPagesPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const { canDelete, deleteDeniedReason } = useModuleDeleteAccess('content.landing_pages');

  const [activeFolder, setActiveFolder] = useState<'my-pages' | 'ootb'>('my-pages');
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LandingPageEffectiveStatus>('all');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [singleDelete, setSingleDelete] = useState<{ id: string; name: string } | null>(null);
  const [singleDeleting, setSingleDeleting] = useState(false);

  const { data: pages, isLoading, refetch } = useQuery({
    queryKey: ['landing-pages', tenantId, environment],
    queryFn: () => fetchLandingPages(tenantId, environment),
  });

  const filtered = useMemo(() => {
    let list = pages ?? [];
    if (statusFilter !== 'all') {
      list = list.filter((p) => getLandingPageEffectiveStatus(p).status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
    return list;
  }, [pages, search, statusFilter]);

  const listItems = useMemo(() => filtered.map((p) => ({ id: p.id, label: p.name })), [filtered]);

  const bulk = useListBulkDelete({
    module: 'content.landing_pages',
    items: listItems,
    deleteFn: deleteLandingPage,
    onComplete: () => refetch(),
  });

  const handleCreate = async (name: string, content?: LandingContent) => {
    setCreating(true);
    setCreateError('');
    const result = await createLandingPage(tenantId, environment, name, content);
    setCreating(false);
    if (result.error) {
      setCreateError(result.error);
      return;
    }
    setShowCreate(false);
    if (result.page) navigate(`/content/landing-pages/${result.page.id}`);
    else refetch();
  };

  const handleUseTemplate = async (template: OOTBLandingPageTemplate) => {
    setCreating(true);
    const uniqueName = `${template.name} ${Math.floor(Math.random() * 1000)}`;
    const result = await createLandingPage(tenantId, environment, uniqueName, template.content);
    setCreating(false);
    if (result.error) {
      alert(result.error);
      return;
    }
    if (result.page) navigate(`/content/landing-pages/${result.page.id}`);
  };

  const handleSingleDelete = async () => {
    if (!singleDelete) return;
    setSingleDeleting(true);
    const result = await deleteLandingPage(singleDelete.id);
    setSingleDeleting(false);
    if (result.error) {
      bulk.setLastError(result.error);
      return;
    }
    setSingleDelete(null);
    refetch();
  };

  const getPublicPageUrl = (p: MarbeeLandingPage) =>
    p.content?.public_token
      ? getLandingPagePublicUrl(p.content.public_token)
      : p.published_url || getLandingPagePublicUrl(p.slug);

  const copyUrl = async (p: MarbeeLandingPage) => {
    await copyText(getPublicPageUrl(p));
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <PageHeader
        title="Landing Pages"
        description="Campaign pages with a visual block studio, AI drafting, SEO and scheduling"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New page
          </Button>
        }
      />

      {!canDelete && deleteDeniedReason && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {deleteDeniedReason}
        </div>
      )}

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Sidebar */}
        <div className="w-full shrink-0 space-y-1 md:w-56">
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Library</p>
          <button
            onClick={() => setActiveFolder('my-pages')}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeFolder === 'my-pages' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="h-4 w-4" /> My Pages
          </button>
          <button
            onClick={() => setActiveFolder('ootb')}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeFolder === 'ootb' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Folder className="h-4 w-4" /> Templates
          </button>
        </div>

        {/* Main */}
        <div className="w-full min-w-0 flex-1">
          {activeFolder === 'my-pages' ? (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search pages…"
                  className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="expired">Expired</option>
                </select>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setView('gallery')}
                    className={`rounded-md p-1.5 ${view === 'gallery' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    title="Gallery view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('table')}
                    className={`rounded-md p-1.5 ${view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    title="Table view"
                  >
                    <TableIcon className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-slate-500">
                  {filtered.length} of {pages?.length ?? 0}
                </span>
              </div>

              <BulkActionBar
                count={bulk.selection.count}
                resourceLabel={bulk.resourceLabel}
                onDelete={bulk.openDeleteConfirm}
                onClear={bulk.selection.clear}
                disabled={!canDelete || bulk.deleting}
              />
              {bulk.lastError && (
                <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{bulk.lastError}</div>
              )}

              {isLoading ? (
                <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {pages?.length ? 'No pages match your filters.' : 'No landing pages yet. Create one to get started.'}
                </p>
              ) : view === 'gallery' ? (
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((page) => (
                    <GalleryCard
                      key={page.id}
                      page={page}
                      tenantId={tenantId}
                      environment={environment}
                      canDelete={canDelete}
                      selected={bulk.selection.isSelected(page.id)}
                      onToggleSelect={() => bulk.selection.toggle(page.id)}
                      copied={copiedId === page.id}
                      onCopy={() => copyUrl(page)}
                      publicUrl={getPublicPageUrl(page)}
                      onDelete={() => setSingleDelete({ id: page.id, name: page.name })}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-500">
                        {canDelete && (
                          <th className="w-10 px-4 py-3">
                            <SelectCheckbox
                              checked={bulk.selection.allSelected && listItems.length > 0}
                              indeterminate={bulk.selection.someSelected && !bulk.selection.allSelected}
                              onChange={() => bulk.selection.toggleAll()}
                              aria-label="Select all"
                            />
                          </th>
                        )}
                        <th className="px-6 py-3 font-medium">Page</th>
                        <th className="px-4 py-3 font-medium">Blocks</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                        <th className="w-28 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((page) => {
                        const { label, badgeVariant } = getLandingPageEffectiveStatus(page);
                        return (
                          <tr key={page.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                            {canDelete && (
                              <td className="px-4 py-3">
                                <SelectCheckbox
                                  checked={bulk.selection.isSelected(page.id)}
                                  onChange={() => bulk.selection.toggle(page.id)}
                                  aria-label={`Select ${page.name}`}
                                />
                              </td>
                            )}
                            <td className="px-6 py-3">
                              <Link to={`/content/landing-pages/${page.id}`} className="font-medium text-brand-600 hover:underline">
                                {page.name}
                              </Link>
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">/pages/{page.slug}</p>
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate-700">{countBlocks(page.content.sections)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={badgeVariant}>{label}</Badge>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatSchemaDate(page.updated_at)}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {page.status === 'published' && (
                                  <>
                                    <a href={getPublicPageUrl(page)} target="_blank" rel="noreferrer" title="Open live page" className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                    <button type="button" title="Copy URL" onClick={() => copyUrl(page)} className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600">
                                      {copiedId === page.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                  </>
                                )}
                                {canDelete && (
                                  <button type="button" title="Delete" onClick={() => setSingleDelete({ id: page.id, name: page.name })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
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
          ) : (
            <div className="space-y-6">
              {OOTB_TEMPLATE_CATEGORIES.map((cat) => {
                const items = OOTB_LANDING_PAGE_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{cat}</p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((template) => (
                        <Card key={template.id} className="flex flex-col transition-shadow hover:shadow-md">
                          <div className="flex-1 border-b border-slate-100 p-5">
                            <h3 className="text-sm font-semibold text-slate-800">{template.name}</h3>
                            <p className="mt-1.5 text-xs leading-snug text-slate-600">{template.description}</p>
                            <p className="mt-2 text-[10px] text-slate-400">{template.content.sections.length} blocks</p>
                          </div>
                          <div className="p-3">
                            <Button className="w-full" variant="secondary" onClick={() => handleUseTemplate(template)} disabled={creating}>
                              <Plus className="mr-1.5 h-4 w-4" />
                              Use template
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <NewLandingPageModal
          onClose={() => {
            setShowCreate(false);
            setCreateError('');
          }}
          onCreate={handleCreate}
          loading={creating}
          error={createError}
          tenantId={tenantId}
          environment={environment}
        />
      )}

      <BulkDeleteDialog
        open={bulk.confirmOpen}
        title="Delete landing pages"
        resourceLabel={bulk.resourceLabel}
        items={bulk.selectedItems}
        loading={bulk.deleting}
        onConfirm={bulk.confirmBulkDelete}
        onCancel={() => bulk.setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(singleDelete)}
        title="Delete landing page"
        message={
          singleDelete
            ? `You are about to permanently delete "${singleDelete.name}". This cannot be undone.`
            : ''
        }
        loading={singleDeleting}
        onConfirm={handleSingleDelete}
        onCancel={() => setSingleDelete(null)}
      />
    </div>
  );
}

function GalleryCard({
  page,
  tenantId,
  environment,
  canDelete,
  selected,
  onToggleSelect,
  copied,
  onCopy,
  publicUrl,
  onDelete,
}: {
  page: MarbeeLandingPage;
  tenantId: string;
  environment: string;
  canDelete: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  copied: boolean;
  onCopy: () => void;
  publicUrl: string;
  onDelete: () => void;
}) {
  const { label, badgeVariant } = getLandingPageEffectiveStatus(page);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      {canDelete && (
        <div className="absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <SelectCheckbox checked={selected} onChange={onToggleSelect} aria-label={`Select ${page.name}`} />
        </div>
      )}
      <Link to={`/content/landing-pages/${page.id}`} className="block">
        <div className="relative h-44 overflow-hidden border-b border-slate-100 bg-slate-50">
          {page.content.sections.length === 0 && page.content.mode !== 'html' ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Empty page</div>
          ) : (
            <LandingThumbnail page={page} tenantId={tenantId} environment={environment} />
          )}
        </div>
      </Link>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/content/landing-pages/${page.id}`} className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 hover:text-brand-600">{page.name}</p>
            <p className="truncate font-mono text-[10px] text-slate-400">/pages/{page.slug}</p>
          </Link>
          <Badge variant={badgeVariant}>{label}</Badge>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {countBlocks(page.content.sections)} blocks · {formatSchemaDate(page.updated_at)}
          </span>
          <div className="flex gap-0.5">
            {page.status === 'published' && (
              <>
                <a href={publicUrl} target="_blank" rel="noreferrer" title="Open live" className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button type="button" title="Copy URL" onClick={onCopy} className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
            {canDelete && (
              <button type="button" title="Delete" onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
