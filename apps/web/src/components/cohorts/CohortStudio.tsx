/**
 * Cohort Studio — the three-panel shell.
 *
 * Layout: Left (logic tree) | Middle (AI agent) | Right (preview)
 * Bottom: Inspector tabs (Query, Explanation, Members, Analytics, History)
 *
 * All IR mutations flow through useHistoryState for undo/redo. The studio can
 * run standalone (dev harness) or be embedded in AudienceDetailPage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { useHistoryState } from '@/hooks/useHistoryState';
import {
  addNode,
  duplicateNode,
  isEmptyIR,
  moveNode,
  removeNode,
  updateNode,
  wrapInGroup,
  type CohortIR,
  type CohortNode,
} from '@/lib/cohorts/ir';
import type { SemanticCatalog } from '@/lib/cohorts/catalog';
import { validateCohortIR, type ValidationResult } from '@/lib/cohorts/validate';
import type { CohortDataset, CohortEvaluation } from '@/lib/cohorts/evaluate';
import { evaluateCohort } from '@/lib/cohorts/evaluate';
import { CohortLogicTree, type TreeActions } from './CohortLogicTree';
import { CohortAgentPanel } from './CohortAgentPanel';
import { CohortPreviewPanel } from './CohortPreviewPanel';
import { CohortInspector } from './CohortInspector';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

export type CohortStudioProps = {
  initialIR: CohortIR;
  catalog: SemanticCatalog;
  dataset: CohortDataset | null;
  cohortId?: string;
  name: string;
  onRename?: (name: string) => void;
  onSave?: (ir: CohortIR, name: string) => Promise<void>;
  onBack?: () => void;
  dirty?: boolean;
};

export function CohortStudio({
  initialIR,
  catalog,
  dataset,
  cohortId,
  name,
  onRename,
  onSave,
  onBack,
  dirty: externalDirty,
}: CohortStudioProps) {
  const history = useHistoryState(initialIR, { coalesceMs: 600 });
  const ir = history.state;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(name);
  const nameRef = useRef<HTMLInputElement>(null);

  const dirty = externalDirty ?? ir !== initialIR;

  const validation = useMemo<ValidationResult>(
    () => validateCohortIR(ir, catalog),
    [ir, catalog],
  );

  const evaluation = useMemo<CohortEvaluation | null>(() => {
    if (!dataset || isEmptyIR(ir)) return null;
    return evaluateCohort(ir, dataset);
  }, [ir, dataset]);

  // Tree actions wired to history
  const treeActions = useMemo<TreeActions>(() => ({
    patchNode: (id, patch) => history.set((prev) => updateNode(prev, id, patch)),
    addNode: (groupId, node, index) => history.set((prev) => addNode(prev, groupId, node, index), { commit: true }),
    removeNode: (id) => history.set((prev) => removeNode(prev, id), { commit: true }),
    duplicateNode: (id) => history.set((prev) => duplicateNode(prev, id), { commit: true }),
    moveNode: (id, targetGroupId, index) => history.set((prev) => moveNode(prev, id, targetGroupId, index), { commit: true }),
    wrapInGroup: (id) => history.set((prev) => wrapInGroup(prev, id), { commit: true }),
  }), [history]);

  const handleUpdateIR = useCallback((next: CohortIR) => {
    history.set(next, { commit: true });
  }, [history]);

  const handleAddNode = useCallback((node: CohortNode) => {
    history.set((prev) => addNode(prev, prev.root.id, node), { commit: true });
  }, [history]);

  const handleSave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(ir, localName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [ir, localName, onSave, saving]);

  const handleRestoreVersion = useCallback((restoredIR: CohortIR) => {
    history.set(restoredIR, { commit: true });
  }, [history]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
      if (meta && e.key === 'z' && e.shiftKey) { e.preventDefault(); history.redo(); }
      if (meta && e.key === 'y') { e.preventDefault(); history.redo(); }
      if (meta && e.key === 's') { e.preventDefault(); void handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [history, handleSave]);

  // Focus name input when editing
  useEffect(() => {
    if (editingName) nameRef.current?.select();
  }, [editingName]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          {editingName ? (
            <input
              ref={nameRef}
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => { setEditingName(false); onRename?.(localName); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setEditingName(false); onRename?.(localName); } }}
              className="rounded border border-slate-300 px-2 py-1 text-lg font-semibold text-slate-900 focus:border-brand-500 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-lg font-semibold text-slate-900 hover:text-brand-600"
            >
              {localName || 'Untitled cohort'}
            </button>
          )}
          {dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={history.undo}
            disabled={!history.canUndo}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={history.redo}
            disabled={!history.canRedo}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-2 h-6 w-px bg-slate-200" />
          {validation.issues.length > 0 && (
            <span className="mr-2 text-xs text-amber-600">
              {validation.issues.length} issue{validation.issues.length !== 1 ? 's' : ''}
            </span>
          )}
          {onSave && (
            <Button
              variant={saved ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleSave}
              disabled={saving || saved}
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-1.5 h-4 w-4" /> : <Save className="mr-1.5 h-4 w-4" />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </Button>
          )}
        </div>
      </header>

      {/* Three-panel body */}
      <div className="flex min-h-0 flex-1">
        {/* Left — Logic Tree */}
        <div className="flex w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            <CohortLogicTree
              ir={ir}
              catalog={catalog}
              validation={validation}
              actions={treeActions}
            />
          </div>
        </div>

        {/* Middle — AI Agent */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
          <CohortAgentPanel
            ir={ir}
            catalog={catalog}
            onUpdateIR={handleUpdateIR}
            onAddNode={handleAddNode}
            className="flex-1"
          />
        </div>

        {/* Right — Preview */}
        <div className="flex w-[340px] shrink-0 flex-col bg-white">
          <CohortPreviewPanel
            ir={ir}
            catalog={catalog}
            dataset={dataset}
            className="flex-1"
          />
        </div>
      </div>

      {/* Bottom — Inspector */}
      {inspectorOpen && (
        <div className="h-[280px] shrink-0 border-t border-slate-200 bg-white">
          <CohortInspector
            ir={ir}
            catalog={catalog}
            evaluation={evaluation}
            dataset={dataset}
            cohortId={cohortId}
            onRestoreVersion={handleRestoreVersion}
            className="h-full"
          />
        </div>
      )}

      {/* Inspector toggle */}
      <button
        onClick={() => setInspectorOpen((v) => !v)}
        className="flex h-7 w-full items-center justify-center border-t border-slate-200 bg-slate-50 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ChevronDown className={cn('mr-1 h-3.5 w-3.5 transition-transform', inspectorOpen && 'rotate-180')} />
        {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
      </button>
    </div>
  );
}
