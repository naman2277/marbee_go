import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { EmailTemplateStudio } from '@/components/content-templates/EmailTemplateStudio';
import { ChannelStudio } from '@/components/content-templates/channel-studio/ChannelStudio';
import {
  getCustomerTesterProfiles,
  createTesterProfileContext,
  DEFAULT_CUSTOMER_TESTERS,
} from '@/lib/customer-testers';
import {
  fetchContentTemplateById,
  normalizeTemplateStatus,
  updateContentTemplate,
  type ContentTemplateSettings,
  type EmailContent,
  type TemplateContent,
} from '@/lib/content-templates';
import { formatSchemaDate } from '@/lib/schema-stats';
import { useTenantScope } from '@/contexts/AuthContext';

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [draftContent, setDraftContent] = useState<TemplateContent | null>(null);
  const [draftSettings, setDraftSettings] = useState<ContentTemplateSettings>({});
  const [dirty, setDirty] = useState(false);

  const { data: template, isLoading, error } = useQuery({
    queryKey: ['content-template', id],
    queryFn: () => fetchContentTemplateById(id!),
    enabled: Boolean(id),
  });

  const testerProfiles = useMemo(() => {
    return getCustomerTesterProfiles(tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (template) {
      setDraftContent(template.content);
      setDraftSettings(template.settings ?? {});
      setDirty(false);
    }
  }, [template]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['content-template', id] });
    queryClient.invalidateQueries({ queryKey: ['content-templates', tenantId, environment] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload?: { content?: TemplateContent; settings?: ContentTemplateSettings; status?: string }) => {
      const contentToPersist = payload?.content ?? draftContent;
      const settingsToPersist = payload?.settings ?? draftSettings;
      if (!contentToPersist) return;
      const result = await updateContentTemplate(id!, {
        content: contentToPersist,
        settings: settingsToPersist,
        status: payload?.status,
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      if (variables?.content) setDraftContent(variables.content);
      if (variables?.settings) setDraftSettings(variables.settings);
      setDirty(false);
      invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <p className="text-sm font-medium text-slate-500 animate-pulse">Loading template studio…</p>
      </div>
    );
  }

  if (error || !template || !draftContent) {
    return (
      <EmptyState
        title="Template not found"
        description="This message template does not exist for your tenant or was deleted."
        action={
          <Link to="/content/templates">
            <Button variant="secondary">Back to Templates</Button>
          </Link>
        }
      />
    );
  }

  const currentProfile = testerProfiles[0] ?? DEFAULT_CUSTOMER_TESTERS[0];
  const currentProfileContext = createTesterProfileContext(currentProfile);

  // Full-Screen Dedicated Email Studio
  if (template.channel === 'email') {
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        <EmailTemplateStudio
          templateId={id}
          content={draftContent as EmailContent}
          initialStatus={normalizeTemplateStatus(template.status)}
          onChange={(newContent) => {
            setDraftContent(newContent);
            setDirty(true);
          }}
          personalizationSample={currentProfileContext}
          templateName={template.name}
          createdDate={formatSchemaDate(template.created_at)}
          onSave={(updatedContent, updatedStatus) => saveMutation.mutate({ content: updatedContent, status: updatedStatus })}
          onBack={() => navigate('/content/templates')}
        />
      </div>
    );
  }

  // Full-Screen Dedicated Channel Studio (SMS, WhatsApp, Web Push, RCS)
  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <ChannelStudio
        template={template}
        content={draftContent}
        settings={draftSettings}
        onChangeContent={(newContent) => {
          setDraftContent(newContent);
          setDirty(true);
        }}
        onChangeSettings={(newSettings) => {
          setDraftSettings(newSettings);
          setDirty(true);
        }}
        onSave={(status) => saveMutation.mutate({ status })}
        onBack={() => navigate('/content/templates')}
        isSaving={saveMutation.isPending}
        personalizationSample={currentProfileContext}
      />
    </div>
  );
}
