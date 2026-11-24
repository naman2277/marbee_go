import { useState } from 'react';
import { FunctionSquare, Pencil, X } from 'lucide-react';
import { AdobeExpressionBuilderModal } from '@/components/schemas/AdobeExpressionBuilderModal';
import {
  fieldExpr,
  formatExpr,
  literalExpr,
  type ExprNode,
} from '@/lib/schema-expressions';
import type { FieldType, SchemaFilterField } from '@/lib/schema-filters';

type Props = {
  side: 'left' | 'right';
  expr: ExprNode;
  onChange: (expr: ExprNode) => void;
  fields: SchemaFilterField[];
  valueType?: FieldType;
  defaultField?: string;
  layout?: 'default' | 'sidebar';
};

function unwrapField(expr: ExprNode): string {
  if (expr.kind === 'field') return expr.field;
  if (expr.kind === 'func' && expr.args[0]?.kind === 'field') return expr.args[0].field;
  return '';
}

function unwrapLiteral(expr: ExprNode): string {
  return expr.kind === 'literal' ? expr.value : '';
}

function FieldSelect({
  value,
  fields,
  onChange,
  className,
}: {
  value: string;
  fields: SchemaFilterField[];
  onChange: (key: string) => void;
  className: string;
}) {
  const groups = [...new Set(fields.map((f) => f.group).filter(Boolean))] as string[];
  const hasGroups = groups.length > 0;

  if (!hasGroups) {
    return (
      <select
        value={value || fields[0]?.key}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
    );
  }

  const ungrouped = fields.filter((f) => !f.group);
  return (
    <select
      value={value || fields[0]?.key}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {ungrouped.map((f) => (
        <option key={f.key} value={f.key}>
          {f.label}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {fields
            .filter((f) => f.group === group)
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function FilterSideInput({
  side,
  expr,
  onChange,
  fields,
  valueType = 'string',
  defaultField,
}: Props) {
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  const isExpression = expr.kind === 'func' || (side === 'right' && expr.kind === 'field');
  const baseField = (defaultField ?? unwrapField(expr)) || fields[0]?.key || '';
  const formattedExpr = formatExpr(expr, fields);

  return (
    <div className="relative flex items-center min-w-0 w-full">
      {isExpression ? (
        /* Single-line Expression Pill */
        <div className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-purple-200 bg-purple-50/70 px-2.5 py-1 text-xs transition hover:border-purple-300">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowBuilderModal(true)}
            className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-600 font-mono text-[10px] font-bold text-white shadow-2xs">
              fx
            </span>
            <span className="truncate font-mono font-bold text-purple-900">
              {formattedExpr || 'Expression'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Edit Expression in Builder"
              onClick={() => setShowBuilderModal(true)}
              className="rounded p-1 text-purple-600 hover:bg-purple-200/60 transition"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="Reset to simple field"
              onClick={() => {
                if (side === 'left') onChange(fieldExpr(baseField));
                else onChange(literalExpr(''));
              }}
              className="rounded p-1 text-purple-400 hover:bg-purple-200/60 hover:text-purple-700 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : side === 'left' ? (
        /* Standard Field Selector with Inline Expression Button */
        <div className="relative flex w-full min-w-0 items-center">
          <FieldSelect
            value={unwrapField(expr) || baseField}
            fields={fields}
            onChange={(key) => onChange(fieldExpr(key))}
            className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-800 shadow-2xs transition focus:border-brand-400 focus:outline-hidden focus:ring-1 focus:ring-brand-200"
          />
          <button
            type="button"
            title="Open Expression Builder (fx)"
            onClick={() => setShowBuilderModal(true)}
            className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition"
          >
            <FunctionSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        /* Standard Literal Input with Inline Expression Button */
        <div className="relative flex w-full min-w-0 items-center">
          <input
            type={valueType === 'number' ? 'number' : valueType === 'date' ? 'date' : 'text'}
            value={unwrapLiteral(expr)}
            onChange={(e) => onChange(literalExpr(e.target.value))}
            placeholder={
              valueType === 'date' || valueType === 'timestamp'
                ? 'YYYY-MM-DD'
                : valueType === 'number'
                ? '0'
                : 'Enter value…'
            }
            className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs text-slate-800 placeholder:text-slate-400 shadow-2xs transition focus:border-brand-400 focus:outline-hidden focus:ring-1 focus:ring-brand-200"
          />
          <button
            type="button"
            title="Switch to Expression / Field (fx)"
            onClick={() => setShowBuilderModal(true)}
            className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition"
          >
            <FunctionSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Adobe Campaign Classic Expression Builder Modal */}
      {showBuilderModal && (
        <AdobeExpressionBuilderModal
          open={showBuilderModal}
          initialExpr={expr}
          fields={fields}
          onClose={() => setShowBuilderModal(false)}
          onSave={(newExpr) => onChange(newExpr)}
        />
      )}
    </div>
  );
}
