import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Bold, Braces, ChevronDown, Code, Eye, FileCode, Globe, Heading, Image, Italic, Link2, List, Mail, Maximize2, MessageSquare,
  Mic, Minimize2, Monitor, Phone, Plus, Smartphone, Sparkles, Table, Trash2, Type, User, X,
} from 'lucide-react';
import {
  CHANNEL_REGISTRY,
  renderPreview, sampleFromSchema,
  type Channel, type ChannelDef, type MissingVarPolicy, type RtmTemplate, type SchemaField,
} from '@/lib/rtm';

type Props = {
  channel: Channel;
  template: RtmTemplate;
  schema: SchemaField[];
  onChange: (t: RtmTemplate) => void;
};

const POLICIES: { value: MissingVarPolicy; label: string; hint: string }[] = [
  { value: 'fallback', label: 'Use fallback', hint: 'Substitute the {{x | "default"}} value, then send' },
  { value: 'skip', label: 'Skip send', hint: 'Do not send; log the reason' },
  { value: 'fail', label: 'Fail to review', hint: 'Send to the dead-letter queue for a human' },
];

const CHANNEL_ICONS: Partial<Record<Channel, React.ReactNode>> = {
  email: <Mail className="h-4 w-4" />,
  sms: <Phone className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
  rcs: <MessageSquare className="h-4 w-4" />,
  web_push: <Globe className="h-4 w-4" />,
  mobile_push: <Smartphone className="h-4 w-4" />,
  in_app: <Monitor className="h-4 w-4" />,
  in_browser: <Monitor className="h-4 w-4" />,
  voice: <Mic className="h-4 w-4" />,
};

// ─── Personalization Popover ────────────────────────────────────────────────

function PersonalizationPopover({ schema, onInsert, open, onClose }: {
  schema: SchemaField[]; onInsert: (token: string) => void; open: boolean; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  const payloadVars = schema.map((f) => ({
    token: `data.${f.key}`,
    label: f.key,
    type: f.type,
    example: f.example || '',
    pii: f.pii,
  }));

  const customerVars = [
    { token: 'customer.first_name', label: 'First Name', type: 'string', example: 'Sam', pii: false },
    { token: 'customer.last_name', label: 'Last Name', type: 'string', example: 'Rivera', pii: false },
    { token: 'customer.full_name', label: 'Full Name', type: 'string', example: 'Sam Rivera', pii: false },
    { token: 'customer.email', label: 'Email', type: 'email', example: 'sam@example.com', pii: true },
    { token: 'customer.mobile', label: 'Mobile', type: 'string', example: '+919876543210', pii: true },
  ];

  const helperFns = [
    { token: 'date data.eta "ddd D MMM"', label: 'Format date', desc: 'Format a date field' },
    { token: 'currency data.amount "INR"', label: 'Format currency', desc: 'Format as currency' },
    { token: 'uppercase data.status', label: 'UPPERCASE', desc: 'Convert to uppercase' },
    { token: 'default data.name "Customer"', label: 'Default value', desc: 'Fallback if empty' },
  ];

  if (!open) return null;

  return (
    <div ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-in fade-in slide-in-from-top-2 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50"
      style={{ maxHeight: 420, overflowY: 'auto' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
            <Sparkles className="h-3 w-3" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">Insert Personalization</p>
            <p className="text-[9px] text-slate-400">{payloadVars.length + customerVars.length} fields · Click to insert</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Payload fields */}
        {payloadVars.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <Braces className="h-2.5 w-2.5" /> Payload Fields
            </p>
            <div className="space-y-0.5">
              {payloadVars.map((v) => (
                <button key={v.token} type="button"
                  onClick={() => { onInsert(`{{${v.token}}}`); }}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-violet-50">
                  <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-violet-100 text-[8px] font-bold text-violet-600 uppercase">
                    {v.type.charAt(0)}
                  </span>
                  <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 group-hover:text-violet-700">{`{{${v.token}}}`}</p>
                  {v.pii && <span className="rounded bg-amber-100 px-1 py-0.5 text-[7px] font-bold text-amber-600">PII</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Customer fields */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <User className="h-2.5 w-2.5" /> Customer Profile
          </p>
          <div className="space-y-0.5">
            {customerVars.map((v) => (
              <button key={v.token} type="button"
                onClick={() => { onInsert(`{{${v.token}}}`); }}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-violet-50">
                <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[8px] font-bold text-indigo-600">
                  <User className="h-2.5 w-2.5" />
                </span>
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 group-hover:text-violet-700">{`{{${v.token}}}`}</p>
                {v.pii && <span className="rounded bg-amber-100 px-1 py-0.5 text-[7px] font-bold text-amber-600">PII</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Helper functions */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <Type className="h-2.5 w-2.5" /> Helpers
          </p>
          <div className="space-y-0.5">
            {helperFns.map((h) => (
              <button key={h.token} type="button"
                onClick={() => { onInsert(`{{${h.token}}}`); }}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-violet-50">
                <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-slate-100 text-[8px] font-bold text-slate-600">fn</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-700 group-hover:text-violet-700">{h.label}</p>
                  <p className="font-mono text-[9px] text-slate-400">{`{{${h.token}}}`}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Channel-specific editors ───────────────────────────────────────────────

// ─── Smart Inputs & HTML Editor with Per-Field Personalization ──────────────

function SmartInput({ value, onChange, placeholder, mono, className, schema }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; className?: string; schema?: SchemaField[];
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInsert = (token: string) => {
    if (!inputRef.current) {
      onChange(`${value}${token}`);
    } else {
      const start = inputRef.current.selectionStart ?? value.length;
      const end = inputRef.current.selectionEnd ?? value.length;
      const newVal = value.slice(0, start) + token + value.slice(end);
      onChange(newVal);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newPos = start + token.length;
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
    setPopoverOpen(false);
  };

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-slate-200 py-2 pl-3 ${
          schema ? 'pr-9' : 'pr-3'
        } text-sm text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition ${
          mono ? 'font-mono' : ''
        } ${className ?? ''}`}
      />
      {schema && (
        <div className="absolute right-1.5 flex items-center">
          <button
            type="button"
            title="Insert personalization variable"
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
              popoverOpen
                ? 'bg-violet-100 text-violet-700'
                : 'text-slate-400 hover:bg-violet-50 hover:text-violet-600'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <PersonalizationPopover
            schema={schema}
            onInsert={handleInsert}
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function SmartTextArea({ value, onChange, placeholder, rows = 3, mono, className, schema }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean; className?: string; schema?: SchemaField[];
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsert = (token: string) => {
    if (!textareaRef.current) {
      onChange(`${value}${token}`);
    } else {
      const start = textareaRef.current.selectionStart ?? value.length;
      const end = textareaRef.current.selectionEnd ?? value.length;
      const newVal = value.slice(0, start) + token + value.slice(end);
      onChange(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = start + token.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
    setPopoverOpen(false);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full rounded-lg border border-slate-200 p-3 ${
          schema ? 'pr-9' : ''
        } text-sm text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition ${
          mono ? 'font-mono text-xs' : ''
        } ${className ?? ''}`}
      />
      {schema && (
        <div className="absolute right-2 top-2">
          <button
            type="button"
            title="Insert personalization variable"
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
              popoverOpen
                ? 'bg-violet-100 text-violet-700'
                : 'bg-white/80 backdrop-blur-sm text-slate-400 shadow-sm border border-slate-200 hover:bg-violet-50 hover:text-violet-600'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <PersonalizationPopover
            schema={schema}
            onInsert={handleInsert}
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function HtmlEditor({ value, onChange, placeholder, schema }: {
  value: string; onChange: (v: string) => void; placeholder?: string; schema?: SchemaField[];
}) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenView, setFullScreenView] = useState<'split' | 'code' | 'preview'>('split');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = (before: string, after: string = '') => {
    if (!textareaRef.current) {
      onChange(`${value}${before}${after}`);
      return;
    }
    const start = textareaRef.current.selectionStart ?? value.length;
    const end = textareaRef.current.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const replacement = `${before}${selected || 'text'}${after}`;
    const newVal = value.slice(0, start) + replacement + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = start + before.length + (selected ? selected.length : 4);
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleInsertToken = (token: string) => {
    insertSnippet(token, '');
    setPopoverOpen(false);
  };

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {/* Rich HTML Formatting Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
          {/* Formatting Actions */}
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" title="Bold <strong>" onClick={() => insertSnippet('<strong>', '</strong>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Italic <em>" onClick={() => insertSnippet('<em>', '</em>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Heading <h2>" onClick={() => insertSnippet('<h2>', '</h2>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <Heading className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Paragraph <p>" onClick={() => insertSnippet('<p>', '</p>')}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              &lt;p&gt;
            </button>

            <div className="h-4 w-px bg-slate-300 mx-1" />

            <button type="button" title="Button CTA" onClick={() => insertSnippet('<a href="#" style="background:#4f46e5; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:bold;">', '</a>')}
              className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition">
              <Link2 className="h-3 w-3" /> CTA Button
            </button>
            <button type="button" title="Table Snippet" onClick={() => insertSnippet('<table style="width:100%; border-collapse:collapse;">\n  <tr>\n    <td style="padding:8px; border-bottom:1px solid #eee;">Item</td>\n    <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">Price</td>\n  </tr>\n</table>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <Table className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="List <ul>" onClick={() => insertSnippet('<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <List className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Code <code>" onClick={() => insertSnippet('<code>', '</code>')}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition">
              <Code className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Personalization Popover, View Toggle & Fullscreen */}
          <div className="flex items-center gap-2">
            {schema && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPopoverOpen(!popoverOpen)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
                    popoverOpen
                      ? 'border-violet-300 bg-violet-100 text-violet-700'
                      : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                  <span>Personalize</span>
                </button>
                <PersonalizationPopover
                  schema={schema}
                  onInsert={handleInsertToken}
                  open={popoverOpen}
                  onClose={() => setPopoverOpen(false)}
                />
              </div>
            )}

            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
                  viewMode === 'code' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileCode className="h-3 w-3" /> HTML Code
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
                  viewMode === 'preview' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3 w-3" /> Visual
              </button>
            </div>

            <button
              type="button"
              title="Full Screen Editor"
              onClick={() => setIsFullScreen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-sm"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Editor Content Area */}
        {viewMode === 'code' ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={7}
            className="w-full bg-slate-900 p-3.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />
        ) : (
          <div className="min-h-[160px] p-4 bg-slate-50 overflow-auto">
            <div
              className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-slate-900"
              dangerouslySetInnerHTML={{ __html: value || '<p class="text-slate-400 italic">Empty body preview...</p>' }}
            />
          </div>
        )}
      </div>

      {/* Full-Screen Modern HTML Editor Overlay */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md p-4 md:p-6 text-slate-100 animate-in fade-in duration-200">
          {/* Fullscreen Header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md">
                <Code className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Modern HTML Email Editor
                  <span className="rounded-full bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 text-[10px] font-semibold text-violet-300">FULL SCREEN</span>
                </h3>
                <p className="text-xs text-slate-400">Edit HTML markup with live visual preview & personalization support</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Personalization popover in Full Screen toolbar */}
              {schema && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPopoverOpen(!popoverOpen)}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Personalize</span>
                  </button>
                  <PersonalizationPopover
                    schema={schema}
                    onInsert={handleInsertToken}
                    open={popoverOpen}
                    onClose={() => setPopoverOpen(false)}
                  />
                </div>
              )}

              {/* View mode buttons in Full Screen */}
              <div className="flex items-center rounded-lg bg-slate-800 p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setFullScreenView('split')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    fullScreenView === 'split' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Split View
                </button>
                <button
                  type="button"
                  onClick={() => setFullScreenView('code')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    fullScreenView === 'code' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Code Only
                </button>
                <button
                  type="button"
                  onClick={() => setFullScreenView('preview')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    fullScreenView === 'preview' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Preview Only
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Full Screen Formatting Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 p-2">
            <button type="button" title="Bold <strong>" onClick={() => insertSnippet('<strong>', '</strong>')}
              className="rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition">
              B
            </button>
            <button type="button" title="Italic <em>" onClick={() => insertSnippet('<em>', '</em>')}
              className="rounded px-2 py-1 text-xs italic font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition">
              I
            </button>
            <button type="button" title="Heading <h1>" onClick={() => insertSnippet('<h1>', '</h1>')}
              className="rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition">
              H1
            </button>
            <button type="button" title="Heading <h2>" onClick={() => insertSnippet('<h2>', '</h2>')}
              className="rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition">
              H2
            </button>
            <button type="button" title="Paragraph <p>" onClick={() => insertSnippet('<p>', '</p>')}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition">
              &lt;p&gt;
            </button>
            <div className="h-4 w-px bg-slate-800 mx-1" />
            <button type="button" title="Button CTA" onClick={() => insertSnippet('<a href="#" style="background:#4f46e5; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; display:inline-block; font-weight:bold;">', '</a>')}
              className="flex items-center gap-1 rounded bg-indigo-600/30 text-indigo-300 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-600/50 transition">
              <Link2 className="h-3 w-3" /> CTA Button
            </button>
            <button type="button" title="Table" onClick={() => insertSnippet('<table style="width:100%; border-collapse:collapse;">\n  <tr>\n    <td style="padding:10px; border-bottom:1px solid #eee;">Item</td>\n    <td style="padding:10px; border-bottom:1px solid #eee; text-align:right;">Price</td>\n  </tr>\n</table>')}
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white transition">
              <Table className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="List <ul>" onClick={() => insertSnippet('<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>')}
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white transition">
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Full Screen Body Grid */}
          <div className="grid flex-1 gap-4 overflow-hidden" style={{ gridTemplateColumns: fullScreenView === 'split' ? '1fr 1fr' : '1fr' }}>
            {(fullScreenView === 'split' || fullScreenView === 'code') && (
              <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border-b border-slate-800 text-xs font-mono text-slate-400">
                  <span>HTML Source Code</span>
                  <span>UTF-8 · HTML5</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 w-full bg-slate-900 p-4 font-mono text-sm text-emerald-400 placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}

            {(fullScreenView === 'split' || fullScreenView === 'preview') && (
              <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border-b border-slate-800 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-indigo-400" /> Live HTML Preview</span>
                  <span className="text-[10px] text-slate-500">Rendered Output</span>
                </div>
                <div className="flex-1 bg-slate-950/50 p-6 overflow-auto">
                  <div
                    className="prose prose-slate max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl text-slate-900"
                    dangerouslySetInnerHTML={{ __html: value || '<p class="text-slate-400 italic">Empty body preview...</p>' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Email Editor ───────────────────────────────────────────────────────────

function EmailEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  return (
    <div className="space-y-4">
      <Field label="Subject line">
        <SmartInput value={content.subject ?? ''} onChange={(v) => set('subject', v)}
          placeholder="Your order {{data.order_id}} has shipped! 🚀" schema={schema} />
      </Field>
      <Field label="Preview text (preheader)">
        <SmartInput value={content.preheader ?? ''} onChange={(v) => set('preheader', v)}
          placeholder={'Track your package — arriving {{date data.eta "ddd D MMM"}}'} schema={schema} />
      </Field>
      <Field label="Email body (HTML supported)">
        <HtmlEditor value={content.body ?? ''} onChange={(v) => set('body', v)} schema={schema}
          placeholder={'<h1>Hi {{customer.first_name | "there"}}!</h1>\n<p>Your order <strong>{{data.order_id}}</strong> is on its way.</p>\n<a href="{{data.tracking_url}}">Track Package →</a>'} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From name">
          <SmartInput value={content.from_name ?? ''} onChange={(v) => set('from_name', v)} placeholder="Acme Store" schema={schema} />
        </Field>
        <Field label="Reply-to">
          <SmartInput value={content.reply_to ?? ''} onChange={(v) => set('reply_to', v)} placeholder="support@acme.com" schema={schema} />
        </Field>
      </div>
    </div>
  );
}

// ─── SMS Editor ─────────────────────────────────────────────────────────────

function SmsEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  const charCount = (content.body ?? '').length;
  const segments = Math.ceil(charCount / 160) || 1;

  return (
    <div className="space-y-4">
      <Field label="Message body">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={4} schema={schema}
          placeholder={'Hi {{customer.first_name | "there"}}, your order {{data.order_id}} has shipped! Track: {{data.tracking_url}}'} />
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
          <span>{charCount} chars · {segments} SMS segment{segments !== 1 ? 's' : ''}</span>
          <span>Max 480 chars recommended</span>
        </div>
      </Field>
      <Field label="Sender ID / From">
        <SmartInput value={content.sender_id ?? ''} onChange={(v) => set('sender_id', v)} placeholder="ACME" schema={schema} />
      </Field>
    </div>
  );
}

// ─── WhatsApp Editor ────────────────────────────────────────────────────────

function WhatsAppEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  const buttons = content.buttons ?? [];

  return (
    <div className="space-y-4">
      <Field label="Template name (registered with Meta)">
        <SmartInput value={content.template_name ?? ''} onChange={(v) => set('template_name', v)}
          placeholder="order_shipped_v2" mono schema={schema} />
      </Field>
      <Field label="Header (optional)">
        <div className="flex gap-2">
          <select value={content.header_type ?? 'text'} onChange={(e) => set('header_type', e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="document">Document</option>
            <option value="video">Video</option>
          </select>
          <div className="flex-1">
            <SmartInput value={content.header ?? ''} onChange={(v) => set('header', v)}
              placeholder={content.header_type === 'text' ? 'Order Update 📦' : 'https://...'} schema={schema} />
          </div>
        </div>
      </Field>
      <Field label="Body">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={4} schema={schema}
          placeholder={'Hi {{customer.first_name}}!\n\nYour order *{{data.order_id}}* has been shipped.\nEstimated delivery: {{date data.eta "ddd D MMM"}}\n\nTrack at {{data.tracking_url}}'} />
      </Field>
      <Field label="Footer (optional)">
        <SmartInput value={content.footer ?? ''} onChange={(v) => set('footer', v)}
          placeholder="Reply STOP to unsubscribe" schema={schema} />
      </Field>
      <Field label="Buttons (up to 3)">
        <div className="space-y-2">
          {buttons.map((b: { type: string; title: string; url?: string; payload?: string }, i: number) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <select value={b.type ?? 'url'} onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, type: e.target.value } : x))}
                className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none">
                <option value="url">URL</option>
                <option value="quick_reply">Quick Reply</option>
                <option value="call">Call</option>
              </select>
              <input value={b.title} placeholder="Button label"
                onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, title: e.target.value } : x))}
                className="w-28 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" />
              {b.type === 'url' && (
                <input value={b.url ?? ''} placeholder="{{data.tracking_url}}"
                  onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, url: e.target.value } : x))}
                  className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none" />
              )}
              <button type="button" onClick={() => set('buttons', buttons.filter((_: typeof b, j: number) => j !== i))}
                className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" onClick={() => set('buttons', [...buttons, { type: 'url', title: '', url: '' }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus className="h-3 w-3" /> Add button
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

// ─── Push Editor (Web / Mobile) ─────────────────────────────────────────────

function PushEditor({ content, set, schema, isMobile }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[]; isMobile?: boolean }) {
  const buttons = content.buttons ?? [];

  return (
    <div className="space-y-4">
      <Field label="Title">
        <SmartInput value={content.title ?? ''} onChange={(v) => set('title', v)}
          placeholder="Order {{data.order_id}} is on its way" schema={schema} />
      </Field>
      <Field label="Body">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={3} schema={schema}
          placeholder={'Hi {{customer.first_name | "there"}} — arriving {{date data.eta "ddd D MMM"}}.'} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Icon URL">
          <SmartInput value={content.icon_url ?? ''} onChange={(v) => set('icon_url', v)} placeholder="https://..." schema={schema} />
        </Field>
        <Field label="Image URL">
          <SmartInput value={content.image_url ?? ''} onChange={(v) => set('image_url', v)} placeholder="https://..." schema={schema} />
        </Field>
      </div>
      <Field label="Click URL">
        <SmartInput value={content.click_url ?? ''} onChange={(v) => set('click_url', v)}
          placeholder="{{data.tracking_url}}" mono schema={schema} />
      </Field>
      {isMobile && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Badge count">
            <SmartInput value={content.badge ?? ''} onChange={(v) => set('badge', v)} placeholder="1" schema={schema} />
          </Field>
          <Field label="Sound">
            <SmartInput value={content.sound ?? ''} onChange={(v) => set('sound', v)} placeholder="default" schema={schema} />
          </Field>
        </div>
      )}
      <Field label="Buttons (up to 2)">
        <div className="space-y-2">
          {buttons.map((b: { title: string; url: string }, i: number) => (
            <div key={i} className="flex gap-2">
              <input value={b.title} placeholder="Track package"
                onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, title: e.target.value } : x))}
                className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
              <input value={b.url} placeholder="{{data.tracking_url}}"
                onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, url: e.target.value } : x))}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
              <button type="button" onClick={() => set('buttons', buttons.filter((_: typeof b, j: number) => j !== i))}
                className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {buttons.length < 2 && (
            <button type="button" onClick={() => set('buttons', [...buttons, { title: '', url: '' }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus className="h-3 w-3" /> Add button
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

// ─── In-App / In-Browser Editor ─────────────────────────────────────────────

function InAppEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  return (
    <div className="space-y-4">
      <Field label="Layout">
        <div className="flex gap-2">
          {['banner', 'modal', 'full_screen', 'card'].map((l) => (
            <button key={l} type="button" onClick={() => set('layout', l)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                (content.layout ?? 'banner') === l ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {l.replace('_', ' ')}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Title">
        <SmartInput value={content.title ?? ''} onChange={(v) => set('title', v)}
          placeholder="Special offer for you, {{customer.first_name}}!" schema={schema} />
      </Field>
      <Field label="Body">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={3} schema={schema}
          placeholder={'Get {{data.discount}}% off on your next purchase. Use code {{data.code}} at checkout.'} />
      </Field>
      <Field label="Image URL">
        <SmartInput value={content.image_url ?? ''} onChange={(v) => set('image_url', v)} placeholder="https://..." schema={schema} />
      </Field>
      <Field label="CTA button label">
        <SmartInput value={content.cta_label ?? ''} onChange={(v) => set('cta_label', v)} placeholder="Shop Now" schema={schema} />
      </Field>
      <Field label="CTA action / Deep link">
        <SmartInput value={content.cta_url ?? ''} onChange={(v) => set('cta_url', v)}
          placeholder="app://offers/{{data.offer_id}}" mono schema={schema} />
      </Field>
      <Field label="Dismiss style">
        <div className="flex gap-2">
          {['close_button', 'swipe', 'auto_dismiss'].map((d) => (
            <button key={d} type="button" onClick={() => set('dismiss', d)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                (content.dismiss ?? 'close_button') === d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {d.replace('_', ' ')}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

// ─── Voice Editor ───────────────────────────────────────────────────────────

function VoiceEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  return (
    <div className="space-y-4">
      <Field label="TTS message (Text-to-Speech)">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={4} schema={schema}
          placeholder={'Hello {{customer.first_name}}. This is a reminder that your order {{data.order_id}} has been shipped and will arrive by {{date data.eta "ddd D MMM"}}. Thank you for shopping with us.'} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voice / Language">
          <select value={content.voice ?? 'en-US-Wavenet-D'} onChange={(e) => set('voice', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
            <option value="en-US-Wavenet-D">English (US) — Male</option>
            <option value="en-US-Wavenet-F">English (US) — Female</option>
            <option value="en-IN-Wavenet-A">English (IN) — Female</option>
            <option value="hi-IN-Wavenet-A">Hindi (IN) — Female</option>
          </select>
        </Field>
        <Field label="Repeat">
          <select value={content.repeat ?? '1'} onChange={(e) => set('repeat', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
            <option value="1">Once</option>
            <option value="2">Twice</option>
            <option value="3">Three times</option>
          </select>
        </Field>
      </div>
      <Field label="DTMF / Keypress actions (optional)">
        <SmartInput value={content.dtmf ?? ''} onChange={(v) => set('dtmf', v)} schema={schema}
          placeholder='Press 1 to confirm, press 2 to cancel' />
      </Field>
    </div>
  );
}

// ─── RCS Editor ─────────────────────────────────────────────────────────────

function RcsEditor({ content, set, schema }: { content: Record<string, any>; set: (k: string, v: unknown) => void; schema: SchemaField[] }) {
  const buttons = content.buttons ?? [];

  return (
    <div className="space-y-4">
      <Field label="Message text">
        <SmartTextArea value={content.body ?? ''} onChange={(v) => set('body', v)} rows={4} schema={schema}
          placeholder={'Hi {{customer.first_name}}, your order {{data.order_id}} is on its way! 🎉'} />
      </Field>
      <Field label="Card title (optional)">
        <SmartInput value={content.title ?? ''} onChange={(v) => set('title', v)} placeholder="Order Shipped" schema={schema} />
      </Field>
      <Field label="Media URL (image / video)">
        <SmartInput value={content.media_url ?? ''} onChange={(v) => set('media_url', v)} placeholder="https://..." schema={schema} />
      </Field>
      <Field label="Suggested actions (up to 4)">
        <div className="space-y-2">
          {buttons.map((b: { title: string; url: string }, i: number) => (
            <div key={i} className="flex gap-2">
              <input value={b.title} placeholder="Track Order"
                onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, title: e.target.value } : x))}
                className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
              <input value={b.url} placeholder="{{data.tracking_url}}"
                onChange={(e) => set('buttons', buttons.map((x: typeof b, j: number) => j === i ? { ...x, url: e.target.value } : x))}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
              <button type="button" onClick={() => set('buttons', buttons.filter((_: typeof b, j: number) => j !== i))}
                className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {buttons.length < 4 && (
            <button type="button" onClick={() => set('buttons', [...buttons, { title: '', url: '' }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus className="h-3 w-3" /> Add action
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

// ─── Channel-adaptive Preview ───────────────────────────────────────────────

function ChannelPreview({ channel, content, previewCtx }: {
  channel: Channel; content: Record<string, any>; previewCtx: { data: Record<string, unknown>; customer: Record<string, unknown> };
}) {
  const render = (s: string) => renderPreview(s, previewCtx).text;
  const missing = [
    ...(content.title ? renderPreview(content.title, previewCtx).missing : []),
    ...(content.body ? renderPreview(content.body, previewCtx).missing : []),
    ...(content.subject ? renderPreview(content.subject, previewCtx).missing : []),
  ];
  const uniqueMissing = [...new Set(missing)];

  const chDef = CHANNEL_REGISTRY.find((c) => c.id === channel);
  const icon = CHANNEL_ICONS[channel] ?? <Bell className="h-4 w-4" />;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {chDef?.name ?? channel} Preview
      </p>

      {(channel === 'web_push' || channel === 'mobile_push') && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{render(content.title ?? '') || 'Notification title'}</p>
              <p className="mt-0.5 line-clamp-3 text-xs text-slate-600">{render(content.body ?? '') || 'Notification body copy shows here.'}</p>
              {content.image_url && <div className="mt-2 h-20 rounded-md bg-slate-200" />}
              {(content.buttons ?? []).filter((b: { title: string }) => b.title).length > 0 && (
                <div className="mt-2 flex gap-2">
                  {(content.buttons ?? []).filter((b: { title: string }) => b.title).map((b: { title: string }, i: number) => (
                    <span key={i} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                      {render(b.title)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {content.click_url && (
            <p className="mt-2 truncate text-[11px] text-slate-400">→ {render(content.click_url)}</p>
          )}
        </div>
      )}

      {channel === 'email' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <p className="text-[10px] text-slate-400">From: <span className="text-slate-600">{content.from_name || 'Your Brand'}</span></p>
            <p className="text-sm font-semibold text-slate-900">{render(content.subject ?? '') || 'Subject line preview'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{render(content.preheader ?? '') || 'Preheader text...'}</p>
          </div>
          <div className="p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {render(content.body ?? '') || 'Email body content will appear here...'}
          </div>
        </div>
      )}

      {channel === 'sms' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="mx-auto max-w-[220px] rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-1 text-[10px] font-medium text-slate-400">{content.sender_id || 'BRAND'}</p>
            <div className="rounded-xl bg-blue-50 px-3 py-2">
              <p className="text-xs text-slate-800 whitespace-pre-wrap">{render(content.body ?? '') || 'SMS message body...'}</p>
            </div>
            <p className="mt-1 text-right text-[9px] text-slate-400">now</p>
          </div>
        </div>
      )}

      {channel === 'whatsapp' && (
        <div className="rounded-xl border border-slate-200 bg-[#e5ddd5] p-3 shadow-sm">
          <div className="mx-auto max-w-[260px]">
            {content.header && content.header_type === 'text' && (
              <p className="mb-1 text-[10px] font-bold text-slate-600">{render(content.header)}</p>
            )}
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <p className="text-xs text-slate-800 whitespace-pre-wrap">{render(content.body ?? '') || 'WhatsApp message body...'}</p>
              {content.footer && <p className="mt-2 text-[10px] text-slate-400">{render(content.footer)}</p>}
            </div>
            {(content.buttons ?? []).length > 0 && (
              <div className="mt-1 space-y-1">
                {(content.buttons ?? []).map((b: { title: string }, i: number) => (
                  <div key={i} className="rounded-lg bg-white px-3 py-1.5 text-center text-xs font-medium text-blue-500 shadow-sm">
                    {render(b.title) || 'Button'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(channel === 'in_app' || channel === 'in_browser') && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className={`mx-auto rounded-xl bg-white shadow-lg overflow-hidden ${(content.layout ?? 'banner') === 'banner' ? 'max-w-full' : 'max-w-[240px]'}`}>
            {content.image_url && <div className="h-24 bg-gradient-to-r from-brand-400 to-violet-400" />}
            <div className="p-3">
              <p className="text-sm font-bold text-slate-900">{render(content.title ?? '') || 'Title'}</p>
              <p className="mt-1 text-xs text-slate-600">{render(content.body ?? '') || 'Message body...'}</p>
              {content.cta_label && (
                <button type="button" className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                  {render(content.cta_label)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {channel === 'rcs' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="mx-auto max-w-[260px]">
            <div className="rounded-xl bg-white shadow-sm overflow-hidden">
              {content.media_url && <div className="h-32 bg-gradient-to-br from-indigo-300 to-brand-400" />}
              {content.title && <p className="px-3 pt-2 text-sm font-bold text-slate-900">{render(content.title)}</p>}
              <p className="p-3 text-xs text-slate-700 whitespace-pre-wrap">{render(content.body ?? '') || 'RCS message body...'}</p>
            </div>
            {(content.buttons ?? []).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {(content.buttons ?? []).map((b: { title: string }, i: number) => (
                  <span key={i} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-600 shadow-sm">
                    {render(b.title) || 'Action'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {channel === 'voice' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm text-center">
          <Mic className="mx-auto mb-2 h-8 w-8 text-brand-400" />
          <p className="text-xs text-slate-600 italic whitespace-pre-wrap">"{render(content.body ?? '') || 'Voice message text...'}"</p>
          {content.voice && <p className="mt-1 text-[10px] text-slate-400">Voice: {content.voice}</p>}
        </div>
      )}

      {uniqueMissing.length > 0 && (
        <p className="text-[11px] text-amber-600">
          Unresolved: {uniqueMissing.map((m) => <code key={m} className="mx-0.5 rounded bg-amber-50 px-1">{m}</code>)}
        </p>
      )}
      <p className="text-[11px] text-slate-400">Preview uses each field's example value.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════════════

export function RtmTemplateEditor({ channel, template, schema, onChange }: Props) {
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const content = template.content as Record<string, any>;

  const set = useCallback((key: string, val: unknown) => {
    onChange({ ...template, content: { ...template.content, [key]: val } });
  }, [template, onChange]);

  const previewCtx = useMemo(() => ({
    data: sampleFromSchema(schema),
    customer: { first_name: 'Sam', last_name: 'Rivera', full_name: 'Sam Rivera', email: 'sam@example.com', mobile: '+919876543210' },
    env: {},
  }), [schema]);

  // Insert personalization token into the body (or subject for email) field
  const handleInsertToken = useCallback((token: string) => {
    if (channel === 'email') {
      set('body', `${content.body ?? ''}${token}`);
    } else {
      set('body', `${content.body ?? ''}${token}`);
    }
    setPersonalizationOpen(false);
  }, [channel, content.body, set]);

  const chDef = CHANNEL_REGISTRY.find((c) => c.id === channel);
  const chIcon = CHANNEL_ICONS[channel] ?? <Bell className="h-4 w-4" />;

  return (
    <div className="space-y-4">
      {/* Channel header badge */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
            {chIcon}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{chDef?.name ?? channel} Template Editor</p>
            <p className="text-[10px] text-slate-400">
              {chDef?.type === 'messaging' ? 'Messaging channel' : chDef?.type === 'push' ? 'Push notification' : 'Experience layer'}
              {chDef?.capabilities.richContent && ' · Rich content'}
              {chDef?.capabilities.buttons && ' · Buttons'}
              {chDef?.capabilities.media && ' · Media'}
              {chDef?.capabilities.html && ' · HTML'}
              {chDef?.capabilities.templates && ' · Templates'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: Editor */}
        <div className="space-y-4">
          {/* Channel-specific editor */}
          {channel === 'email' && <EmailEditor content={content} set={set} schema={schema} />}
          {channel === 'sms' && <SmsEditor content={content} set={set} schema={schema} />}
          {channel === 'whatsapp' && <WhatsAppEditor content={content} set={set} schema={schema} />}
          {channel === 'rcs' && <RcsEditor content={content} set={set} schema={schema} />}
          {channel === 'web_push' && <PushEditor content={content} set={set} schema={schema} />}
          {channel === 'mobile_push' && <PushEditor content={content} set={set} schema={schema} isMobile />}
          {(channel === 'in_app' || channel === 'in_browser') && <InAppEditor content={content} set={set} schema={schema} />}
          {channel === 'voice' && <VoiceEditor content={content} set={set} schema={schema} />}

          {/* Missing var policy */}
          <Field label="When a variable is missing">
            <div className="flex flex-wrap gap-2">
              {POLICIES.map((p) => (
                <button key={p.value} type="button" title={p.hint}
                  onClick={() => onChange({ ...template, missing_var_policy: p.value })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    template.missing_var_policy === p.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Right: Preview */}
        <div>
          <ChannelPreview channel={channel} content={content} previewCtx={previewCtx} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
