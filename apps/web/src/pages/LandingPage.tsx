import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight,
  BarChart3,
  Database,
  FileInput,
  GitBranch,
  Sparkles,
  Users,
  Zap,
  Radio,
  Shield,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingLogos } from '@/components/landing/LandingLogos';
import { LandingPricing } from '@/components/landing/LandingPricing';
import { LandingThemeProvider, useLandingTheme } from '@/components/landing/LandingThemeContext';

const FEATURES = [
  {
    icon: Users,
    title: 'Customer 360',
    description: 'Unified profiles, identity resolution, and a full engagement timeline in one view.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: GitBranch,
    title: 'Journey automation',
    description: 'Visual canvas to orchestrate multi-step journeys with conditions, waits, and versioning.',
    color: 'from-brand-500 to-indigo-600',
  },
  {
    icon: Zap,
    title: 'Real-time messaging',
    description: 'Trigger web push and transactional messages the moment events happen — not hours later.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    icon: Database,
    title: 'Data platform',
    description: 'Custom schemas, connectors, and data jobs that feed every audience and journey.',
    color: 'from-cyan-500 to-teal-600',
  },
  {
    icon: FileInput,
    title: 'Forms & content',
    description: 'AI-powered form builder, asset library with CDN publish, and embed-ready experiences.',
    color: 'from-pink-500 to-rose-600',
  },
  {
    icon: BarChart3,
    title: 'Pulse',
    description: 'Live delivery, engagement, and conversion metrics across channels and journeys.',
    color: 'from-emerald-500 to-green-600',
  },
];

const ENGINE_STEPS = [
  { label: 'Connect', desc: 'Events, schemas, connectors' },
  { label: 'Understand', desc: 'Profiles & segments' },
  { label: 'Decide', desc: 'Rules & triggers' },
  { label: 'Orchestrate', desc: 'Journeys & workflows' },
  { label: 'Engage', desc: 'Push, forms, content' },
  { label: 'Measure', desc: 'Analytics & attribution' },
];

const STATS = [
  { value: '360°', label: 'Customer view' },
  { value: 'Real-time', label: 'Event triggers' },
  { value: 'Multi-tenant', label: 'Enterprise ready' },
  { value: 'AI-native', label: 'Forms & insights' },
];

function LandingPageContent() {
  const { styles } = useLandingTheme();

  return (
    <div className={`min-h-screen transition-colors duration-300 ${styles.page}`}>
      <LandingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute -left-32 top-0 h-[500px] w-[500px] rounded-full blur-[120px] ${styles.heroGlow1}`} />
          <div className={`absolute -right-32 top-32 h-[400px] w-[400px] rounded-full blur-[100px] ${styles.heroGlow2}`} />
          <div className={`absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full blur-[80px] ${styles.heroGlow3}`} />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className={`mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm backdrop-blur-sm ${styles.badge}`}>
              <Sparkles className={`h-4 w-4 ${styles.badgeIcon}`} />
              Customer Engagement Platform
            </div>

            <h1 className="text-4xl font-bold tracking-tight md:text-6xl md:leading-[1.1]">
              Engage every customer.{' '}
              <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-accent-400 bg-clip-text text-transparent">
                Orchestrate every journey.
              </span>
            </h1>

            <p className={`mx-auto mt-6 max-w-2xl text-lg md:text-xl ${styles.subtitle}`}>
              Marbee connects your data, journeys, and channels — from real-time events and web push
              to AI-powered forms and customer 360.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/login?signup=1">
                <Button size="lg" className="gap-2 px-8 shadow-lg shadow-brand-600/30">
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary" className={`px-8 ${styles.secondaryBtn}`}>
                  Sign in to dashboard
                </Button>
              </Link>
            </div>
          </div>

          {/* Dashboard preview mock */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className={`rounded-2xl border p-1 shadow-2xl backdrop-blur-sm ${styles.previewShell}`}>
              <div className={`flex items-center gap-2 border-b px-4 py-3 ${styles.previewBar}`}>
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className={`ml-2 text-xs ${styles.previewLabel}`}>Pulse</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                {['Messages sent', 'Delivered', 'Engaged', 'Conversions'].map((label) => (
                  <div key={label} className={`rounded-xl border p-4 ${styles.previewCard}`}>
                    <p className={`text-xs ${styles.previewLabel}`}>{label}</p>
                    <p className={`mt-1 text-2xl font-bold ${styles.previewValue}`}>
                      {label === 'Conversions' ? '12.4%' : '24.8k'}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 p-4 pt-0 md:grid-cols-2">
                <div className={`rounded-xl border p-4 ${styles.previewPanel}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${styles.platformList}`}>
                    <GitBranch className="h-4 w-4 text-brand-500" />
                    Active journeys
                  </div>
                  <div className="mt-3 space-y-2">
                    {['Cart recovery', 'Welcome series', 'Re-engagement'].map((j) => (
                      <div key={j} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${styles.previewRow}`}>
                        <span>{j}</span>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-500">Live</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${styles.previewPanel}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${styles.platformList}`}>
                    <Radio className="h-4 w-4 text-amber-500" />
                    Real-time triggers
                  </div>
                  <div className="mt-3 space-y-2">
                    {['cart_abandoned', 'order_shipped', 'signup_complete'].map((e) => (
                      <div key={e} className={`rounded-lg px-3 py-2 font-mono text-xs ${styles.previewMono}`}>
                        {e}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingLogos />

      {/* Stats strip */}
      <section className={`border-y ${styles.statsStrip}`}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-12 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={`text-2xl font-bold md:text-3xl ${styles.statValue}`}>{stat.value}</p>
              <p className={`mt-1 text-sm ${styles.statLabel}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Everything you need to engage at scale</h2>
            <p className={`mt-4 ${styles.sectionSubtitle}`}>
              One platform to collect data, understand customers, orchestrate journeys, and activate every channel.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={`group rounded-2xl border p-6 transition ${styles.featureCard}`}
              >
                <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.color} p-3 shadow-lg`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className={`text-lg font-semibold ${styles.featureTitle}`}>{feature.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${styles.featureDesc}`}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform flow */}
      <section id="platform" className={`border-t py-24 ${styles.platformSection}`}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${styles.platformBadge}`}>
                <Layers className="h-4 w-4" />
                Platform architecture
              </div>
              <h2 className="mt-4 text-3xl font-bold md:text-4xl">
                Data → Audience → Journey → Channel
              </h2>
              <p className={`mt-4 ${styles.sectionSubtitle}`}>
                Marbee is built on five core engines. Connect your data once, then orchestrate
                real-time and batch engagement across every touchpoint — with enterprise multi-tenancy
                and environment isolation built in.
              </p>
              <ul className="mt-6 space-y-3">
                {['Supabase-native backend with RLS', 'Channel-agnostic BYOP architecture', 'Embedded AI across content & insights'].map((item) => (
                  <li key={item} className={`flex items-center gap-3 text-sm ${styles.platformList}`}>
                    <Shield className={`h-4 w-4 shrink-0 ${styles.checkIcon}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`rounded-2xl border p-6 ${styles.engineShell}`}>
              <div className="space-y-3">
                {ENGINE_STEPS.map((step, i) => (
                  <div key={step.label} className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${styles.engineStepNum}`}>
                      {i + 1}
                    </div>
                    <div className={`flex-1 rounded-xl border px-4 py-3 ${styles.engineStepCard}`}>
                      <p className={`font-medium ${styles.engineStepTitle}`}>{step.label}</p>
                      <p className={`text-xs ${styles.engineStepDesc}`}>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingPricing />

      {/* CTA */}
      <section id="cta" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className={`relative overflow-hidden rounded-3xl border px-8 py-16 text-center md:px-16 ${styles.ctaShell}`}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-[80px]" />
            <div className="relative">
              <h2 className="text-3xl font-bold md:text-4xl">Ready to orchestrate customer engagement?</h2>
              <p className={`mx-auto mt-4 max-w-xl ${styles.ctaSubtitle}`}>
                Create your account in minutes. Connect events, build journeys, and start engaging customers today.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link to="/login?signup=1">
                  <Button size="lg" className="gap-2 px-8">
                    Create free account
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="secondary" className={`px-8 ${styles.ctaSecondaryBtn}`}>
                    I already have an account
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

export function LandingPage() {
  const { session, loading } = useAuth();

  if (!loading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <LandingThemeProvider>
      <LandingPageContent />
    </LandingThemeProvider>
  );
}
