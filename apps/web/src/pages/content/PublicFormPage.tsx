import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FormPreview } from '@/components/forms/FormPreview';
import { fetchPublicForm } from '@/lib/forms';

export function PublicFormPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();

  const tenantId = params.get('tenant') ?? '';
  const environment = params.get('environment') ?? 'production';
  const isPreview = params.get('preview') === '1' || params.get('test') === '1';

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['public-form', slug, tenantId, environment, isPreview],
    queryFn: () => fetchPublicForm(slug, tenantId, environment, isPreview),
    enabled: Boolean(slug && tenantId),
  });

  if (!tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">
        Missing tenant parameter. Use the embed URL from the form settings panel.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 font-medium">
        Loading form…
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">
        <p className="font-semibold text-slate-800 mb-1">Form not found or not published</p>
        <p className="text-xs text-slate-500 max-w-sm">
          If this form is currently in Draft mode, publish it from the Form Studio or test it with a preview link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-8">
      <FormPreview form={form} tenantId={tenantId} environment={environment} preview={isPreview} embedded />
    </div>
  );
}
