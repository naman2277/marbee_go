import { supabase } from './supabase';
import { toSchemaSlug } from './schema-slug';
import { logAudit, diffChanges } from './audit';

export type LandingSectionType =
  // legacy (v1) — rendering unchanged
  | 'hero'
  | 'text'
  | 'cta'
  | 'form'
  | 'image'
  | 'features'
  | 'html'
  // v2 — modern marketing blocks
  | 'navbar'
  | 'footer'
  | 'testimonials'
  | 'logos'
  | 'pricing'
  | 'faq'
  | 'stats'
  | 'gallery'
  | 'video'
  | 'divider'
  | 'spacer'
  | 'countdown'
  // v2 — layout primitive (nestable)
  | 'container';

export type LandingHtmlProps = {
  htmlCode: string;
};

/** Shared per-block layout controls (all optional, honoured by the v2 renderer). */
export type LandingBlockLayout = {
  anchorId?: string;
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  paddingY?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  background?: string;
};

export type LandingHeroProps = {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl?: string;
  layout?: 'center' | 'split';
  imagePosition?: 'left' | 'right';
  backgroundGradient?: 'none' | 'brand' | 'subtle';
  animateIn?: boolean;
};

export type LandingTextProps = {
  body: string;
  alignment?: 'left' | 'center' | 'right';
};

export type LandingCtaProps = {
  headline: string;
  subheadline?: string;
  buttonLabel: string;
  buttonUrl: string;
  layout?: 'center' | 'split';
  backgroundGradient?: 'none' | 'brand' | 'subtle';
};

export type LandingFormProps = {
  headline: string;
  formSlug: string;
  layout?: 'center' | 'split';
  sideContent?: string;
};

export type LandingImageProps = {
  url: string;
  alt: string;
  caption?: string;
  rounded?: 'none' | 'md' | 'xl' | 'full';
};

export type LandingFeatureItem = {
  title: string;
  description: string;
  icon?: string;
};

export type LandingFeaturesProps = {
  title: string;
  items: LandingFeatureItem[];
  columns?: 2 | 3 | 4;
};

// --- v2 block props -------------------------------------------------------

export type LandingNavLink = { label: string; url: string };

export type LandingNavbarProps = LandingBlockLayout & {
  logoText: string;
  logoUrl?: string;
  links: LandingNavLink[];
  ctaLabel?: string;
  ctaUrl?: string;
  sticky?: boolean;
};

export type LandingFooterColumn = { title: string; links: LandingNavLink[] };

export type LandingFooterProps = LandingBlockLayout & {
  companyName: string;
  tagline?: string;
  columns: LandingFooterColumn[];
  socialLinks?: LandingNavLink[];
  legalText?: string;
};

export type LandingTestimonialItem = {
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
  rating?: number;
};

export type LandingTestimonialsProps = LandingBlockLayout & {
  title?: string;
  items: LandingTestimonialItem[];
  layout?: 'grid' | 'single';
  columns?: 2 | 3;
};

export type LandingLogosProps = LandingBlockLayout & {
  title?: string;
  items: Array<{ name: string; imageUrl?: string }>;
  grayscale?: boolean;
};

export type LandingPricingTier = {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  ctaLabel: string;
  ctaUrl: string;
  highlighted?: boolean;
};

export type LandingPricingProps = LandingBlockLayout & {
  title?: string;
  subtitle?: string;
  tiers: LandingPricingTier[];
  columns?: 2 | 3 | 4;
};

export type LandingFaqProps = LandingBlockLayout & {
  title?: string;
  items: Array<{ question: string; answer: string }>;
  layout?: 'accordion' | 'grid';
};

export type LandingStatsProps = LandingBlockLayout & {
  title?: string;
  items: Array<{ value: string; label: string; description?: string }>;
  columns?: 2 | 3 | 4;
};

export type LandingGalleryProps = LandingBlockLayout & {
  title?: string;
  images: Array<{ url: string; alt: string; caption?: string }>;
  columns?: 2 | 3 | 4;
  rounded?: 'none' | 'md' | 'xl';
};

export type LandingVideoProps = LandingBlockLayout & {
  title?: string;
  url: string;
  provider?: 'auto' | 'youtube' | 'vimeo' | 'mp4';
  aspectRatio?: '16:9' | '4:3' | '1:1';
  caption?: string;
};

export type LandingDividerProps = LandingBlockLayout & {
  style?: 'solid' | 'dashed' | 'dotted';
  thickness?: number;
  color?: string;
  width?: 'full' | 'narrow';
};

export type LandingSpacerProps = LandingBlockLayout & {
  height: number;
};

export type LandingCountdownProps = LandingBlockLayout & {
  title?: string;
  targetDate: string;
  expiredText?: string;
  layout?: 'boxes' | 'inline';
};

export type LandingContainerProps = LandingBlockLayout & {
  children: LandingSection[];
  columns: 1 | 2 | 3 | 4;
  gap?: number;
  align?: 'top' | 'center' | 'bottom';
};

export type LandingSection =
  | { id: string; type: 'hero'; props: LandingHeroProps }
  | { id: string; type: 'text'; props: LandingTextProps }
  | { id: string; type: 'cta'; props: LandingCtaProps }
  | { id: string; type: 'form'; props: LandingFormProps }
  | { id: string; type: 'image'; props: LandingImageProps }
  | { id: string; type: 'features'; props: LandingFeaturesProps }
  | { id: string; type: 'html'; props: LandingHtmlProps }
  | { id: string; type: 'navbar'; props: LandingNavbarProps }
  | { id: string; type: 'footer'; props: LandingFooterProps }
  | { id: string; type: 'testimonials'; props: LandingTestimonialsProps }
  | { id: string; type: 'logos'; props: LandingLogosProps }
  | { id: string; type: 'pricing'; props: LandingPricingProps }
  | { id: string; type: 'faq'; props: LandingFaqProps }
  | { id: string; type: 'stats'; props: LandingStatsProps }
  | { id: string; type: 'gallery'; props: LandingGalleryProps }
  | { id: string; type: 'video'; props: LandingVideoProps }
  | { id: string; type: 'divider'; props: LandingDividerProps }
  | { id: string; type: 'spacer'; props: LandingSpacerProps }
  | { id: string; type: 'countdown'; props: LandingCountdownProps }
  | { id: string; type: 'container'; props: LandingContainerProps };

export type LandingFallback = {
  type?: 'default' | 'message' | 'redirect' | 'custom_html';
  title?: string;
  message?: string;
  redirectUrl?: string;
  customHtml?: string;
};

export type LandingContent = {
  mode?: 'blocks' | 'html';
  html?: string;
  sections: LandingSection[];
  // Validity window (stored in content JSON so no extra DB columns needed)
  valid_from?: string | null;
  valid_until?: string | null;
  // Secure public token for encrypted URL access
  public_token?: string;
  // Custom fallback behavior when page is not yet active or expired
  fallback?: LandingFallback;
  theme?: LandingTheme;
};

export type LandingTheme = {
  primaryColor?: string;
  background?: string;
  fontFamily?: 'sans' | 'serif' | 'mono';
  buttonRadius?: 'none' | 'md' | 'full';
  customCss?: string;
  // v2 additions — all optional; omitted values fall back to the v1 look
  preset?: string;
  accentColor?: string;
  textColor?: string;
  headingFont?: 'sans' | 'serif' | 'mono' | 'display';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  contentWidth?: 'narrow' | 'normal' | 'wide' | 'full';
  sectionSpacing?: 'compact' | 'normal' | 'spacious';
};

export type LandingSeo = {
  title?: string;
  description?: string;
  og_image?: string;
};

export type MarbeeLandingPage = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  content: LandingContent;
  seo: LandingSeo;
  status: 'draft' | 'published' | string;
  published_url: string | null;
  created_at: string;
  updated_at: string;
};

export const LANDING_SECTION_TYPES: Array<{ value: LandingSectionType; label: string }> = [
  { value: 'hero', label: 'Hero' },
  { value: 'text', label: 'Text' },
  { value: 'features', label: 'Features' },
  { value: 'cta', label: 'Call to action' },
  { value: 'form', label: 'Form embed' },
  { value: 'image', label: 'Image' },
];

export function createDefaultContent(name: string): LandingContent {
  return {
    sections: [
      {
        id: crypto.randomUUID(),
        type: 'hero',
        props: {
          headline: name,
          subheadline: 'Tell your story and convert visitors into customers.',
          ctaLabel: 'Get started',
          ctaUrl: '#',
        },
      },
      {
        id: crypto.randomUUID(),
        type: 'features',
        props: {
          title: 'Why choose us',
          items: [
            { title: 'Fast setup', description: 'Launch in minutes with ready-made sections.' },
            { title: 'Built for growth', description: 'Connect forms, events, and journeys.' },
            { title: 'Enterprise ready', description: 'Multi-tenant with dev, staging, and prod.' },
          ],
        },
      },
      {
        id: crypto.randomUUID(),
        type: 'cta',
        props: {
          headline: 'Ready to get started?',
          subheadline: 'Create your free account today.',
          buttonLabel: 'Sign up free',
          buttonUrl: '/login?signup=1',
        },
      },
    ],
    theme: { primaryColor: '#4f46e5', background: '#ffffff' },
  };
}

export function createLandingSection(type: LandingSectionType): LandingSection {
  const id = crypto.randomUUID();
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        props: {
          headline: 'Hero headline',
          subheadline: 'A short description goes here.',
          ctaLabel: 'Click me',
          ctaUrl: '#',
          layout: 'center',
          backgroundGradient: 'none',
        },
      };
    case 'text':
      return { id, type, props: { body: 'Start typing your content here…', alignment: 'left' } };
    case 'cta':
      return {
        id,
        type,
        props: {
          headline: 'Ready to dive in?',
          buttonLabel: 'Get started',
          buttonUrl: '#',
          layout: 'center',
        },
      };
    case 'form':
      return { id, type, props: { headline: 'Contact us', formSlug: '', layout: 'center' } };
    case 'image':
      return { id, type, props: { url: '', alt: 'Image description', rounded: 'md' } };
    case 'features':
      return {
        id,
        type,
        props: {
          title: 'Features',
          columns: 3,
          items: [
            { title: 'Feature 1', description: 'Description 1' },
            { title: 'Feature 2', description: 'Description 2' },
            { title: 'Feature 3', description: 'Description 3' },
          ],
        },
      };
    case 'html':
      return { id, type, props: { htmlCode: '<!-- Your custom HTML goes here -->\n<div class="p-4 bg-slate-100 rounded-lg text-center">\n  <h2 class="text-xl font-bold">Custom Block</h2>\n</div>' } };
    case 'navbar':
      return {
        id,
        type,
        props: {
          logoText: 'Acme',
          links: [
            { label: 'Features', url: '#features' },
            { label: 'Pricing', url: '#pricing' },
            { label: 'FAQ', url: '#faq' },
          ],
          ctaLabel: 'Get started',
          ctaUrl: '#',
          sticky: true,
        },
      };
    case 'footer':
      return {
        id,
        type,
        props: {
          companyName: 'Acme Inc.',
          tagline: 'Building the future, one release at a time.',
          columns: [
            { title: 'Product', links: [{ label: 'Features', url: '#' }, { label: 'Pricing', url: '#' }] },
            { title: 'Company', links: [{ label: 'About', url: '#' }, { label: 'Careers', url: '#' }] },
            { title: 'Legal', links: [{ label: 'Privacy', url: '#' }, { label: 'Terms', url: '#' }] },
          ],
          socialLinks: [
            { label: 'Twitter', url: '#' },
            { label: 'LinkedIn', url: '#' },
          ],
          legalText: `© ${new Date().getFullYear()} Acme Inc. All rights reserved.`,
        },
      };
    case 'testimonials':
      return {
        id,
        type,
        props: {
          title: 'Loved by teams everywhere',
          layout: 'grid',
          columns: 3,
          items: [
            { quote: 'This completely changed how we work. Setup took minutes.', author: 'Jordan Lee', role: 'Head of Growth, Northwind', rating: 5 },
            { quote: 'The best tool in its category. We rely on it every day.', author: 'Sam Rivera', role: 'Founder, Loop', rating: 5 },
            { quote: 'Support is fantastic and the product keeps getting better.', author: 'Priya Nair', role: 'PM, Contoso', rating: 5 },
          ],
        },
      };
    case 'logos':
      return {
        id,
        type,
        props: {
          title: 'Trusted by fast-growing companies',
          grayscale: true,
          items: [
            { name: 'Northwind' },
            { name: 'Contoso' },
            { name: 'Loop' },
            { name: 'Fabrikam' },
            { name: 'Globex' },
          ],
        },
      };
    case 'pricing':
      return {
        id,
        type,
        props: {
          title: 'Simple, transparent pricing',
          subtitle: 'Start free. Upgrade when you are ready.',
          columns: 3,
          tiers: [
            { name: 'Starter', price: '$0', period: '/mo', description: 'For individuals getting started', features: ['1 project', 'Community support', 'Basic analytics'], ctaLabel: 'Get started', ctaUrl: '#' },
            { name: 'Pro', price: '$29', period: '/mo', description: 'For growing teams', features: ['Unlimited projects', 'Priority support', 'Advanced analytics', 'Custom domains'], ctaLabel: 'Start free trial', ctaUrl: '#', highlighted: true },
            { name: 'Enterprise', price: 'Custom', description: 'For large organizations', features: ['SSO & SAML', 'Dedicated support', 'SLA', 'Security review'], ctaLabel: 'Contact sales', ctaUrl: '#' },
          ],
        },
      };
    case 'faq':
      return {
        id,
        type,
        props: {
          title: 'Frequently asked questions',
          layout: 'accordion',
          items: [
            { question: 'Can I change plans later?', answer: 'Yes — upgrade or downgrade at any time from your account settings.' },
            { question: 'Is there a free trial?', answer: 'Every paid plan comes with a 14-day free trial. No credit card required.' },
            { question: 'How does billing work?', answer: 'Plans are billed monthly or annually. Cancel anytime.' },
          ],
        },
      };
    case 'stats':
      return {
        id,
        type,
        props: {
          title: 'By the numbers',
          columns: 3,
          items: [
            { value: '10k+', label: 'Active teams' },
            { value: '99.99%', label: 'Uptime' },
            { value: '4.9/5', label: 'Average rating' },
          ],
        },
      };
    case 'gallery':
      return {
        id,
        type,
        props: {
          title: 'Gallery',
          columns: 3,
          rounded: 'md',
          images: [
            { url: '', alt: 'Screenshot 1' },
            { url: '', alt: 'Screenshot 2' },
            { url: '', alt: 'Screenshot 3' },
          ],
        },
      };
    case 'video':
      return {
        id,
        type,
        props: { url: '', provider: 'auto', aspectRatio: '16:9' },
      };
    case 'divider':
      return { id, type, props: { style: 'solid', thickness: 1, width: 'full' } };
    case 'spacer':
      return { id, type, props: { height: 48 } };
    case 'countdown':
      return {
        id,
        type,
        props: {
          title: 'Offer ends soon',
          targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          expiredText: 'This offer has ended.',
          layout: 'boxes',
        },
      };
    case 'container':
      return {
        id,
        type,
        props: { children: [], columns: 2, gap: 24, align: 'top', paddingY: 'md' },
      };
  }
}

function parseContent(raw: unknown): LandingContent {
  if (!raw || typeof raw !== 'object') return { sections: [] };
  const obj = raw as LandingContent;
  return {
    mode: obj.mode === 'html' ? 'html' : 'blocks',
    html: obj.html ?? '',
    sections: Array.isArray(obj.sections) ? obj.sections : [],
    valid_from: obj.valid_from ?? null,
    valid_until: obj.valid_until ?? null,
    public_token: obj.public_token,
    fallback: obj.fallback,
    theme: obj.theme,
  };
}

function parseSeo(raw: unknown): LandingSeo {
  if (!raw || typeof raw !== 'object') return {};
  return raw as LandingSeo;
}

function normalizeRow(row: Record<string, unknown>): MarbeeLandingPage {
  return {
    ...(row as unknown as MarbeeLandingPage),
    content: parseContent(row.content),
    seo: parseSeo(row.seo),
  };
}

export async function fetchLandingPages(
  tenantId: string,
  environment: string,
): Promise<MarbeeLandingPage[]> {
  const { data, error } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeRow);
}

export async function fetchLandingPageById(id: string): Promise<MarbeeLandingPage | null> {
  const { data, error } = await supabase.from('landing_pages').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export async function createLandingPage(
  tenantId: string,
  environment: string,
  name: string,
  initialContent?: LandingContent,
): Promise<{ page?: MarbeeLandingPage; error?: string }> {
  const slug = toSchemaSlug(name);
  if (!slug) return { error: 'Enter a valid page name' };

  const { data: existing } = await supabase
    .from('landing_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return { error: `Page slug "${slug}" already exists` };

  const content = initialContent ?? createDefaultContent(name.trim());
  const seo: LandingSeo = {
    title: name.trim(),
    description: content.sections.find((s) => s.type === 'hero')?.props.subheadline ?? '',
  };

  const { data, error } = await supabase
    .from('landing_pages')
    .insert({
      tenant_id: tenantId,
      environment,
      name: name.trim(),
      slug,
      content,
      seo,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) return { error: error.message };
  const page = normalizeRow(data);
  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'landing_page',
    resourceId: page.id,
    resourceName: page.name,
  });
  return { page };
}

export function diffLandingPageChanges(
  prev: MarbeeLandingPage,
  patch: Partial<Pick<MarbeeLandingPage, 'name' | 'content' | 'seo' | 'status' | 'published_url'>>,
): Array<{ field: string; from?: unknown; to?: unknown }> {
  const changes: Array<{ field: string; from?: unknown; to?: unknown }> = [];

  if (patch.name !== undefined && patch.name !== prev.name) {
    changes.push({ field: 'Name', from: prev.name, to: patch.name });
  }

  if (patch.status !== undefined && patch.status !== prev.status) {
    changes.push({ field: 'Status', from: prev.status, to: patch.status });
  }

  if (patch.seo) {
    if (patch.seo.title !== undefined && patch.seo.title !== prev.seo?.title) {
      changes.push({ field: 'SEO Title', from: prev.seo?.title || 'None', to: patch.seo.title || 'None' });
    }
    if (patch.seo.description !== undefined && patch.seo.description !== prev.seo?.description) {
      changes.push({ field: 'SEO Description', from: 'Old description', to: 'Updated' });
    }
  }

  if (patch.content) {
    const pc = patch.content;
    const oc = prev.content;

    if (pc.mode !== undefined && pc.mode !== oc.mode) {
      changes.push({ field: 'Editor Mode', from: oc.mode || 'blocks', to: pc.mode });
    }

    if (pc.html !== undefined && pc.html !== oc.html) {
      const prevLen = (oc.html || '').length;
      const newLen = (pc.html || '').length;
      changes.push({
        field: 'HTML Code',
        from: `${prevLen} chars`,
        to: `${newLen} chars (${newLen >= prevLen ? '+' : ''}${newLen - prevLen})`,
      });
    }

    if (pc.sections !== undefined && JSON.stringify(pc.sections) !== JSON.stringify(oc.sections)) {
      const prevTypes = oc.sections.map((s) => s.type).join(', ') || 'empty';
      const newTypes = pc.sections.map((s) => s.type).join(', ') || 'empty';
      changes.push({
        field: 'Sections',
        from: `${oc.sections.length} (${prevTypes})`,
        to: `${pc.sections.length} (${newTypes})`,
      });
    }

    if (pc.valid_from !== undefined && pc.valid_from !== oc.valid_from) {
      changes.push({
        field: 'Valid From',
        from: oc.valid_from ? new Date(oc.valid_from).toLocaleString() : 'None',
        to: pc.valid_from ? new Date(pc.valid_from).toLocaleString() : 'None',
      });
    }

    if (pc.valid_until !== undefined && pc.valid_until !== oc.valid_until) {
      changes.push({
        field: 'Expires On',
        from: oc.valid_until ? new Date(oc.valid_until).toLocaleString() : 'None',
        to: pc.valid_until ? new Date(pc.valid_until).toLocaleString() : 'None',
      });
    }

    if (pc.fallback && JSON.stringify(pc.fallback) !== JSON.stringify(oc.fallback)) {
      changes.push({
        field: 'Fallback Action',
        from: oc.fallback?.type || 'default',
        to: pc.fallback.type || 'default',
      });
    }

    if (pc.theme && JSON.stringify(pc.theme) !== JSON.stringify(oc.theme)) {
      changes.push({
        field: 'Theme',
        from: oc.theme?.primaryColor || 'default',
        to: pc.theme.primaryColor || 'default',
      });
    }
  }

  return changes;
}

export async function updateLandingPage(
  id: string,
  patch: Partial<Pick<MarbeeLandingPage, 'name' | 'content' | 'seo' | 'status' | 'published_url'>>,
): Promise<{ error?: string }> {
  const prev = await fetchLandingPageById(id);
  const { error } = await supabase
    .from('landing_pages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  if (prev) {
    const action = patch.status === 'published' ? 'publish' : patch.status === 'draft' ? 'unpublish' : 'update';
    const changes = diffLandingPageChanges(prev, patch);
    const summary = changes.map((c) => `${c.field}: ${c.to}`).join('; ') || undefined;

    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action,
      resourceType: 'landing_page',
      resourceId: id,
      resourceName: patch.name ?? prev.name,
      summary,
      changes,
    });
  }
  return {};
}

export async function publishLandingPage(
  id: string,
  publish: boolean,
  tenantId: string,
  environment: string,
  slug: string,
  existingContent: LandingContent,
): Promise<{ error?: string; publicUrl?: string }> {
  if (!publish) {
    const result = await updateLandingPage(id, { status: 'draft', published_url: null });
    return result;
  }

  // Generate a secure public_token if not already present
  const token = existingContent.public_token || crypto.randomUUID();
  const publicUrl = getLandingPagePublicUrl(token);

  const updatedContent: LandingContent = { ...existingContent, public_token: token };
  const result = await updateLandingPage(id, {
    status: 'published',
    published_url: publicUrl,
    content: updatedContent,
  });

  if (result.error) return result;
  return { publicUrl };
}

export function getLandingPagePublicUrl(
  token: string,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  return `${origin}/pages/${token}`;
}

export async function deleteLandingPage(id: string): Promise<{ error?: string }> {
  const prev = await fetchLandingPageById(id);
  const { error } = await supabase.from('landing_pages').delete().eq('id', id);
  if (error) return { error: error.message };
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'landing_page',
      resourceId: id,
      resourceName: prev.name,
    });
  }
  return {};
}




export function getLandingPageEmbedCode(publicUrl: string, height = 800): string {
  return `<iframe
  src="${publicUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border:0;"
  title="Marbee landing page"
></iframe>`;
}

export async function fetchPublicLandingPage(
  tokenOrSlug: string,
): Promise<MarbeeLandingPage | null> {
  // Query published page by content.public_token
  const { data: byToken } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('status', 'published')
    .filter('content->>public_token', 'eq', tokenOrSlug)
    .maybeSingle();

  if (byToken) return normalizeRow(byToken);

  // Fallback query by slug for backwards compatibility
  const { data: bySlug } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('status', 'published')
    .eq('slug', tokenOrSlug)
    .maybeSingle();

  if (bySlug) return normalizeRow(bySlug);

  return null;
}

export function moveSection(sections: LandingSection[], id: string, direction: 'up' | 'down'): LandingSection[] {
  const index = sections.findIndex((s) => s.id === id);
  if (index < 0) return sections;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type LandingPageEffectiveStatus = 'draft' | 'live' | 'scheduled' | 'expired';

export function getLandingPageEffectiveStatus(page: { status: string; content?: LandingContent }): {
  status: LandingPageEffectiveStatus;
  label: string;
  badgeVariant: 'default' | 'success' | 'warning' | 'error';
} {
  if (page.status !== 'published') {
    return { status: 'draft', label: 'Draft', badgeVariant: 'default' };
  }

  const now = new Date();
  const validFrom = page.content?.valid_from ? new Date(page.content.valid_from) : null;
  const validUntil = page.content?.valid_until ? new Date(page.content.valid_until) : null;

  if (validUntil && !isNaN(validUntil.getTime()) && now > validUntil) {
    return { status: 'expired', label: 'Expired', badgeVariant: 'error' };
  }

  if (validFrom && !isNaN(validFrom.getTime()) && now < validFrom) {
    return { status: 'scheduled', label: 'Scheduled', badgeVariant: 'warning' };
  }

  return { status: 'live', label: 'Live', badgeVariant: 'success' };
}

