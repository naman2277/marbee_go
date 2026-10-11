/**
 * DEV-ONLY harness for the Social Studio. Mounted at /dev/social-studio when
 * import.meta.env.DEV is true (see App.tsx). No Supabase / auth — posts live in
 * component state and media uploads become local object URLs.
 */
import { useMemo, useState } from 'react';
import { SocialStudioWorkspace, type WorkspaceSubmit } from '@/components/social/studio/SocialStudioWorkspace';
import { SocialConnectionsManager } from '@/components/social/SocialConnectionsManager';
import type { SocialAccount, SocialPost } from '@/lib/social-providers';

const now = Date.now();
const iso = (offsetHours: number) => new Date(now + offsetHours * 3600_000).toISOString();

const SEED_ACCOUNTS: SocialAccount[] = [
  { id: 'a1', tenantId: 'dev', environment: 'dev', platform: 'linkedin', accountName: 'Marbee', accountId: 'urn:li:org:1', status: 'connected', profileImageUrl: null, connectedAt: iso(-720), config: {} },
  { id: 'a2', tenantId: 'dev', environment: 'dev', platform: 'instagram', accountName: '@marbee', accountId: 'ig_1', status: 'connected', profileImageUrl: null, connectedAt: iso(-500), config: {} },
  { id: 'a3', tenantId: 'dev', environment: 'dev', platform: 'x', accountName: '@marbee', accountId: 'x_1', status: 'connected', profileImageUrl: null, connectedAt: iso(-300), config: {} },
];

const SEED_POSTS: SocialPost[] = [
  {
    id: 'p1', tenantId: 'dev', environment: 'dev',
    content: 'We just shipped multi-network scheduling. Compose once, tailor per network, and let the queue handle timing. 🚀',
    mediaUrls: ['https://images.unsplash.com/photo-1551434678-e076c223a692?w=1000&q=80'],
    linkUrl: 'https://marbee.io/blog/social-studio', platforms: ['linkedin', 'x'],
    scheduledAt: iso(20), publishedAt: null, status: 'scheduled', externalPostIds: {}, errorMessage: null, createdAt: iso(-4),
  },
  {
    id: 'p2', tenantId: 'dev', environment: 'dev',
    content: 'Behind the scenes of this week\'s launch 👀 #buildinpublic',
    mediaUrls: ['https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&q=80'],
    linkUrl: null, platforms: ['instagram'],
    scheduledAt: iso(44), publishedAt: null, status: 'scheduled', externalPostIds: {}, errorMessage: null, createdAt: iso(-2),
  },
  {
    id: 'p3', tenantId: 'dev', environment: 'dev',
    content: '5 lessons from scaling our content engine to 200 posts/month.',
    mediaUrls: [], linkUrl: 'https://marbee.io/lessons', platforms: ['linkedin'],
    scheduledAt: null, publishedAt: iso(-72), status: 'published', externalPostIds: {}, errorMessage: null, createdAt: iso(-96),
  },
  {
    id: 'p4', tenantId: 'dev', environment: 'dev',
    content: 'Draft: Q3 recap thread — needs numbers.',
    mediaUrls: [], linkUrl: null, platforms: ['x', 'linkedin'],
    scheduledAt: null, publishedAt: null, status: 'draft', externalPostIds: {}, errorMessage: null, createdAt: iso(-12),
  },
  {
    id: 'p5', tenantId: 'dev', environment: 'dev',
    content: 'Token expired mid-publish — retry once reconnected.',
    mediaUrls: [], linkUrl: null, platforms: ['facebook'],
    scheduledAt: null, publishedAt: null, status: 'failed', externalPostIds: {}, errorMessage: 'Facebook: OAuth token expired', createdAt: iso(-30),
  },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `ph${i}`, tenantId: 'dev', environment: 'dev',
    content: `Evergreen tip #${i + 1}: repurpose your best posts across networks.`,
    mediaUrls: [], linkUrl: null, platforms: (i % 2 ? ['linkedin'] : ['x', 'instagram']) as SocialPost['platforms'],
    scheduledAt: null, publishedAt: iso(-(i + 2) * 96), status: 'published' as const, externalPostIds: {}, errorMessage: null, createdAt: iso(-(i + 3) * 96),
  })),
];

export function DevSocialStudioPage() {
  const [posts, setPosts] = useState<SocialPost[]>(SEED_POSTS);

  const handleSubmit: WorkspaceSubmit = ({ mode, draft, compiled }) => {
    setPosts((prev) => {
      const id = draft.id ?? `new-${Date.now()}`;
      const rec: SocialPost = {
        id,
        tenantId: 'dev',
        environment: 'dev',
        content: compiled.content,
        mediaUrls: compiled.mediaUrls,
        linkUrl: compiled.linkUrl ?? null,
        platforms: compiled.platforms,
        linkedinOptions: compiled.linkedinOptions,
        instagramOptions: compiled.instagramOptions,
        scheduledAt: mode === 'schedule' ? compiled.scheduledAt : null,
        publishedAt: mode === 'publish' ? new Date().toISOString() : null,
        status: mode === 'publish' ? 'published' : mode === 'schedule' ? 'scheduled' : 'draft',
        externalPostIds: {},
        errorMessage: null,
        createdAt: new Date().toISOString(),
      };
      const without = prev.filter((p) => p.id !== id);
      return [rec, ...without];
    });
  };

  const uploadMedia = useMemo(
    () => (file: File) => Promise.resolve(URL.createObjectURL(file)),
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Dev harness · /dev/social-studio · in-memory data, no Supabase
        </div>
        <SocialStudioWorkspace
          tenantId="dev"
          environment="dev"
          posts={posts}
          accounts={SEED_ACCOUNTS}
          onSubmitPost={handleSubmit}
          onPublishNow={(id) =>
            setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p)))
          }
          onDeletePost={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          uploadMedia={uploadMedia}
          connectionsSlot={<SocialConnectionsManager tenantId="dev" environment="dev" />}
        />
      </div>
    </div>
  );
}
