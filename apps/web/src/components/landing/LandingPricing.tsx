import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui';
import { useLandingTheme } from './LandingThemeContext';

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    period: 'forever',
    description: 'For small teams exploring customer engagement.',
    features: [
      'Up to 10k events / month',
      'Customer 360 & event tracking',
      '2 active journeys',
      'Web push (1 channel)',
      'Forms & asset library',
    ],
    cta: 'Start free',
    href: '/login?signup=1',
    featured: false,
  },
  {
    name: 'Growth',
    price: '$299',
    period: '/ month',
    description: 'For scaling teams running multi-channel journeys.',
    features: [
      'Up to 500k events / month',
      'Unlimited journeys & triggers',
      'Data schemas & connectors',
      'AI form generation',
      'Dev / staging / prod environments',
      'Priority email support',
    ],
    cta: 'Start trial',
    href: '/login?signup=1',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with advanced security & scale needs.',
    features: [
      'Unlimited events & tenants',
      'SSO & SAML',
      'Dedicated success manager',
      'Custom SLAs & audit logs',
      'BYOP channel integrations',
      'On-premise deployment option',
    ],
    cta: 'Contact sales',
    href: '/login?signup=1',
    featured: false,
  },
];

export function LandingPricing() {
  const { styles } = useLandingTheme();

  return (
    <section id="pricing" className={`py-24 ${styles.pricingSection}`}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Simple, transparent pricing</h2>
          <p className={`mt-4 ${styles.sectionSubtitle}`}>
            Start free and scale as your engagement programs grow. No hidden fees.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                plan.featured ? styles.pricingCardFeatured : styles.pricingCard
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-md">
                  Most popular
                </span>
              )}

              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className={`text-sm ${styles.pricingMuted}`}>{plan.period}</span>
                )}
              </div>
              <p className={`mt-3 text-sm ${styles.pricingMuted}`}>{plan.description}</p>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${styles.checkIcon}`} />
                    <span className={styles.platformList}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link to={plan.href} className="mt-8 block">
                <Button
                  className="w-full"
                  variant={plan.featured ? 'primary' : 'secondary'}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
