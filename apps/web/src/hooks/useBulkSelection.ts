import { useCallback, useMemo, useState } from 'react';

export function useBulkSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectableIds = useMemo(() => [...new Set(allIds)], [allIds.join('|')]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (ids?: string[]) => {
      const target = ids ?? selectableIds;
      setSelected((prev) => {
        const allSelected = target.length > 0 && target.every((id) => prev.has(id));
        if (allSelected) return new Set();
        return new Set(target);
      });
    },
    [selectableIds],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const count = selected.size;

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const someSelected = selectableIds.some((id) => selected.has(id));

  return {
    selected,
    selectedIds: [...selected],
    count,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    clear,
    isSelected,
    setSelected,
  };
}
