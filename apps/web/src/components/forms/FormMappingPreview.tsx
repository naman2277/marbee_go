import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { FormPreview } from '@/components/forms/FormPreview';
import { FormFieldMappingPopover } from '@/components/forms/FormFieldMappingPopover';
import { FormHtmlLivePreview } from '@/components/forms/FormHtmlLivePreview';
import { updateForm, type FormField, type MarbeeForm } from '@/lib/forms';
import {
  getStorageTarget,
  isFieldMapped,
  normalizeMapping,
  type SchemaMappingOption,
} from '@/lib/form-mapping';

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  schemas: SchemaMappingOption[];
  onSaved?: () => void;
  /** When set (HTML mode), live HTML string drives the preview iframe */
  htmlOverride?: string;
};

export function FormMappingPreview({
  form,
  tenantId,
  environment,
  schemas,
  onSaved,
  htmlOverride,
}: Props) {
  const [mapping, setMapping] = useState(() => normalizeMapping(form.schema_mapping));
  const [activeField, setActiveField] = useState<FormField | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMapping(normalizeMapping(form.schema_mapping));
  }, [form.schema_mapping]);

  const saveMutation = useMutation({
    mutationFn: async (next: typeof mapping) => {
      const normalized = normalizeMapping(next);
      const result = await updateForm(form.id, { schema_mapping: normalized });
      if (result.error) throw new Error(result.error);
      return normalized;
    },
    onSuccess: (normalized) => {
      setMapping(normalized);
      setActiveField(null);
      setMessage('Mapping saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    },
  });

  const openFieldMapping = useCallback((field: FormField, rect: DOMRect) => {
    setActiveField(field);
    setAnchorRect(rect);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'marbee-map-field') return;
      const fieldName = event.data.field as string;
      const field = form.fields.find((f) => f.name === fieldName);
      if (!field) return;
      setActiveField(field);
      setAnchorRect(
        new DOMRect(
          Math.min(event.data.x ?? 120, window.innerWidth - 340),
          Math.min(event.data.y ?? 120, window.innerHeight - 420),
          0,
          0,
        ),
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [form.fields]);

  const storageTarget = getStorageTarget(mapping);
  const mappedCount = form.fields.filter((f) => isFieldMapped(mapping, f.name)).length;
  const isHtmlMode = form.settings.build_mode === 'html';

  const previewForm: MarbeeForm = htmlOverride
    ? {
        ...form,
        settings: { ...form.settings, html_content: htmlOverride, build_mode: 'html' },
      }
    : form;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Link2 className="h-3.5 w-3.5 text-brand-600" />
          <span>
            Click <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white text-[10px] ring-1 ring-slate-200">⎘</span>{' '}
            on any field to map where responses are stored
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200 text-slate-600">
            {storageTarget === 'customer' ? 'Customer 360' : mapping.target_schema_slug ?? 'Custom table'}
          </span>
          <span className="text-slate-500">
            {mappedCount}/{form.fields.length} mapped
          </span>
          {message && <span className="text-emerald-600">{message}</span>}
        </div>
      </div>

      {isHtmlMode || htmlOverride ? (
        <FormHtmlLivePreview
          html={htmlOverride ?? form.settings.html_content ?? ''}
          form={previewForm}
          tenantId={tenantId}
          environment={environment}
          mapping={mapping}
          mappingMode
        />
      ) : (
        <FormPreview
          form={form}
          tenantId={tenantId}
          environment={environment}
          preview
          mapping={mapping}
          mappingMode
          onMapField={openFieldMapping}
        />
      )}

      {activeField && (
        <FormFieldMappingPopover
          field={activeField}
          mapping={mapping}
          schemas={schemas}
          formFields={form.fields}
          anchorRect={anchorRect}
          onClose={() => setActiveField(null)}
          onSave={(next) => saveMutation.mutate(next)}
          saving={saveMutation.isPending}
        />
      )}
    </div>
  );
}
