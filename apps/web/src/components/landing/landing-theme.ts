export type LandingTheme = 'light' | 'dark';

const STORAGE_KEY = 'marbee-landing-theme';

export function loadLandingTheme(): LandingTheme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function saveLandingTheme(theme: LandingTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export type LandingStyles = {
  page: string;
  nav: string;
  navLink: string;
  navLinkHover: string;
  navBrand: string;
  ghostBtn: string;
  heroGlow1: string;
  heroGlow2: string;
  heroGlow3: string;
  badge: string;
  badgeIcon: string;
  subtitle: string;
  secondaryBtn: string;
  previewShell: string;
  previewBar: string;
  previewCard: string;
  previewLabel: string;
  previewValue: string;
  previewPanel: string;
  previewRow: string;
  previewMono: string;
  statsStrip: string;
  statValue: string;
  statLabel: string;
  sectionSubtitle: string;
  featureCard: string;
  featureTitle: string;
  featureDesc: string;
  platformSection: string;
  platformBadge: string;
  platformList: string;
  engineShell: string;
  engineStep: string;
  engineStepNum: string;
  engineStepCard: string;
  engineStepTitle: string;
  engineStepDesc: string;
  logosSection: string;
  logosLabel: string;
  logoTile: string;
  pricingSection: string;
  pricingCard: string;
  pricingCardFeatured: string;
  pricingMuted: string;
  ctaShell: string;
  ctaSubtitle: string;
  ctaSecondaryBtn: string;
  footer: string;
  footerBorder: string;
  footerBrand: string;
  footerText: string;
  footerLink: string;
  footerHeading: string;
  checkIcon: string;
};

export const LANDING_STYLES: Record<LandingTheme, LandingStyles> = {
  dark: {
    page: 'bg-slate-950 text-white',
    nav: 'border-white/10 bg-slate-950/80',
    navLink: 'text-slate-300',
    navLinkHover: 'hover:text-white',
    navBrand: 'text-white',
    ghostBtn: 'text-slate-300 hover:bg-white/10 hover:text-white',
    heroGlow1: 'bg-brand-600/20',
    heroGlow2: 'bg-accent-500/15',
    heroGlow3: 'bg-violet-600/10',
    badge: 'border-white/10 bg-white/5 text-slate-300',
    badgeIcon: 'text-amber-400',
    subtitle: 'text-slate-400',
    secondaryBtn: 'border-slate-700 bg-white/5 text-white hover:bg-white/10',
    previewShell: 'border-white/10 bg-slate-900/80 shadow-brand-900/40',
    previewBar: 'border-white/5',
    previewCard: 'border-white/5 bg-slate-800/50',
    previewLabel: 'text-slate-500',
    previewValue: 'text-white',
    previewPanel: 'border-white/5 bg-slate-800/30',
    previewRow: 'bg-slate-800/60 text-slate-300',
    previewMono: 'bg-slate-800/60 text-slate-400',
    statsStrip: 'border-white/5 bg-slate-900/50',
    statValue: 'text-white',
    statLabel: 'text-slate-400',
    sectionSubtitle: 'text-slate-400',
    featureCard: 'border-white/5 bg-slate-900/50 hover:border-white/10 hover:bg-slate-900/80',
    featureTitle: 'text-white',
    featureDesc: 'text-slate-400',
    platformSection: 'border-white/5 bg-slate-900/30',
    platformBadge: 'bg-brand-500/10 text-brand-300',
    platformList: 'text-slate-300',
    engineShell: 'border-white/5 bg-slate-950',
    engineStep: '',
    engineStepNum: 'bg-brand-600/20 text-brand-300',
    engineStepCard: 'border-white/5 bg-slate-900/80',
    engineStepTitle: 'text-white',
    engineStepDesc: 'text-slate-500',
    logosSection: 'border-y border-white/5 bg-slate-900/40',
    logosLabel: 'text-slate-500',
    logoTile: 'border-white/5 bg-white/5 text-slate-300',
    pricingSection: 'border-t border-white/5 bg-slate-900/20',
    pricingCard: 'border-white/5 bg-slate-900/50',
    pricingCardFeatured: 'border-brand-500/50 bg-gradient-to-b from-brand-600/10 to-slate-900/50 ring-1 ring-brand-500/30',
    pricingMuted: 'text-slate-400',
    ctaShell: 'border-white/10 bg-gradient-to-br from-brand-600/20 via-slate-900 to-accent-600/10',
    ctaSubtitle: 'text-slate-400',
    ctaSecondaryBtn: 'border-slate-600 bg-transparent text-white hover:bg-white/5',
    footer: 'border-slate-800 bg-slate-950',
    footerBorder: 'border-slate-800',
    footerBrand: 'text-white',
    footerText: 'text-slate-400',
    footerLink: 'hover:text-white',
    footerHeading: 'text-slate-500',
    checkIcon: 'text-accent-500',
  },
  light: {
    page: 'bg-gradient-to-br from-brand-50 via-white to-teal-50 text-slate-900',
    nav: 'border-slate-200/80 bg-white/80',
    navLink: 'text-slate-600',
    navLinkHover: 'hover:text-slate-900',
    navBrand: 'text-slate-900',
    ghostBtn: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    heroGlow1: 'bg-brand-400/25',
    heroGlow2: 'bg-accent-400/20',
    heroGlow3: 'bg-violet-400/15',
    badge: 'border-slate-200 bg-white text-slate-600 shadow-sm',
    badgeIcon: 'text-amber-500',
    subtitle: 'text-slate-600',
    secondaryBtn: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm',
    previewShell: 'border-slate-200 bg-white shadow-xl shadow-slate-200/60',
    previewBar: 'border-slate-100',
    previewCard: 'border-slate-100 bg-slate-50',
    previewLabel: 'text-slate-500',
    previewValue: 'text-slate-900',
    previewPanel: 'border-slate-100 bg-slate-50/80',
    previewRow: 'bg-white border border-slate-100 text-slate-700',
    previewMono: 'bg-slate-100 text-slate-600',
    statsStrip: 'border-slate-200 bg-white/70',
    statValue: 'text-slate-900',
    statLabel: 'text-slate-500',
    sectionSubtitle: 'text-slate-600',
    featureCard: 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-md shadow-sm',
    featureTitle: 'text-slate-900',
    featureDesc: 'text-slate-600',
    platformSection: 'border-slate-200 bg-white/60',
    platformBadge: 'bg-brand-100 text-brand-700',
    platformList: 'text-slate-700',
    engineShell: 'border-slate-200 bg-white shadow-sm',
    engineStep: '',
    engineStepNum: 'bg-brand-100 text-brand-700',
    engineStepCard: 'border-slate-100 bg-slate-50',
    engineStepTitle: 'text-slate-900',
    engineStepDesc: 'text-slate-500',
    logosSection: 'border-y border-slate-200 bg-white/50',
    logosLabel: 'text-slate-500',
    logoTile: 'border-slate-200 bg-white text-slate-600 shadow-sm',
    pricingSection: 'border-t border-slate-200 bg-white/40',
    pricingCard: 'border-slate-200 bg-white shadow-sm',
    pricingCardFeatured: 'border-brand-300 bg-gradient-to-b from-brand-50 to-white ring-2 ring-brand-500/20 shadow-lg',
    pricingMuted: 'text-slate-600',
    ctaShell: 'border-brand-200 bg-gradient-to-br from-brand-100 via-white to-teal-50 shadow-lg',
    ctaSubtitle: 'text-slate-600',
    ctaSecondaryBtn: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    footer: 'border-slate-200 bg-white',
    footerBorder: 'border-slate-200',
    footerBrand: 'text-slate-900',
    footerText: 'text-slate-600',
    footerLink: 'hover:text-brand-600',
    footerHeading: 'text-slate-400',
    checkIcon: 'text-accent-600',
  },
};
