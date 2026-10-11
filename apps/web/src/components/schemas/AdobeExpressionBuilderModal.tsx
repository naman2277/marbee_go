import { useState, useRef, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  CornerDownLeft,
  Database,
  Eraser,
  FileCode,
  FunctionSquare,
  HelpCircle,
  Layers,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Sparkles,
  Tag,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  FUNCTION_CATALOG,
  FUNCTION_MAP,
  fieldExpr,
  formatExpr,
  funcExpr,
  literalExpr,
  parseExpression,
  evaluateExpr,
  type ExprNode,
  type FunctionCategory,
  type FunctionDef,
} from '@/lib/schema-expressions';
import type { SchemaFilterField } from '@/lib/schema-filters';

type Props = {
  open: boolean;
  initialExpr: ExprNode;
  fields: SchemaFilterField[];
  sampleRow?: Record<string, unknown>;
  onClose: () => void;
  onSave: (expr: ExprNode) => void;
};

const CATEGORIES: { id: FunctionCategory | 'geomarketing' | 'aggregates' | 'custom'; label: string }[] = [
  { id: 'string', label: 'fx String' },
  { id: 'date', label: 'fx Date' },
  { id: 'number', label: 'fx Numerical' },
  { id: 'geomarketing', label: 'fx Geomarketing' },
  { id: 'other', label: 'fx Others & Logic' },
  { id: 'aggregates', label: 'fx Aggregates' },
  { id: 'custom', label: 'fx Custom Functions' },
];

export function AdobeExpressionBuilderModal({
  open,
  initialExpr,
  fields,
  sampleRow = {},
  onClose,
  onSave,
}: Props) {
  const [exprText, setExprText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('string');
  const [selectedFn, setSelectedFn] = useState<FunctionDef | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    string: true,
    date: true,
    number: true,
    other: true,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const initialFormatted = formatExpr(initialExpr, fields);
      const textVal =
        initialExpr.kind === 'field'
          ? `@${initialExpr.field}`
          : initialFormatted;
      setExprText(textVal);
      setHistory([textVal]);
      setHistoryIndex(0);
    }
  }, [open, initialExpr, fields]);

  if (!open) return null;

  const pushHistory = (newText: string) => {
    const updated = [...history.slice(0, historyIndex + 1), newText];
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
    setExprText(newText);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setExprText(history[nextIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setExprText(history[nextIdx]);
    }
  };

  const handleInsertText = (textToInsert: string, cursorOffset?: number) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      pushHistory(exprText + textToInsert);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = exprText.substring(0, start);
    const after = exprText.substring(end);
    const newText = before + textToInsert + after;
    pushHistory(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = cursorOffset != null ? start + cursorOffset : start + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  const handleFieldClick = (fieldKey: string) => {
    handleInsertText(`@${fieldKey}`);
  };

  const handleFunctionClick = (fn: FunctionDef) => {
    setSelectedFn(fn);
    if (fn.argCount === 0) {
      handleInsertText(`${fn.name}()`);
    } else {
      handleInsertText(`${fn.name}()`, fn.name.length + 1);
    }
  };

  // Live evaluation test
  const cleanExprText = exprText.replace(/@([a-zA-Z0-9_]+)/g, '$1').trim();
  const parsedNode = parseExpression(cleanExprText, fields) ||
    (cleanExprText.startsWith('@')
      ? fieldExpr(cleanExprText.slice(1))
      : fields.some((f) => f.key === cleanExprText)
      ? fieldExpr(cleanExprText)
      : literalExpr(exprText));

  let evaluatedResult: unknown = null;
  let evalError = '';
  try {
    evaluatedResult = evaluateExpr(parsedNode, sampleRow, fields);
  } catch (err: any) {
    evalError = err?.message || 'Error evaluating expression';
  }

  const handleSave = () => {
    onSave(parsedNode);
    onClose();
  };

  // Grouped Fields
  const filteredFields = fields.filter((f) => {
    if (!fieldSearch.trim()) return true;
    const q = fieldSearch.toLowerCase();
    return f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q);
  });

  const fieldGroups = [...new Set(filteredFields.map((f) => f.group || 'Fields'))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f8fafc] shadow-2xl animate-in zoom-in-95">
        {/* Title Bar - Adobe Campaign Classic Theme */}
        <div className="flex items-center justify-between border-b border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <FunctionSquare className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-bold tracking-wide">Edit the expression</span>
            <span className="text-[11px] text-slate-400">· Enter the expression in this edit zone</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar - Actions Ribbon */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-700 select-none">
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Undo"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
              className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Redo"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
              className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 transition"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-300 mx-1" />
            <button
              type="button"
              title="Clear all"
              onClick={() => pushHistory('')}
              className="rounded p-1.5 hover:bg-slate-200 text-slate-600 transition flex items-center gap-1 text-[11px]"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              type="button"
              title="Insert Parentheses"
              onClick={() => handleInsertText('()', 1)}
              className="rounded px-2 py-1 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs"
            >
              ( )
            </button>
            <button
              type="button"
              title="Insert Comma"
              onClick={() => handleInsertText(', ')}
              className="rounded px-2 py-1 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs"
            >
              ,
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500">Syntax: Lower(@email)</span>
          </div>
        </div>

        {/* Top Edit Zone */}
        <div className="border-b border-slate-300 bg-white p-3">
          <textarea
            ref={textareaRef}
            value={exprText}
            onChange={(e) => pushHistory(e.target.value)}
            placeholder="Type your expression, or double-click fields and functions below… (e.g. Lower(@email) or Year(@created_at))"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 shadow-inner focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
          />

          {/* Live Result / Error Bar */}
          <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-slate-500 text-[10px] uppercase">Preview:</span>
              <span className="font-mono text-brand-700 font-bold truncate">
                {evalError ? (
                  <span className="text-rose-600 font-normal">{evalError}</span>
                ) : (
                  String(evaluatedResult ?? '(null / empty)')
                )}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Return Type: {selectedFn?.returnType || 'inferred'}
            </span>
          </div>
        </div>

        {/* Bottom Split Pane: Available Fields (Left) vs List of Functions (Right) */}
        <div className="flex min-h-0 flex-1 divide-x divide-slate-300 bg-white">
          {/* Left Column: Available Fields */}
          <div className="flex w-1/2 flex-col min-h-0 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-slate-500" />
                  Available fields:
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {filteredFields.length} fields
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find field…"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white py-1 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 text-xs font-mono select-none">
              {fieldGroups.map((group) => {
                const groupItems = filteredFields.filter((f) => (f.group || 'Fields') === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="mb-2">
                    <div className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100/70 rounded">
                      <FolderIcon />
                      <span>{group}</span>
                    </div>
                    <div className="mt-1 pl-3 space-y-0.5">
                      {groupItems.map((f) => (
                        <div
                          key={f.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleFieldClick(f.key)}
                          onDoubleClick={() => handleFieldClick(f.key)}
                          className="flex items-center justify-between rounded px-2 py-1 hover:bg-brand-50 hover:text-brand-700 cursor-pointer transition text-slate-700"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ColumnIcon type={f.type} />
                            <span className="truncate font-semibold">@{f.key}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-sans">{f.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: List of Functions */}
          <div className="flex w-1/2 flex-col min-h-0 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FunctionSquare className="h-3.5 w-3.5 text-brand-600" />
                List of functions:
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-2">
              {CATEGORIES.map((cat) => {
                const isExpanded = expandedCategories[cat.id] ?? true;
                const fns = FUNCTION_CATALOG.filter((f) => f.category === cat.id);

                return (
                  <div key={cat.id} className="rounded border border-slate-200/80 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCategories((prev) => ({ ...prev, [cat.id]: !isExpanded }))
                      }
                      className="flex w-full items-center justify-between bg-slate-100/80 px-2.5 py-1.5 text-left font-bold text-slate-700 hover:bg-slate-200 transition text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span>{cat.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {fns.length} functions
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="p-1 space-y-0.5 bg-white">
                        {fns.map((fn) => (
                          <div
                            key={fn.name}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedFn(fn)}
                            onDoubleClick={() => handleFunctionClick(fn)}
                            className={`flex items-center justify-between rounded px-2 py-1 font-mono text-xs cursor-pointer transition ${
                              selectedFn?.name === fn.name
                                ? 'bg-brand-100 text-brand-800 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-brand-600 font-bold">fx</span>
                              <span className="truncate">{fn.name}()</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-sans truncate max-w-[150px]">
                              {fn.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Function Documentation Footer */}
            {selectedFn && (
              <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold font-mono text-brand-700">{selectedFn.name}()</span>
                  <button
                    type="button"
                    onClick={() => handleFunctionClick(selectedFn)}
                    className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-brand-700 transition"
                  >
                    + Insert Function
                  </button>
                </div>
                <p className="text-slate-600 text-[11px]">{selectedFn.description}</p>
                {selectedFn.argLabels && (
                  <p className="text-[10px] font-mono text-slate-400">
                    Arguments: ({selectedFn.argLabels.join(', ')}) → {selectedFn.returnType}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-300 bg-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <HelpCircle className="h-4 w-4 text-slate-400" />
            <span>Click any field or function to insert into your expression</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="text-xs font-bold">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Apply Expression
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderIcon() {
  return <div className="h-2 w-2 rounded-full bg-slate-400" />;
}

function ColumnIcon({ type }: { type?: string }) {
  return (
    <span
      className={`rounded px-1 text-[9px] font-bold font-mono ${
        type === 'timestamp' || type === 'date'
          ? 'bg-amber-100 text-amber-800'
          : type === 'number'
          ? 'bg-emerald-100 text-emerald-800'
          : type === 'boolean'
          ? 'bg-purple-100 text-purple-800'
          : 'bg-blue-100 text-blue-800'
      }`}
    >
      {type === 'timestamp' ? 'ts' : type === 'number' ? 'num' : type === 'boolean' ? 'bool' : 'abc'}
    </span>
  );
}
