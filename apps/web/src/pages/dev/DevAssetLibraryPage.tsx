/**
 * DEV-ONLY harness for iterating on the revamped Asset Library without a
 * Supabase session. Mounted at /dev/asset-library (see App.tsx, DEV only).
 */
import type { MarbeeAsset } from '@/lib/assets';
import type { AssetFolder } from '@/lib/asset-folders';
import { AssetLibraryPage } from '@/pages/content/AssetLibraryPage';

const now = Date.now();
const iso = (daysFromNow: number) => new Date(now + daysFromNow * 86_400_000).toISOString();

function asset(partial: Partial<MarbeeAsset> & Pick<MarbeeAsset, 'id' | 'name' | 'mime_type'>): MarbeeAsset {
  return {
    tenant_id: 'demo',
    environment: 'production',
    file_path: `${partial.folder ?? '/'}/${partial.name}`,
    file_size: 84_000,
    public_url: null,
    folder: '/',
    metadata: { status: 'draft' },
    created_at: iso(-5),
    updated_at: iso(-1),
    ...partial,
  };
}

const DEMO_ASSETS: MarbeeAsset[] = [
  asset({
    id: 'a1',
    name: 'summer-sale-hero.jpg',
    mime_type: 'image/jpeg',
    folder: '/',
    file_size: 412_000,
    public_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'published' },
    created_at: iso(-14),
  }),
  asset({
    id: 'a2',
    name: 'brand-logo-mark.png',
    mime_type: 'image/png',
    folder: '/',
    file_size: 22_000,
    public_url: 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'published' },
  }),
  asset({
    id: 'a3',
    name: 'holiday-promo.png',
    mime_type: 'image/png',
    folder: '/',
    public_url: 'https://images.unsplash.com/photo-1512909006721-3d6018887383?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'draft', valid_from: iso(30) },
  }),
  asset({
    id: 'a4',
    name: 'expired-banner.jpg',
    mime_type: 'image/jpeg',
    folder: '/',
    public_url: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'published', valid_until: iso(-2) },
  }),
  asset({
    id: 'a5',
    name: 'product-demo.mp4',
    mime_type: 'video/mp4',
    folder: '/',
    file_size: 4_800_000,
    metadata: { status: 'draft' },
  }),
  asset({
    id: 'a6',
    name: 'terms-and-conditions.pdf',
    mime_type: 'application/pdf',
    folder: '/',
    file_size: 128_000,
    metadata: { status: 'draft' },
  }),
  asset({
    id: 'a7',
    name: 'instagram-story-1.jpg',
    mime_type: 'image/jpeg',
    folder: '/Social',
    public_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'published' },
  }),
  asset({
    id: 'a8',
    name: 'instagram-story-2.jpg',
    mime_type: 'image/jpeg',
    folder: '/Social',
    public_url: 'https://images.unsplash.com/photo-1600180758890-6b94519a8ba6?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'draft' },
  }),
  asset({
    id: 'a9',
    name: 'welcome-email-header.png',
    mime_type: 'image/png',
    folder: '/Templates',
    public_url: 'https://images.unsplash.com/photo-1557821552-17105176677c?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'published' },
  }),
  asset({
    id: 'a10',
    name: 'q4-lineup.jpg',
    mime_type: 'image/jpeg',
    folder: '/Product Launch',
    public_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&auto=format&fit=crop&q=80',
    metadata: { status: 'draft' },
  }),
];

const DEMO_FOLDERS: AssetFolder[] = [
  {
    id: 'f1',
    tenant_id: 'demo',
    environment: 'production',
    path: '/Product Launch',
    name: 'Product Launch',
    parent_path: '/',
    created_at: iso(-20),
  },
];

export function DevAssetLibraryPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1400px]">
        <AssetLibraryPage demo={{ assets: DEMO_ASSETS, folders: DEMO_FOLDERS }} />
      </div>
    </div>
  );
}
