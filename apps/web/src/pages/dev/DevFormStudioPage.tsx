/**
 * DEV-ONLY harness for iterating on the Form Studio without a Supabase session.
 * Mounted at /dev/form-studio (DEV only, see App.tsx).
 */
import { FormStudio } from '@/components/forms/studio/FormStudio';
import { HtmlFormMappingTab } from '@/components/forms/HtmlFormMappingTab';
import { FormEmbedPanel } from '@/components/forms/FormEmbedPanel';
import { FormSubmissionsPanel } from '@/components/forms/FormSubmissionsPanel';
import { createFormField, type MarbeeForm } from '@/lib/forms';
import type { SchemaMappingOption } from '@/lib/form-mapping';

const now = new Date().toISOString();

const FIELDS = [
  { ...createFormField('Full name', 0, 'text'), required: true },
  { ...createFormField('Work email', 1, 'email'), required: true },
  createFormField('Company website', 2, 'url'),
  { ...createFormField('Team size', 3, 'select'), options: ['1–10', '11–50', '51–200', '200+'] },
  {
    ...createFormField('Which products interest you?', 4, 'multiselect'),
    options: ['Journeys', 'Forms', 'Analytics', 'Channels'],
  },
  createFormField('How did you hear about us?', 5, 'radio'),
  { ...createFormField('Rate your interest', 6, 'rating'), max_value: 5 },
  createFormField('utm_source', 7, 'hidden'),
  { ...createFormField('I agree to the Terms of Service', 8, 'consent'), required: true },
];

const MOCK_FORM: MarbeeForm = {
  id: 'dev-form',
  tenant_id: 'demo',
  environment: 'production',
  name: 'Product Interest Survey',
  slug: 'product-interest',
  fields: FIELDS.map((f, i) => ({ ...f, sort_order: i })),
  schema_mapping: { storage_target: 'customer' },
  settings: {
    build_mode: 'builder',
    description: 'Tell us what you are looking for and we will follow up.',
    submit_label: 'Send',
  },
  status: 'draft',
  created_at: now,
  updated_at: now,
};

const SCHEMAS: SchemaMappingOption[] = [
  {
    slug: 'customer',
    name: 'Customer 360',
    schema_fields: [
      { name: 'full_name', field_type: 'text' },
      { name: 'email', field_type: 'email' },
      { name: 'company', field_type: 'text' },
    ],
  },
];

export function DevFormStudioPage() {
  return (
    <div className="h-screen bg-slate-50 p-6">
      <div className="mx-auto h-full max-w-[1600px]">
        <FormStudio
          form={MOCK_FORM}
          tenantId="demo"
          environment="production"
          schemas={SCHEMAS}
          backTo="/dev/form-studio"
          mappingContent={
            <HtmlFormMappingTab
              form={MOCK_FORM}
              html=""
              schemas={SCHEMAS}
              isHtmlMode={false}
              onSaved={() => {}}
            />
          }
          embedContent={
            <FormEmbedPanel form={MOCK_FORM} tenantId="demo" environment="production" />
          }
          responsesContent={<FormSubmissionsPanel form={MOCK_FORM} />}
        />
      </div>
    </div>
  );
}
