import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { FormStudio } from '@/components/forms/studio/FormStudio';
import { HtmlFormMappingTab } from '@/components/forms/HtmlFormMappingTab';
import { FormSubmissionsPanel } from '@/components/forms/FormSubmissionsPanel';
import { FormEmbedPanel } from '@/components/forms/FormEmbedPanel';
import {
  fetchFormById,
  publishForm,
  updateForm,
  type FormField,
  type FormSettings,
} from '@/lib/forms';
import { DEFAULT_HTML_TEMPLATE } from '@/lib/form-templates';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { useTenantScope } from '@/contexts/AuthContext';

export function FormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['form', id],
    queryFn: () => fetchFormById(id!),
    enabled: Boolean(id),
  });

  const { data: schemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const schemaOptions =
    schemas
      ?.filter((s) => s.table_name && (s.is_system || s.status === 'published'))
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        schema_fields: s.schema_fields as Array<{ name: string; field_type: string }>,
      })) ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['form', id] });
    queryClient.invalidateQueries({ queryKey: ['forms', tenantId, environment] });
    queryClient.invalidateQueries({ queryKey: ['form-submissions-count', id] });
    queryClient.invalidateQueries({ queryKey: ['form-submissions', id] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ fields, settings }: { fields: FormField[]; settings: any }) => {
      const result = await updateForm(id!, { fields, settings });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => invalidate(),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const result = await publishForm(id!, true);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => invalidate(),
  });

  const settingsMutation = useMutation({
    mutationFn: async (settings: FormSettings) => {
      const result = await updateForm(id!, { settings });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => invalidate(),
  });

  const nameMutation = useMutation({
    mutationFn: async (name: string) => {
      const result = await updateForm(id!, { name: name.trim() });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => invalidate(),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          Loading Form Studio…
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <EmptyState
        title="Form not found"
        description="This form does not exist for your tenant or environment."
        action={
          <Link to="/content/forms" className="text-sm font-semibold text-brand-600 hover:underline">
            Back to Forms
          </Link>
        }
      />
    );
  }

  const isHtmlMode = form.settings.build_mode === 'html';
  const html =
    form.settings.html_content ??
    DEFAULT_HTML_TEMPLATE.replace('{{form_title}}', form.name).replace(
      '{{form_description}}',
      form.settings.description ?? '',
    );

  return (
    <FormStudio
      form={form}
      tenantId={tenantId}
      environment={environment}
      schemas={schemaOptions}
      fullScreen
      onSave={(fields, settings) => saveMutation.mutate({ fields, settings })}
      onPublish={() => publishMutation.mutate()}
      onRename={(name) => nameMutation.mutate(name)}
      onSettingsSave={(settings) => settingsMutation.mutate(settings)}
      publishing={publishMutation.isPending}
      saving={saveMutation.isPending || settingsMutation.isPending}
      mappingContent={
        <HtmlFormMappingTab
          form={form}
          html={html}
          schemas={schemaOptions}
          isHtmlMode={isHtmlMode}
          onSaved={invalidate}
        />
      }
      embedContent={<FormEmbedPanel form={form} tenantId={tenantId} environment={environment} />}
      responsesContent={<FormSubmissionsPanel form={form} />}
    />
  );
}
