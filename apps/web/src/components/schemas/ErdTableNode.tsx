import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  Activity,
  Award,
  Ban,
  Bell,
  Database,
  Fingerprint,
  GripVertical,
  Key,
  Link2,
  Send,
  Share2,
  Tag,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { getSchemaIconKey, type ErdFieldPreview } from '@/lib/schema-erd';

export type ErdTableNodeData = {
  label: string;
  table: string;
  slug: string;
  fields: ErdFieldPreview[];
  fieldCount: number;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  compactView?: boolean;
  fkCount?: number;
};

const SCHEMA_ICONS: Record<ReturnType<typeof getSchemaIconKey>, LucideIcon> = {
  customer: Users,
  identity: Fingerprint,
  events: Activity,
  engagement: Activity,
  delivery: Send,
  exclusion: Ban,
  push: Bell,
  triggers: Zap,
  loyalty: Award,
  social: Share2,
  offers: Tag,
  default: Database,
};

function FieldRow({ field }: { field: ErdFieldPreview }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-1 text-[11px] ${field.fk ? 'bg-violet-50/60' : 'hover:bg-slate-50/80'}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-slate-700">
        {field.fk && <Link2 className="h-3 w-3 shrink-0 text-violet-500" />}
        {field.name}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {field.pk && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
            PK
          </span>
        )}
        {field.fk && (
          <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-violet-700">
            FK
          </span>
        )}
        <span className="text-[10px] text-slate-400">{field.type}</span>
      </span>
    </div>
  );
}

function ErdTableNodeComponent({ data }: NodeProps<ErdTableNodeData>) {
  const { label, table, slug, fields, fieldCount, selected, dimmed, highlighted, compactView, fkCount } = data;
  const visibleFields = fields.slice(0, compactView ? 3 : 5);
  const remaining = Math.max(0, fieldCount - visibleFields.length);
  const Icon = SCHEMA_ICONS[getSchemaIconKey(slug)];
  const fkLinks = fkCount ?? fields.filter((f) => f.fk).length;

  return (
    <>
      <Handle type="target" position={Position.Top} id="target-top" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="source" position={Position.Top} id="source-top" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="target" position={Position.Left} id="target-left" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="source" position={Position.Left} id="source-left" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="target" position={Position.Right} id="target-right" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />
      <Handle type="source" position={Position.Right} id="source-right" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500" />

      <div
        className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 ${
          compactView ? 'w-[220px]' : 'w-[260px]'
        } ${
          selected || highlighted
            ? 'border-indigo-400 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200/60'
            : dimmed
              ? 'border-slate-200 opacity-45 grayscale-[0.3]'
              : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'
        }`}
      >
        <div
          className={`erd-node-drag-handle flex cursor-grab items-center gap-2 border-b px-3 py-2.5 active:cursor-grabbing ${
            selected || highlighted
              ? 'border-indigo-100 bg-gradient-to-r from-indigo-500 to-violet-500'
              : 'border-slate-100 bg-gradient-to-r from-slate-50 to-white'
          }`}
        >
          <GripVertical
            className={`h-3.5 w-3.5 shrink-0 ${selected || highlighted ? 'text-indigo-200' : 'text-slate-300'}`}
          />
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              selected || highlighted ? 'bg-white/20' : 'bg-indigo-50'
            }`}
          >
            <Icon className={`h-4 w-4 ${selected || highlighted ? 'text-white' : 'text-indigo-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold ${selected || highlighted ? 'text-white' : 'text-slate-900'}`}>
              {label}
            </p>
            <p className={`truncate font-mono text-[10px] ${selected || highlighted ? 'text-indigo-100' : 'text-slate-400'}`}>
              {table}
            </p>
          </div>
        </div>

        {!compactView && (
          <div className="divide-y divide-slate-50 py-0.5">
            {visibleFields.map((f) => (
              <FieldRow key={f.name} field={f} />
            ))}
          </div>
        )}

        {compactView && fkLinks > 0 && (
          <div className="border-t border-slate-100 bg-violet-50/50 px-3 py-2 text-[10px] text-violet-700">
            <span className="flex items-center gap-1 font-medium">
              <Link2 className="h-3 w-3" />
              {fkLinks} foreign key{fkLinks === 1 ? '' : 's'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <Key className="h-3 w-3" />
            {fieldCount} fields
          </span>
          {!compactView && remaining > 0 && <span>+{remaining} more</span>}
          {(selected || highlighted) && !compactView && (
            <span className="flex items-center gap-0.5 font-medium text-indigo-600">
              <Link2 className="h-3 w-3" />
              Linked
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export const ErdTableNode = memo(ErdTableNodeComponent);

export const erdNodeTypes = { erdTable: ErdTableNode };
