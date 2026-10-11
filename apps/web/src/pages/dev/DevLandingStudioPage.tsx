/**
 * DEV-ONLY harness for the Landing Studio — no Supabase session or saved page.
 * Mounted at /dev/landing-studio when import.meta.env.DEV (see App.tsx).
 */
import { useState } from 'react';
import { LandingStudio } from '@/components/landing-pages/studio/LandingStudio';
import { createLandingSection, type LandingContent, type MarbeeLandingPage } from '@/lib/landing-pages';

function seed(): LandingContent {
  const navbar = createLandingSection('navbar');
  const hero = createLandingSection('hero');
  hero.props = {
    ...hero.props,
    headline: 'Ship landing pages in minutes',
    subheadline: 'Select this text and edit it right on the canvas. Everything should just work.',
    ctaLabel: 'Start free',
    ctaUrl: '#',
    layout: 'split',
  } as typeof hero.props;
  const logos = createLandingSection('logos');
  const features = createLandingSection('features');
  const stats = createLandingSection('stats');
  const testimonials = createLandingSection('testimonials');
  const pricing = createLandingSection('pricing');
  const faq = createLandingSection('faq');
  const container = createLandingSection('container');
  const cImg = createLandingSection('image');
  const cText = createLandingSection('text');
  (container.props as { children: unknown[] }).children = [cText, cImg];
  const cta = createLandingSection('cta');
  const footer = createLandingSection('footer');

  return {
    mode: 'blocks',
    sections: [navbar, hero, logos, features, stats, container, testimonials, pricing, faq, cta, footer],
    theme: { primaryColor: '#4f46e5', background: '#ffffff', preset: 'indigo', radius: 'md', headingFont: 'sans', sectionSpacing: 'normal' },
  };
}

export function DevLandingStudioPage() {
  const [content, setContent] = useState<LandingContent>(seed);
  const [name, setName] = useState('Dev Harness Page');

  const page: MarbeeLandingPage = {
    id: 'dev-harness',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    environment: 'production',
    name,
    slug: 'dev-harness',
    content,
    seo: { title: name, description: '' },
    status: 'draft',
    published_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <LandingStudio
        page={page}
        tenantId={page.tenant_id}
        environment={page.environment}
        formOptions={[
          { slug: 'contact', name: 'Contact form' },
          { slug: 'newsletter', name: 'Newsletter signup' },
        ]}
        onChange={setContent}
        onRename={setName}
        onSave={() => console.info('[dev] save', content)}
        onPublish={(p) => console.info('[dev] publish', p)}
        dirty
        onBack={() => (window.location.href = '/')}
        settingsContent={
          <div className="space-y-2 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">Settings drawer</p>
            <p>In the real app this hosts SEO, Publish, Schedule &amp; validity, and History.</p>
          </div>
        }
      />
    </div>
  );
}
