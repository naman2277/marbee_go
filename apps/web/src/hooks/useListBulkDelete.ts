import { useCallback, useMemo, useState } from 'react';
import type { DeletableModule } from '@/lib/delete-access';
import { runBulkDelete } from '@/lib/bulk-delete';
import { useBulkSelection } from './useBulkSelection';
import { useModuleDeleteAccess } from './useModuleDeleteAccess';

type Item = { id: string; label: string };

type Options<T extends Item> = {
  module: DeletableModule;
  items: T[];
  deleteFn: (id: string) => Promise<{ error?: string } | void>;
  onComplete?: () => void;
  /** Only these items can be selected/deleted (e.g. draft schemas). */
  isDeletable?: (item: T) => boolean;
};

export function useListBulkDelete<T extends Item>({
  module,
  items,
  deleteFn,
  onComplete,
  isDeletable,
}: Options<T>) {
  const { canDelete, resourceLabel } = useModuleDeleteAccess(module);
  const deletableItems = useMemo(
    () => (isDeletable ? items.filter(isDeletable) : items),
    [items, isDeletable],
  );
  const deletableIds = useMemo(() => deletableItems.map((i) => i.id), [deletableItems]);

  const selection = useBulkSelection(deletableIds);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lastError, setLastError] = useState('');

  const selectedItems = useMemo(
    () => deletableItems.filter((i) => selection.isSelected(i.id)),
    [deletableItems, selection.selected],
  );

  const openDeleteConfirm = useCallback(() => {
    if (!canDelete || selection.count === 0) return;
    setConfirmOpen(true);
  }, [canDelete, selection.count]);

  const confirmBulkDelete = useCallback(async () => {
    if (!selectedItems.length) return;
    setDeleting(true);
    setLastError('');
    const result = await runBulkDelete(selectedItems, deleteFn);
    setDeleting(false);
    setConfirmOpen(false);
    selection.clear();
    if (result.failed.length) {
      const summary = result.failed
        .slice(0, 3)
        .map((f) => `${f.label}: ${f.error}`)
        .join('; ');
      setLastError(
        result.failed.length === selectedItems.length
          ? `Could not delete: ${summary}`
          : `Deleted ${result.deleted.length}; failed ${result.failed.length}: ${summary}`,
      );
    }
    if (result.deleted.length) onComplete?.();
  }, [selectedItems, deleteFn, selection, onComplete]);

  return {
    canDelete,
    resourceLabel,
    selection,
    deletableIds,
    selectedItems,
    confirmOpen,
    setConfirmOpen,
    deleting,
    lastError,
    setLastError,
    openDeleteConfirm,
    confirmBulkDelete,
  };
}
