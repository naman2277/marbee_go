/**
 * The visual rule tree.
 *
 * Renders the IR as nested AND/OR groups with unlimited depth, drag-to-reorder,
 * collapse, duplicate and NOT. Every edit goes through a pure IR operation, so
 * the tree, the AI agent and undo/redo all mutate the same structure.
 */
import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  GripVertical,
  Info,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  CONDITION_KIND_META,
  createConditionOfKind,
  createGroup,
  isGroup,
  type CohortCondition,
  type CohortGroup,
  type CohortIR,
  type CohortNode,
  type ConditionKind,
  type GroupOperator,
} from '@/lib/cohorts/ir';
import type { SemanticCatalog } from '@/lib/cohorts/catalog';
import type { ValidationIssue, ValidationResult } from '@/lib/cohorts/validate';
import { issuesForNode } from '@/lib/cohorts/validate';
import { CohortConditionEditor, conditionHeadline } from './CohortConditionEditor';
import { SuggestionChips } from './CohortPickers';

export type TreeActions = {
  patchNode: (id: string, patch: Record<string, unknown>) => void;
  addNode: (groupId: string, node: CohortNode, index?: number) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  moveNode: (id: string, targetGroupId: string, index: number) => void;
  wrapInGroup: (id: string) => void;
};

type DropTarget = { groupId: string; index: number } | null;

/* ------------------------------------------------------------------ *
 * Add menu
 * ------------------------------------------------------------------ */

const BASIC_KINDS: ConditionKind[] = ['property', 'event', 'metric', 'cohort'];
const ADVANCED_KINDS: ConditionKind[] = ['sequence', 'retention', 'relative_event', 'account_rollup'];

function AddConditionMenu({
  onAdd,
  onAddGroup,
  compact,
}: {
  onAdd: (kind: ConditionKind) => void;
  onAddGroup: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 ${
            compact ? 'h-7 text-[12px]' : 'h-8 text-[13px]'
          }`}
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
        <button
          type="button"
          onClick={onAddGroup}
          title="Add a nested AND/OR group"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 ${
            compact ? 'h-7 text-[12px]' : 'h-8 text-[13px]'
          }`}
        >
          <FolderPlus className="h-3.5 w-3.5" /> Add group
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Common
            </div>
            {BASIC_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onAdd(kind);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <div className="text-[13px] font-medium text-slate-800">
                  {CONDITION_KIND_META[kind].label}
                </div>
                <div className="text-[11px] text-slate-500">{CONDITION_KIND_META[kind].description}</div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex w-full items-center gap-1 bg-slate-50/80 px-3 py-1 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-600"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>
            {showAdvanced &&
              ADVANCED_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    onAdd(kind);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <div className="text-[13px] font-medium text-slate-800">
                    {CONDITION_KIND_META[kind].label}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {CONDITION_KIND_META[kind].description}
                  </div>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Issue badges
 * ------------------------------------------------------------------ */

function IssueList({
  issues,
  onApplySuggestion,
}: {
  issues: ValidationIssue[];
  onApplySuggestion?: (issue: ValidationIssue, value: string) => void;
}) {
  const shown = issues.filter((i) => i.severity !== 'info');
  if (!shown.length) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {shown.map((issue, i) => (
        <div
          key={`${issue.code}-${i}`}
          className={`flex flex-wrap items-start gap-1.5 rounded-lg px-2 py-1 text-[12px] ${
            issue.severity === 'error'
              ? 'bg-rose-50 text-rose-700'
              : 'bg-amber-50 text-amber-800'
          }`}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{issue.message}</span>
          {issue.suggestions?.length && onApplySuggestion ? (
            <SuggestionChips
              suggestions={issue.suggestions}
              onPick={(v) => onApplySuggestion(issue, v)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Condition row
 * ------------------------------------------------------------------ */

function ConditionRow({
  condition,
  catalog,
  actions,
  validation,
  depth,
  onDragStart,
  impact,
}: {
  condition: CohortCondition;
  catalog: SemanticCatalog;
  actions: TreeActions;
  validation: ValidationResult;
  depth: number;
  onDragStart: (id: string) => void;
  impact?: number;
}) {
  const issues = issuesForNode(validation, condition.id);
  const hasError = issues.some((i) => i.severity === 'error');
  const collapsed = condition.collapsed;

  const applySuggestion = (issue: ValidationIssue, value: string) => {
    if (issue.code === 'unknown_event') actions.patchNode(condition.id, { event: value });
    else if (issue.code === 'unknown_property') actions.patchNode(condition.id, { property: value });
    else if (issue.code === 'unknown_metric') actions.patchNode(condition.id, { metric: value });
    else if (issue.code === 'unknown_cohort') actions.patchNode(condition.id, { cohortSlug: value });
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(condition.id);
      }}
      className={`group/row relative rounded-xl border bg-white px-2.5 py-2 transition ${
        hasError ? 'border-rose-200 shadow-[0_0_0_3px_rgba(244,63,94,0.06)]' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-1 cursor-grab text-slate-300 opacity-0 transition group-hover/row:opacity-100 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => actions.patchNode(condition.id, { collapsed: !collapsed })}
          className="mt-1 text-slate-400 transition hover:text-slate-700"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          {collapsed ? (
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[13px] font-medium text-slate-800">
                {conditionHeadline(condition, catalog)}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {CONDITION_KIND_META[condition.kind].label}
              </span>
            </div>
          ) : (
            <CohortConditionEditor
              condition={condition}
              catalog={catalog}
              patch={(patch) => actions.patchNode(condition.id, patch)}
            />
          )}

          <IssueList issues={issues} onApplySuggestion={applySuggestion} />

          {condition.kind === 'account_rollup' && !collapsed && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
              <TreeNode
                node={condition.inner}
                catalog={catalog}
                actions={actions}
                validation={validation}
                depth={depth + 1}
                isRoot={false}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/row:opacity-100">
          {impact !== undefined && (
            <span
              className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500"
              title="Share of people matching this rule on its own"
            >
              {impact.toFixed(0)}%
            </span>
          )}
          <button
            type="button"
            onClick={() => actions.wrapInGroup(condition.id)}
            title="Wrap in a group"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => actions.duplicateNode(condition.id)}
            title="Duplicate"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => actions.removeNode(condition.id)}
            title="Remove"
            className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Group
 * ------------------------------------------------------------------ */

function OperatorToggle({
  value,
  onChange,
}: {
  value: GroupOperator;
  onChange: (op: GroupOperator) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      {(['and', 'or'] as GroupOperator[]).map((op) => (
        <button
          key={op}
          type="button"
          onClick={() => onChange(op)}
          className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition ${
            value === op ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          {op}
        </button>
      ))}
    </div>
  );
}

function DropLine({ active }: { active: boolean }) {
  return (
    <div
      className={`h-0.5 rounded-full transition-all ${
        active ? 'my-1 bg-indigo-500 opacity-100' : 'my-0 bg-transparent opacity-0'
      }`}
    />
  );
}

let dragId: string | null = null;

function GroupNode({
  group,
  catalog,
  actions,
  validation,
  depth,
  isRoot,
  impacts,
}: {
  group: CohortGroup;
  catalog: SemanticCatalog;
  actions: TreeActions;
  validation: ValidationResult;
  depth: number;
  isRoot: boolean;
  impacts?: Map<string, number>;
}) {
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const issues = issuesForNode(validation, group.id);

  const handleDrop = (index: number) => {
    if (dragId) actions.moveNode(dragId, group.id, index);
    dragId = null;
    setDropTarget(null);
  };

  const tint = group.negate
    ? 'border-rose-200 bg-rose-50/30'
    : group.operator === 'or'
      ? 'border-amber-200 bg-amber-50/25'
      : 'border-slate-200 bg-slate-50/40';

  const body = (
    <>
      {group.children.map((child, i) => (
        <div
          key={child.id}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2;
            setDropTarget({ groupId: group.id, index: before ? i : i + 1 });
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDrop(dropTarget?.index ?? i);
          }}
        >
          <DropLine active={dropTarget?.groupId === group.id && dropTarget.index === i} />

          {i > 0 && (
            <div className="flex items-center gap-2 py-0.5 pl-1">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  group.operator === 'or' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {group.operator}
              </span>
              <div className="h-px flex-1 bg-slate-200/70" />
            </div>
          )}

          <TreeNode
            node={child}
            catalog={catalog}
            actions={actions}
            validation={validation}
            depth={depth + 1}
            isRoot={false}
            impacts={impacts}
          />
        </div>
      ))}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget({ groupId: group.id, index: group.children.length });
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(group.children.length);
        }}
      >
        <DropLine
          active={dropTarget?.groupId === group.id && dropTarget.index === group.children.length}
        />
      </div>

      <div className="pt-1.5">
        <AddConditionMenu
          compact={!isRoot}
          onAdd={(kind) => actions.addNode(group.id, createConditionOfKind(kind))}
          onAddGroup={() => actions.addNode(group.id, createGroup(group.operator === 'and' ? 'or' : 'and'))}
        />
      </div>
    </>
  );

  if (isRoot) {
    return (
      <div className="space-y-1" onDragEnd={() => setDropTarget(null)}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Match
          </span>
          <OperatorToggle
            value={group.operator}
            onChange={(op) => actions.patchNode(group.id, { operator: op })}
          />
          <span className="text-[12px] text-slate-500">
            of the following {group.children.length} condition{group.children.length === 1 ? '' : 's'}
          </span>
        </div>
        <IssueList issues={issues} />
        {body}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 p-2.5 ${tint}`} onDragEnd={() => setDropTarget(null)}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => actions.patchNode(group.id, { collapsed: !group.collapsed })}
          className="text-slate-400 transition hover:text-slate-700"
        >
          {group.collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => actions.patchNode(group.id, { negate: !group.negate })}
          title="Negate this group"
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${
            group.negate
              ? 'bg-rose-600 text-white'
              : 'bg-white text-slate-400 ring-1 ring-slate-200 hover:text-slate-700'
          }`}
        >
          not
        </button>

        <OperatorToggle
          value={group.operator}
          onChange={(op) => actions.patchNode(group.id, { operator: op })}
        />

        <span className="text-[11px] text-slate-500">
          {group.children.length} condition{group.children.length === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => actions.duplicateNode(group.id)}
            title="Duplicate group"
            className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => actions.removeNode(group.id)}
            title="Remove group"
            className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <IssueList issues={issues} />
      {!group.collapsed && body}
    </div>
  );
}

function TreeNode({
  node,
  catalog,
  actions,
  validation,
  depth,
  isRoot,
  impacts,
}: {
  node: CohortNode;
  catalog: SemanticCatalog;
  actions: TreeActions;
  validation: ValidationResult;
  depth: number;
  isRoot: boolean;
  impacts?: Map<string, number>;
}) {
  if (isGroup(node)) {
    return (
      <GroupNode
        group={node}
        catalog={catalog}
        actions={actions}
        validation={validation}
        depth={depth}
        isRoot={isRoot}
        impacts={impacts}
      />
    );
  }
  return (
    <ConditionRow
      condition={node}
      catalog={catalog}
      actions={actions}
      validation={validation}
      depth={depth}
      impact={impacts?.get(node.id)}
      onDragStart={(id) => {
        dragId = id;
      }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

export function CohortLogicTree({
  ir,
  catalog,
  actions,
  validation,
  impacts,
}: {
  ir: CohortIR;
  catalog: SemanticCatalog;
  actions: TreeActions;
  validation: ValidationResult;
  impacts?: Map<string, number>;
}) {
  const empty = !ir.root.children.length;

  return (
    <div className="space-y-2">
      {empty && (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-[12px] text-slate-500">
          <Info className="mt-px h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="font-medium text-slate-700">No conditions yet — this matches everyone.</p>
            <p>
              Add a rule below, or describe the cohort in the agent panel and it will build the logic
              here for you to edit.
            </p>
          </div>
        </div>
      )}

      <TreeNode
        node={ir.root}
        catalog={catalog}
        actions={actions}
        validation={validation}
        depth={0}
        isRoot
        impacts={impacts}
      />
    </div>
  );
}
