import { FormCanvas } from '@/components/forms/FormCanvas';
import { FormPreview } from '@/components/forms/FormPreview';
import type { MarbeeForm, FormField, FormSchemaMapping } from '@/lib/forms';
import type { Device } from './StudioTopBar';

type Props = {
  form: MarbeeForm;
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onRemoveField?: (id: string) => void;
  onMoveField?: (id: string, dir: -1 | 1) => void;
  onDuplicateField?: (id: string) => void;
  onReorderField?: (sourceId: string, targetId: string) => void;
  mapping: FormSchemaMapping;
  device: Device;
  zoom: number;
  previewing: boolean;
  captchaEnabled: boolean;
  captchaType: 'smart_math' | 'turnstile';
  captchaAlign: 'left' | 'center' | 'right' | 'full';
  captchaLabel: string;
  tenantId: string;
  environment: string;
};

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: 'max-w-full',
  tablet: 'max-w-[768px]',
  mobile: 'max-w-[375px]',
};

export function StudioCanvas({
  form,
  fields,
  selectedFieldId,
  onSelectField,
  onRemoveField,
  onMoveField,
  onDuplicateField,
  onReorderField,
  mapping,
  device,
  zoom,
  previewing,
  captchaEnabled,
  captchaType,
  captchaAlign,
  captchaLabel,
  tenantId,
  environment,
}: Props) {
  const augmentedForm: MarbeeForm = {
    ...form,
    fields: fields.map((f, i) => ({ ...f, sort_order: i })),
    settings: {
      ...form.settings,
      captcha_enabled: captchaEnabled,
      captcha_type: captchaType,
      captcha_align: captchaAlign,
      captcha_label: captchaLabel,
    },
  };

  const scale = zoom / 100;

  return (
    <div className="flex-1 overflow-auto bg-slate-100/50">
      <div className="flex min-h-full items-start justify-center p-6">
        <div
          className={`w-full ${DEVICE_WIDTH[device]} transition-all duration-200`}
          style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'top center' } : undefined}
        >
          {previewing ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <FormPreview
                form={augmentedForm}
                tenantId={tenantId}
                environment={environment}
                preview
                embedded
              />
            </div>
          ) : (
            <FormCanvas
              form={augmentedForm}
              mode="edit"
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              onRemoveField={onRemoveField}
              onMoveField={onMoveField}
              onDuplicateField={onDuplicateField}
              onReorderField={onReorderField}
              mapping={mapping}
            />
          )}
        </div>
      </div>
    </div>
  );
}
