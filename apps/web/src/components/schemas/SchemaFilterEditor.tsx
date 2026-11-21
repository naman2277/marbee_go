import { useState, type ReactNode } from 'react';
import { Layers, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { FilterSideInput } from '@/components/schemas/FilterSideInput';
import { fieldKeyFromExpr } from '@/lib/schema-expressions';
import {
  operatorsForType,
  operatorLabel,
  formatFilterRoot,
  createFilterCondition,
  createFilterGroup,
  createFilterRoot,
  updateFilterNode,
  removeFilterNode,
  addChildToGroup,
  countActiveFilterRules,
  type FilterRoot,
  type FilterGroup,
  type FilterNode,
  type FilterCondition,
  type SchemaFilterField,
  type FilterLogic,
} from '@/lib/schema-filters';
import { inferExprType } from '@/lib/schema-expressions';

type Props = {
  fields: SchemaFilterField[];
  root: FilterRoot;
  onChange: (root: FilterRoot) => void;
  quickSearch: string;
  onQuickSearchChange: (value: string) => void;
  compact?: boolean;
  layout?: 'default' | 'sidebar';
  sampleRow?: Record<string, unknown>;
  /** Extra icon buttons shown in the toolbar (e.g. columns picker) */
  toolbarEnd?: ReactNode;
};

export function SchemaFilterEditor({
  fields,
  root,
  onChange,
  quickSearch,
  onQuickSearchChange,
  compact = false,
  layout = 'default',
  sampleRow,
  toolbarEnd,
}: Props) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const sidebar = layout === 'sidebar';
  const activeRuleCount = countActiveFilterRules(root);
  const hasFilters = activeRuleCount > 0 || quickSearch.trim().length > 0;
  const queryPreview = formatFilterRoot(root, fields);
  const showAdvanced = sidebar || !compact || filtersExpanded;

  const clearAll = () => {
    onChange(createFilterRoot());
    onQuickSearchChange('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={quickSearch}
            onChange={(e) => onQuickSearchChange(e.target.value)}
            placeholder="Search records…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {quickSearch && (
            <button
              type="button"
              onClick={() => onQuickSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {compact && !sidebar && (
          <button
            type="button"
            onClick={() => setFiltersExpanded((open) => !open)}
            title="Filter rules"
            className={`relative shrink-0 rounded-md border p-1.5 transition-colors ${
              filtersExpanded || activeRuleCount > 0
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeRuleCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[9px] font-bold text-white">
                {activeRuleCount}
              </span>
            )}
          </button>
        )}

        {toolbarEnd}

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Match</span>
              <LogicToggle value={root.logic} onChange={(logic) => onChange({ ...root, logic })} />
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange(addChildToGroup(root, root.id, createFilterCondition(fields)))}
                disabled={!fields.length}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Rule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange(
                    addChildToGroup(root, root.id, {
                      ...createFilterGroup('and'),
                      children: [createFilterCondition(fields)],
                    }),
                  )
                }
                disabled={!fields.length}
              >
                <Layers className="mr-1 h-3.5 w-3.5" />
                Group
              </Button>
            </div>
          </div>

          <div className="p-3">
            {root.children.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No rules yet. Add a rule to filter by field or transformed column.
              </p>
            ) : (
              <NodeList
                nodes={root.children}
                fields={fields}
                depth={0}
                layout={layout}
                sampleRow={sampleRow}
                onUpdate={(nodeId, updater) => onChange(updateFilterNode(root, nodeId, updater))}
                onRemove={(nodeId) => onChange(removeFilterNode(root, nodeId))}
                onAddRule={(groupId) => onChange(addChildToGroup(root, groupId, createFilterCondition(fields)))}
                onAddGroup={(groupId) =>
                  onChange(
                    addChildToGroup(root, groupId, {
                      ...createFilterGroup('and'),
                      children: [createFilterCondition(fields)],
                    }),
                  )
                }
                onJoinChange={(nodeId, join) =>
                  onChange(updateFilterNode(root, nodeId, (n) => ({ ...n, join })))
                }
              />
            )}
          </div>

          {queryPreview && sidebar && (
            <p className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-400">Preview · </span>
              <span className="font-mono">{queryPreview}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NodeList({
  nodes,
  fields,
  depth,
  layout = 'default',
  sampleRow,
  onUpdate,
  onRemove,
  onAddRule,
  onAddGroup,
  onJoinChange,
}: {
  nodes: FilterNode[];
  fields: SchemaFilterField[];
  depth: number;
  layout?: 'default' | 'sidebar';
  sampleRow?: Record<string, unknown>;
  onUpdate: (id: string, updater: (n: FilterNode) => FilterNode) => void;
  onRemove: (id: string) => void;
  onAddRule: (groupId: string) => void;
  onAddGroup: (groupId: string) => void;
  onJoinChange: (id: string, join: FilterLogic) => void;
}) {
  return (
    <div className="space-y-1.5">
      {nodes.map((node, index) => (
        <div key={node.id}>
          {index > 0 && (
            <JoinToggle value={node.join ?? 'and'} onChange={(join) => onJoinChange(node.id, join)} layout={layout} />
          )}

          {node.type === 'condition' ? (
            <FilterRow
              condition={node}
              fields={fields}
              sampleRow={sampleRow}
              layout={layout}
              onChange={(next) => onUpdate(node.id, () => next)}
              onRemove={() => onRemove(node.id)}
            />
          ) : (
            <GroupBox
              group={node}
              fields={fields}
              depth={depth}
              layout={layout}
              sampleRow={sampleRow}
              onUpdate={onUpdate}
              onRemove={() => onRemove(node.id)}
              onRemoveNode={onRemove}
              onAddRule={onAddRule}
              onAddGroup={onAddGroup}
              onJoinChange={onJoinChange}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function GroupBox({
  group,
  fields,
  depth,
  layout = 'default',
  sampleRow,
  onUpdate,
  onRemove,
  onRemoveNode,
  onAddRule,
  onAddGroup,
  onJoinChange,
}: {
  group: FilterGroup;
  fields: SchemaFilterField[];
  depth: number;
  layout?: 'default' | 'sidebar';
  sampleRow?: Record<string, unknown>;
  onUpdate: (id: string, updater: (n: FilterNode) => FilterNode) => void;
  onRemove: () => void;
  onRemoveNode: (id: string) => void;
  onAddRule: (groupId: string) => void;
  onAddGroup: (groupId: string) => void;
  onJoinChange: (id: string, join: FilterLogic) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 border-l-4 border-l-brand-500 bg-slate-50/40 p-3.5 shadow-2xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-bold text-slate-700">Group Logic:</span>
          <LogicToggle
            value={group.logic}
            onChange={(logic) =>
              onUpdate(group.id, (n) => (n.type === 'group' ? { ...n, logic } : n))
            }
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAddRule(group.id)}
            className="h-7 text-xs font-bold px-2.5"
          >
            + Rule
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAddGroup(group.id)}
            className="h-7 text-xs font-bold px-2.5"
          >
            + Sub-Group
          </Button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {group.children.length === 0 ? (
        <p className="py-2 text-center text-xs text-slate-400 font-medium">Empty group — add a rule or sub-group</p>
      ) : (
        <NodeList
          nodes={group.children}
          fields={fields}
          depth={depth + 1}
          layout={layout}
          sampleRow={sampleRow}
          onUpdate={onUpdate}
          onRemove={onRemoveNode}
          onAddRule={onAddRule}
          onAddGroup={onAddGroup}
          onJoinChange={onJoinChange}
        />
      )}
    </div>
  );
}

function LogicToggle({ value, onChange }: { value: FilterLogic; onChange: (v: FilterLogic) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
      {([
        { id: 'and', label: 'AND' },
        { id: 'or', label: 'OR' },
        { id: 'except', label: 'EXCEPT (NOT)' },
      ] as const).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider transition ${
            value === item.id || (item.id === 'except' && value === 'not')
              ? item.id === 'except'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-brand-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function JoinToggle({
  value,
  onChange,
}: {
  value: FilterLogic;
  onChange: (v: FilterLogic) => void;
  layout?: 'default' | 'sidebar';
}) {
  return (
    <div className="relative my-2 flex items-center justify-center">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex rounded-full border border-slate-200 bg-white p-0.5 shadow-2xs">
        {([
          { id: 'and', label: 'AND' },
          { id: 'or', label: 'OR' },
          { id: 'except', label: 'EXCEPT' },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase transition ${
              value === item.id || (item.id === 'except' && value === 'not')
                ? item.id === 'except'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterRow({
  condition,
  fields,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  fields: SchemaFilterField[];
  sampleRow?: Record<string, unknown>;
  layout?: 'default' | 'sidebar';
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const leftType = inferExprType(condition.left, fields);
  const ops = operatorsForType(leftType);
  const needsValue = !['is_empty', 'is_not_empty'].includes(condition.operator);
  const leftFieldKey = fieldKeyFromExpr(condition.left) || fields[0]?.key || '';

  const operatorSelect = (
    <select
      value={condition.operator}
      onChange={(e) =>
        onChange({ ...condition, operator: e.target.value as FilterCondition['operator'] })
      }
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-2xs transition focus:border-brand-400 focus:outline-hidden focus:ring-1 focus:ring-brand-200"
    >
      {ops.map((op) => (
        <option key={op} value={op}>
          {operatorLabel(op, leftType)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xs transition hover:border-slate-300">
      {/* Left (Field or Expression) */}
      <div className="min-w-0 flex-1">
        <FilterSideInput
          side="left"
          expr={condition.left}
          onChange={(left) => {
            const nextType = inferExprType(left, fields);
            const nextOps = operatorsForType(nextType);
            onChange({
              ...condition,
              left,
              operator: nextOps.includes(condition.operator) ? condition.operator : nextOps[0],
            });
          }}
          fields={fields}
          defaultField={leftFieldKey}
        />
      </div>

      {/* Operator Select */}
      <div className="w-36 shrink-0">{operatorSelect}</div>

      {/* Right (Value or Target Expression) */}
      {needsValue ? (
        <div className="min-w-0 flex-1">
          <FilterSideInput
            side="right"
            expr={condition.right}
            onChange={(right) => onChange({ ...condition, right })}
            fields={fields}
            valueType={leftType}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1 px-3 text-xs italic text-slate-400">
          (No value required)
        </div>
      )}

      {/* Delete Action */}
      <button
        type="button"
        title="Remove rule"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function applyQuickSearch(
  rows: Record<string, unknown>[],
  query: string,
  fields: SchemaFilterField[],
): Record<string, unknown>[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((row) => {
    const text = fields
      .map((f) => {
        const v = f.getValue(row);
        return v == null ? '' : String(v);
      })
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });
}

export { createFilterRoot };
