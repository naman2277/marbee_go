import { Card, CardHeader } from '@/components/ui';
import { FormFieldsEditor } from '@/components/forms/FormFieldsEditor';
import { FormMappingPreview } from '@/components/forms/FormMappingPreview';
import type { MarbeeForm } from '@/lib/forms';
import type { SchemaMappingOption } from '@/lib/form-mapping';

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  schemas: SchemaMappingOption[];
  onSaved?: () => void;
};

export function FormEditorPanel({ form, tenantId, environment, schemas, onSaved }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Fields" subtitle="Add and edit form inputs" />
        <FormFieldsEditor formId={form.id} fields={form.fields} onSaved={onSaved} />
      </Card>
      <Card>
        <CardHeader title="Preview & mapping" subtitle="See how your form looks and map fields to tables" />
        <div className="p-4">
          <FormMappingPreview
            form={form}
            tenantId={tenantId}
            environment={environment}
            schemas={schemas}
            onSaved={onSaved}
          />
        </div>
      </Card>
    </div>
  );
}
