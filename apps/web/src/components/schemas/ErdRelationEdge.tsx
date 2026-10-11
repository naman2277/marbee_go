import { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow';
import {
  ArrowRight,
  Database,
  GitMerge,
  Info,
  KeyRound,
  ListTree,
  Shield,
  X,
} from 'lucide-react';
import type { ErdFieldTechMeta, ErdJoinMeta } from '@/lib/schema-erd';

export type ErdEdgeData = {
  join: ErdJoinMeta;
  active: boolean;
  isPinned?: boolean;
  onTogglePin?: (edgeId: string) => void;
};

function JoinKindBadge({ kind }: { kind: ErdJoinMeta['joinKind'] }) {
  if (kind === 'foreign_key') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
        <Shield className="h-3 w-3" />
        Declared FK
      </span>
    );
  }
  if (kind === 'inferred') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        <GitMerge className="h-3 w-3" />
        Inferred
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
      <Database className="h-3 w-3" />
      Platform
    </span>
  );
}

function FieldFlags({ field }: { field: ErdFieldTechMeta }) {
  return (
    <div className="flex flex-wrap gap-1">
      {field.isPrimaryKey && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">PK</span>
      )}
      {field.isForeignKey && (
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-800">FK</span>
      )}
      {field.isIndexed && (
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800">IDX</span>
      )}
      {field.isRequired && (
        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-800">REQ</span>
      )}
      {field.isPii && (
        <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[9px] font-semibold text-pink-800">PII</span>
      )}
    </div>
  );
}

function TableTechSection({
  title,
  meta,
  highlightColumn,
}: {
  title: string;
  meta: ErdJoinMeta['sourceTableMeta'];
  highlightColumn?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-0.5 font-mono text-xs font-semibold text-slate-800">{meta.table}</p>
      <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
        <p>
          <span className="font-medium text-slate-500">Primary keys:</span>{' '}
          {meta.primaryKeys.length ? (
            <span className="font-mono text-amber-800">{meta.primaryKeys.join(', ')}</span>
          ) : (
            <span className="text-slate-400">id (default)</span>
          )}
        </p>
        <p>
          <span className="font-medium text-slate-500">Indexed columns:</span>{' '}
          {meta.indexedColumns.length ? (
            <span className="font-mono text-sky-800">{meta.indexedColumns.join(', ')}</span>
          ) : (
            <span className="text-slate-400">none declared</span>
          )}
        </p>
        <p>
          <span className="font-medium text-slate-500">Foreign keys:</span>{' '}
          {meta.foreignKeys.length ? (
            <span className="font-mono text-violet-800">{meta.foreignKeys.join(', ')}</span>
          ) : (
            <span className="text-slate-400">none</span>
          )}
        </p>
      </div>
      {highlightColumn && (
        <div className="mt-2 rounded-md border border-indigo-200 bg-white p-2">
          <p className="text-[10px] font-semibold text-indigo-600">Join column</p>
          <p className="mt-0.5 font-mono text-xs text-slate-800">{highlightColumn}</p>
          {meta.fields.find((f) => f.name === highlightColumn) && (
            <div className="mt-1.5">
              <FieldFlags field={meta.fields.find((f) => f.name === highlightColumn)!} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelationDetailsPanel({ join, onClose }: { join: ErdJoinMeta; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50"
        aria-label="Close relationship details"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600">
              <ListTree className="h-3.5 w-3.5" />
              Relationship Details
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {join.sourceLabel} → {join.targetLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <JoinKindBadge kind={join.joinKind} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 text-xs">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 font-mono leading-relaxed text-indigo-950 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-violet-700">{join.sourceTable}.{join.sourceColumn}</span>
              <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />
              <span className="font-bold text-indigo-700">{join.targetTable}.{join.targetColumn}</span>
            </div>
            <p className="mt-2 font-sans text-[11px] font-medium text-indigo-700/80">
              Cardinality: <strong className="font-bold text-indigo-900">{join.cardinality}</strong> · Field Type: <strong className="font-bold text-indigo-900">{join.fieldType}</strong>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TableTechSection title="Source Table (From)" meta={join.sourceTableMeta} highlightColumn={join.sourceColumn} />
            <TableTechSection title="Target Table (To)" meta={join.targetTableMeta} highlightColumn={join.targetColumn} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <p className="mb-2 flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-amber-600" />
              Keys & Index On Join
            </p>
            <dl className="space-y-1.5 text-[11px] text-slate-600">
              <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">Foreign Key Indexed</dt>
                <dd className="font-semibold text-slate-800">{join.sourceField.isIndexed ? 'Yes' : 'Not declared'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">Referenced Primary Key</dt>
                <dd className="font-mono font-bold text-amber-800">{join.targetColumn}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Suggested Index</dt>
                <dd className="font-mono font-bold text-sky-800">{join.suggestedIndex}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">SQL Join</p>
            <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-3 text-[11px] font-mono leading-relaxed text-emerald-300 shadow-inner">
              {join.sqlJoin}
            </pre>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">PostgREST Embed Syntax</p>
            <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] font-mono text-slate-800">
              {join.postgrestHint}
            </pre>
          </div>

          {join.description && (
            <p className="text-[11px] leading-relaxed text-slate-500 border-t border-slate-100 pt-2">
              {join.description}
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 hover:bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ErdRelationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<ErdEdgeData>) {
  const active = data?.active ?? true;
  const join = data?.join;
  const isPinned = data?.isPinned ?? false;
  const onTogglePin = data?.onTogglePin;
  const showPanel = isPinned || selected;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  const highlighted = showPanel;
  const stroke = highlighted ? '#4338ca' : active ? '#4f46e5' : '#cbd5e1';
  const strokeWidth = highlighted ? 3 : active ? 2 : 1.5;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          opacity: active ? 1 : 0.4,
        }}
      />
      {highlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke="#a5b4fc"
          strokeWidth={7}
          className="pointer-events-none opacity-35"
        />
      )}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            title="View join keys, indexes & SQL"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin?.(id);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white shadow-md transition-all hover:scale-105 ${
              isPinned
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-indigo-200'
                : active
                  ? 'border-indigo-300 text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50'
                  : 'border-slate-200 text-slate-400 hover:border-slate-300'
            }`}
          >
            <Info className="h-4 w-4" />
          </button>
          {showPanel && join && (
            <RelationDetailsPanel join={join} onClose={() => onTogglePin?.(id)} />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const ErdRelationEdge = memo(ErdRelationEdgeComponent);

export const erdEdgeTypes = { erdRelation: ErdRelationEdge };
