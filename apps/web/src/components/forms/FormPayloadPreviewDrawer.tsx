import { useState, useMemo } from 'react';
import { X, RefreshCw, Database, Sparkles, CheckCircle2, UserCheck } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import type { FormField, FormFieldMapping } from '@/lib/forms';
import { generateSampleFieldValue, resolveIdentityValues } from '@/lib/form-mapping';
import type { CustomerMatchKey, FormSchemaMapping } from '@/lib/forms';

type Props = {
  open: boolean;
  onClose: () => void;
  fields: FormField[];
  mappings: FormFieldMapping[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
  customerMatchKey?: CustomerMatchKey;
  customerEmailField?: string;
  customerMobileField?: string;
};

export function FormPayloadPreviewDrawer({
  open,
  onClose,
  fields,
  mappings,
  storageTarget,
  schemaSlug,
  customerMatchKey = 'email_or_mobile',
  customerEmailField,
  customerMobileField,
}: Props) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.name] = generateSampleFieldValue(f);
    });
    return initial;
  });

  const handleGenerateRandom = () => {
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      next[f.name] = generateSampleFieldValue(f);
    });
    setFormData(next);
  };

  const handleInputChange = (fieldName: string, val: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: val }));
  };

  // Compute transformed output payload based on current mappings
  const transformedPayload = useMemo(() => {
    const output: Record<string, unknown> = {};

    mappings.forEach((m) => {
      if (!m.schema_field) return;
      const rawVal = formData[m.form_field];
      if (rawVal === undefined) return;

      let val: unknown = rawVal;

      // Mirrors form-submit (supabase/functions/form-submit) exactly, so the preview
      // shows what will really be stored (TD-11: it used to differ).
      if (typeof val === 'string') {
        if (m.transform === 'trim') val = val.trim();
        else if (m.transform === 'lowercase') val = val.toLowerCase();
        else if (m.transform === 'uppercase') val = val.toUpperCase();
      }
      const cast = m.type_cast ?? 'none';
      if (cast !== 'none' && val !== null && val !== undefined && val !== '') {
        if (cast === 'string') val = String(val);
        else if (cast === 'number') {
          const n = Number(val);
          if (!Number.isNaN(n)) val = n;
        } else if (cast === 'boolean') {
          if (typeof val !== 'boolean') {
            if (val === 'true' || val === '1' || val === 'on') val = true;
            else if (val === 'false' || val === '0' || val === 'off') val = false;
            else val = Boolean(val);
          }
        } else if (cast === 'date') {
          const d = new Date(String(val));
          if (!Number.isNaN(d.getTime())) val = d.toISOString().slice(0, 10);
        }
      }

      output[m.schema_field] = val;
    });

    return output;
  }, [formData, mappings]);

  // Identity resolution preview
  const dummyMapping: FormSchemaMapping = {
    storage_target: storageTarget,
    target_schema_slug: schemaSlug,
    customer_match_key: customerMatchKey,
    customer_email_field: customerEmailField,
    customer_mobile_field: customerMobileField,
  };
  const identity = resolveIdentityValues(formData, fields, dummyMapping);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] overflow-hidden bg-slate-900/40 backdrop-blur-sm transition-opacity">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-brand-500/20 p-2 text-brand-400 border border-brand-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Live Data Transformation Playground</h3>
                <p className="text-xs text-slate-400">
                  Simulate raw form submissions and test database schema payloads
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Subheader Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Database className="h-4 w-4 text-brand-600" />
              <span>Target:</span>
              <Badge variant="default" className="font-mono text-xs">
                {storageTarget === 'customer' ? 'Customer 360' : schemaSlug}
              </Badge>
            </div>
            <Button size="sm" variant="secondary" onClick={handleGenerateRandom} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Populate Sample Values
            </Button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Identity Match Card */}
            <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 p-4 text-xs text-slate-700 space-y-2">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <UserCheck className="h-4 w-4 text-blue-600" />
                Customer Identity Resolution
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400">Resolved Email:</span>{' '}
                  <span className="font-mono text-slate-800 font-medium">
                    {identity.email ?? 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Resolved Mobile:</span>{' '}
                  <span className="font-mono text-slate-800 font-medium">
                    {identity.mobile ?? 'None'}
                  </span>
                </div>
              </div>
            </div>

            {/* Inputs vs Output Playground */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column: Form Input Mocking */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  1. Raw Form Inputs
                </h4>
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  {fields.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 flex justify-between">
                        <span>{f.label}</span>
                        <code className="text-[10px] text-slate-400">{f.name}</code>
                      </label>
                      <input
                        type="text"
                        value={formData[f.name] ?? ''}
                        onChange={(e) => handleInputChange(f.name, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none font-mono bg-slate-50/50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Output JSON Payload */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>2. Database Record Output</span>
                  <span className="text-[10px] font-normal text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Real-time Computed
                  </span>
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm text-xs font-mono text-emerald-400 overflow-x-auto min-h-[300px]">
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(transformedPayload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close Playground
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
