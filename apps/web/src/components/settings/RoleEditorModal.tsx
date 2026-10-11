import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import {
  PERMISSION_CATALOG,
  PERMISSION_CATEGORY_LABELS,
  PERMISSIONS,
  type PermissionSlug,
} from '@/lib/permissions';
import type { TenantRole } from '@/lib/access-management';
import { cn } from '@/lib/utils';

export type RoleEditorValues = {
  name: string;
  description: string;
  permissionSlugs: string[];
};

type RoleEditorModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  role?: TenantRole | null;
  saving?: boolean;
  deleting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: RoleEditorValues) => void;
  onDelete?: () => void;
};

function togglePermission(slugs: string[], slug: string, enabled: boolean): string[] {
  if (enabled) {
    return slugs.includes(slug) ? slugs : [...slugs, slug].sort();
  }
  return slugs.filter((s) => s !== slug);
}

export function RoleEditorModal({
  open,
  mode,
  role,
  saving,
  deleting,
  error,
  onClose,
  onSave,
  onDelete,
}: RoleEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissionSlugs, setPermissionSlugs] = useState<string[]>([]);

  const isTenantAdmin = role?.slug === 'tenant_admin';
  const permissionsLocked = mode === 'edit' && isTenantAdmin;

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setPermissionSlugs(role?.permissionSlugs ?? []);
  }, [open, role]);

  const permissionsByCategory = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const p of PERMISSION_CATALOG) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, []);

  if (!open) return null;

  const canDelete = mode === 'edit' && role && !role.isSystem && role.slug !== 'tenant_admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create' ? 'Create role' : `Edit role — ${role?.name ?? ''}`}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose which functionalities members with this role can use.
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Role name</label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Campaign editor"
              />
            </div>
            {mode === 'edit' && role && (
              <div>
                <label className="text-xs font-medium text-slate-600">Slug</label>
                <input
                  readOnly
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
                  value={role.slug}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Description</label>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for…"
            />
          </div>

          {permissionsLocked && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Workspace Admin always has full access. You can edit the display name and description only.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Functionalities</h3>
              {!permissionsLocked && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:underline"
                    onClick={() =>
                      setPermissionSlugs(PERMISSION_CATALOG.map((p) => p.slug))
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 hover:underline"
                    onClick={() => setPermissionSlugs([])}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-4">
              {[...permissionsByCategory.entries()].map(([category, perms]) => (
                <div key={category} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {PERMISSION_CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div className="mt-3 space-y-2">
                    {perms.map((perm) => {
                      const checked =
                        permissionsLocked && isTenantAdmin
                          ? true
                          : permissionSlugs.includes(perm.slug);
                      return (
                        <label
                          key={perm.slug}
                          className={cn(
                            'flex items-start gap-3 rounded-lg px-2 py-2',
                            !permissionsLocked && 'hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            checked={checked}
                            disabled={permissionsLocked}
                            onChange={(e) =>
                              setPermissionSlugs((current) =>
                                togglePermission(current, perm.slug, e.target.checked),
                              )
                            }
                          />
                          <span>
                            <span className="block text-sm font-medium text-slate-800">{perm.name}</span>
                            <span className="block text-xs text-slate-500">{perm.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <div>
            {canDelete && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                disabled={deleting || saving}
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete role
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={saving || deleting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={saving || deleting || !name.trim() || (!permissionsLocked && permissionSlugs.length === 0)}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  description: description.trim(),
                  permissionSlugs: permissionsLocked
                    ? PERMISSION_CATALOG.map((p) => p.slug)
                    : permissionSlugs,
                })
              }
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function canManageRoles(
  hasPermission: (permission: PermissionSlug | string) => boolean,
  isAdmin?: boolean,
): boolean {
  return isAdmin || hasPermission(PERMISSIONS.ACCESS_ROLES_MANAGE) || hasPermission(PERMISSIONS.ACCESS_MANAGE);
}
