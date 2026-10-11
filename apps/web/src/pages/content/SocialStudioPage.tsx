import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useTenantScope } from '@/contexts/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import {
  fetchSocialAccounts,
  fetchSocialPosts,
  publishSocialPost,
  saveSocialPost,
  deleteSocialPost,
} from '@/lib/social-media';
import { SocialConnectionsManager } from '@/components/social/SocialConnectionsManager';
import { SocialStudioWorkspace, type WorkspaceSubmit } from '@/components/social/studio/SocialStudioWorkspace';

export function SocialStudioPage() {
  const { tenantId, environment } = useTenantScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['social-posts', tenantId, environment] });
  }, [queryClient, tenantId, environment]);

  const { data: accounts } = useQuery({
    queryKey: ['social-accounts', tenantId, environment],
    queryFn: () => fetchSocialAccounts(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ['social-posts', tenantId, environment],
    queryFn: () => fetchSocialPosts(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const publishMutation = useMutation({
    mutationFn: (postId: string) => publishSocialPost(tenantId, environment, postId),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deleteSocialPost(tenantId, postId),
    onSuccess: invalidate,
  });

  const handleSubmit: WorkspaceSubmit = useCallback(
    async ({ mode, draft, compiled }) => {
      const status =
        mode === 'publish' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'draft';

      const postId = await saveSocialPost({
        tenantId,
        environment,
        id: draft.id,
        content: compiled.content,
        platforms: compiled.platforms,
        mediaUrls: compiled.mediaUrls,
        linkUrl: compiled.linkUrl,
        linkedinOptions: compiled.linkedinOptions,
        instagramOptions: compiled.instagramOptions,
        scheduledAt: mode === 'schedule' ? compiled.scheduledAt : null,
        status,
      });

      if (mode === 'publish' && compiled.platforms.length > 0) {
        const res = await publishSocialPost(tenantId, environment, postId);
        if (!res.ok) throw new Error(res.error ?? 'Publishing failed — check your channel connections.');
      }

      invalidate();
    },
    [tenantId, environment, invalidate],
  );

  return (
    <RequirePermission permission={PERMISSIONS.SOCIAL_MANAGE}>
      <div className="space-y-5">
        <PageHeader
          title="Social Studio"
          description="Plan, compose, tailor per network, schedule and broadcast — the whole social workflow in one place."
        />
        <SocialStudioWorkspace
          tenantId={tenantId}
          environment={environment}
          posts={posts ?? []}
          accounts={accounts ?? []}
          loading={isLoading}
          onSubmitPost={handleSubmit}
          onPublishNow={(id) => publishMutation.mutate(id)}
          onDeletePost={(id) => deleteMutation.mutate(id)}
          onRequestConnect={() => navigate('/settings/channels?tab=social')}
          connectionsSlot={<SocialConnectionsManager tenantId={tenantId} environment={environment} />}
        />
      </div>
    </RequirePermission>
  );
}
