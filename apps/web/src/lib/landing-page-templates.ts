import { createLandingSection, type LandingContent, type LandingSectionType, type LandingTheme } from './landing-pages';

export type OOTBTemplateCategory = 'Lifecycle' | 'Marketing' | 'Events' | 'Launch';

export type OOTBLandingPageTemplate = {
  id: string;
  name: string;
  description: string;
  category: OOTBTemplateCategory;
  icon:
    | 'MailMinus'
    | 'CheckCircle'
    | 'Settings2'
    | 'MessageSquare'
    | 'Rocket'
    | 'CalendarClock'
    | 'Hourglass'
    | 'Briefcase'
    | 'Megaphone';
  content: LandingContent;
};

/** Build a LandingContent from an ordered list of block types + per-block overrides. */
function build(
  blocks: Array<LandingSectionType | [LandingSectionType, Record<string, unknown>]>,
  theme: LandingTheme,
): LandingContent {
  return {
    mode: 'blocks',
    sections: blocks.map((b) => {
      const [type, overrides] = Array.isArray(b) ? b : [b, undefined];
      const section = createLandingSection(type);
      if (overrides) section.props = { ...(section.props as object), ...overrides } as typeof section.props;
      return section;
    }),
    theme,
  };
}

export const OOTB_LANDING_PAGE_TEMPLATES: OOTBLandingPageTemplate[] = [
  // ---- Lifecycle (kept from v1) ----------------------------------------
  {
    id: 'single-optout',
    name: 'Unsubscribe (single click)',
    description: 'Confirms the user has been unsubscribed immediately.',
    category: 'Lifecycle',
    icon: 'CheckCircle',
    content: build(
      [
        [
          'hero',
          {
            headline: 'You have been unsubscribed.',
            subheadline: "We're sorry to see you go. You will no longer receive marketing emails from us.",
            ctaLabel: 'Return to homepage',
            ctaUrl: '/',
            layout: 'center',
            backgroundGradient: 'subtle',
            animateIn: true,
          },
        ],
      ],
      { primaryColor: '#0f172a', background: '#ffffff', fontFamily: 'sans', buttonRadius: 'md' },
    ),
  },
  {
    id: 'double-optout',
    name: 'Unsubscribe (double opt-out)',
    description: 'Asks the user to confirm before unsubscribing.',
    category: 'Lifecycle',
    icon: 'MailMinus',
    content: build(
      [
        [
          'hero',
          {
            headline: 'Unsubscribe confirmation',
            subheadline: 'Are you sure you want to stop receiving our emails? Please confirm below.',
            ctaLabel: 'Yes, unsubscribe me',
            ctaUrl: '#',
            layout: 'center',
            animateIn: true,
          },
        ],
        ['text', { body: 'Changed your mind? Update your preferences any time in our Preference Center.', alignment: 'center' }],
      ],
      { primaryColor: '#ef4444', background: '#ffffff', fontFamily: 'sans', buttonRadius: 'md' },
    ),
  },
  {
    id: 'preference-center',
    name: 'Preference center',
    description: 'Let subscribers manage what they hear from you.',
    category: 'Lifecycle',
    icon: 'Settings2',
    content: build(
      [
        [
          'hero',
          {
            headline: 'Communication preferences',
            subheadline: 'Control what you hear from us. Manage subscriptions and frequency below.',
            ctaLabel: 'Manage below',
            ctaUrl: '#',
            layout: 'split',
            backgroundGradient: 'brand',
          },
        ],
        ['form', { headline: 'Your subscriptions', formSlug: '', layout: 'center' }],
      ],
      { primaryColor: '#3b82f6', background: '#ffffff', fontFamily: 'sans', buttonRadius: 'full' },
    ),
  },
  {
    id: 'customer-survey',
    name: 'Feedback survey',
    description: 'Collect customer feedback or NPS with a form.',
    category: 'Lifecycle',
    icon: 'MessageSquare',
    content: build(
      [
        [
          'form',
          {
            headline: 'We value your feedback',
            formSlug: '',
            layout: 'split',
            sideContent: 'Please take a moment to tell us about your experience.\n\nYour feedback helps us improve for everyone.',
          },
        ],
      ],
      { primaryColor: '#8b5cf6', background: '#ffffff', fontFamily: 'sans', buttonRadius: 'full' },
    ),
  },

  // ---- Marketing -----------------------------------------------------------
  {
    id: 'saas-product',
    name: 'SaaS product page',
    description: 'Navbar, hero, logos, features, stats, testimonials, pricing, FAQ, CTA, footer.',
    category: 'Marketing',
    icon: 'Rocket',
    content: build(
      [
        'navbar',
        ['hero', { headline: 'The all-in-one platform for modern teams', subheadline: 'Plan, build and ship — without the busywork.', ctaLabel: 'Start free', ctaUrl: '#', layout: 'split' }],
        'logos',
        'features',
        'stats',
        'testimonials',
        'pricing',
        'faq',
        ['cta', { headline: 'Ready to get started?', subheadline: 'Join thousands of teams already on board.', buttonLabel: 'Start free trial' }],
        'footer',
      ],
      { primaryColor: '#4f46e5', background: '#ffffff', preset: 'indigo', radius: 'md', headingFont: 'sans', sectionSpacing: 'normal' },
    ),
  },
  {
    id: 'lead-magnet',
    name: 'Lead magnet / ebook',
    description: 'Hero, benefits, testimonials and a download form.',
    category: 'Marketing',
    icon: 'Megaphone',
    content: build(
      [
        ['hero', { headline: 'The 2026 guide to growth', subheadline: 'A practical playbook, free to download.', ctaLabel: 'Get the guide', ctaUrl: '#form', layout: 'split' }],
        'features',
        'testimonials',
        ['form', { headline: 'Download the free guide', formSlug: '', layout: 'split', sideContent: 'Enter your details and we will email you the PDF right away.' }],
        'footer',
      ],
      { primaryColor: '#0ea5e9', background: '#ffffff', preset: 'slate', radius: 'sm', headingFont: 'sans' },
    ),
  },
  {
    id: 'agency-portfolio',
    name: 'Agency / studio',
    description: 'Portfolio-style page with a project gallery and testimonials.',
    category: 'Marketing',
    icon: 'Briefcase',
    content: build(
      [
        'navbar',
        ['hero', { headline: 'We design brands people remember', subheadline: 'A studio for ambitious founders.', ctaLabel: 'See our work', ctaUrl: '#work', layout: 'center' }],
        'logos',
        ['gallery', { title: 'Selected work', columns: 3 }],
        'testimonials',
        ['cta', { headline: 'Have a project in mind?', subheadline: 'Tell us about it.', buttonLabel: 'Start a conversation' }],
        'footer',
      ],
      { primaryColor: '#111827', accentColor: '#b45309', background: '#fdfcf9', preset: 'editorial', radius: 'none', headingFont: 'serif', fontFamily: 'serif', sectionSpacing: 'spacious' },
    ),
  },

  // ---- Events ------------------------------------------------------------
  {
    id: 'webinar-registration',
    name: 'Webinar registration',
    description: 'Hero, agenda, speakers, stats and a registration form.',
    category: 'Events',
    icon: 'CalendarClock',
    content: build(
      [
        'navbar',
        ['hero', { headline: 'Live webinar: scaling without breaking', subheadline: 'Join us on March 14 · 11am PT', ctaLabel: 'Save my seat', ctaUrl: '#register', layout: 'split' }],
        'stats',
        ['features', { title: "What you'll learn" }],
        'testimonials',
        ['form', { headline: 'Register free', formSlug: '', layout: 'split', sideContent: 'Seats are limited. Register now and we will send a calendar invite.' }],
        'faq',
        'footer',
      ],
      { primaryColor: '#7c3aed', background: '#ffffff', preset: 'indigo', radius: 'lg', headingFont: 'sans' },
    ),
  },

  // ---- Launch ---------------------------------------------------------------
  {
    id: 'waitlist',
    name: 'Waitlist / coming soon',
    description: 'Hero, benefits, a countdown and an email capture form.',
    category: 'Launch',
    icon: 'Hourglass',
    content: build(
      [
        ['hero', { headline: 'Something new is coming', subheadline: 'Be the first to know when we launch.', ctaLabel: 'Join the waitlist', ctaUrl: '#form', layout: 'center' }],
        'features',
        ['countdown', { title: 'Launching in' }],
        ['form', { headline: 'Get early access', formSlug: '', layout: 'center' }],
        'footer',
      ],
      { primaryColor: '#e11d48', background: '#fff1f2', preset: 'rose', radius: 'xl', headingFont: 'sans' },
    ),
  },
  {
    id: 'promo-sale',
    name: 'Promo / sale',
    description: 'Urgency-driven page with a countdown and pricing.',
    category: 'Launch',
    icon: 'Hourglass',
    content: build(
      [
        'navbar',
        ['hero', { headline: 'Black Friday: 50% off everything', subheadline: 'This week only.', ctaLabel: 'Claim the deal', ctaUrl: '#pricing', layout: 'center', backgroundGradient: 'brand' }],
        ['countdown', { title: 'Offer ends in' }],
        'pricing',
        'testimonials',
        'faq',
        ['cta', { headline: "Don't miss out", subheadline: 'Prices go back up Monday.', buttonLabel: 'Buy now' }],
        'footer',
      ],
      { primaryColor: '#059669', background: '#ffffff', preset: 'emerald', radius: 'lg', headingFont: 'sans' },
    ),
  },
];

export const OOTB_TEMPLATE_CATEGORIES: OOTBTemplateCategory[] = ['Marketing', 'Events', 'Launch', 'Lifecycle'];
