import { Mail, Phone, MapPin, Calendar, Shield, User, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { CustomerJourneyList, CustomerJourneyPills } from '@/components/customers/CustomerJourneyList';
import {
  getCustomerAvatarColor,
  getCustomerDisplayName,
  getCustomerInitials,
  formatCustomerLocation,
  formatCustomerMobile,
  formatRelativeTime,
  getChannelConsentFlags,
  getLoyaltyFlags,
  type Customer360,
} from '@/lib/customers';
import { formatSchemaDate } from '@/lib/schema-stats';

export function Customer360Header({ profile }: { profile: Customer360 }) {
  const { customer, metrics } = profile;
  const displayName = getCustomerDisplayName(customer);
  const location = formatCustomerLocation(customer);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-600/10 via-violet-500/5 to-teal-500/10" />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-bold text-white shadow-lg ${getCustomerAvatarColor(customer.id)}`}
          >
            {getCustomerInitials(customer)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
              <Badge variant={customer.status === 'active' ? 'success' : 'default'}>{customer.status}</Badge>
              {customer.source && (
                <Badge variant="default">{customer.source}</Badge>
              )}
              {!customer.global_consent && (
                <Badge variant="warning">No global consent</Badge>
              )}
              {customer.loyalty_member && (
                <Badge variant="success">
                  {customer.loyalty_tier_name ?? 'Loyalty member'}
                </Badge>
              )}
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                Customer 360
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {customer.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {customer.email}
                </span>
              )}
              {customer.mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {formatCustomerMobile(customer) ?? customer.mobile}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {location}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Member since {formatSchemaDate(customer.created_at)}
              {metrics.lastActivityAt && (
                <> · Last active {formatRelativeTime(metrics.lastActivityAt)}</>
              )}
            </p>
            <div className="mt-3">
              <CustomerJourneyPills instances={profile.journeyInstances} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-white/60 bg-white/80 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-lg font-bold tabular-nums text-slate-900">{metrics.totalEvents}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Events</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/80 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-lg font-bold tabular-nums text-slate-900">{metrics.messagesSent}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Messages</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/80 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-lg font-bold tabular-nums text-emerald-600">{metrics.engagementRate.toFixed(0)}%</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Engaged</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/80 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-lg font-bold tabular-nums text-brand-700">
              {metrics.activeJourneys}
              <span className="text-sm font-normal text-slate-400">/{profile.journeyInstances.length}</span>
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Journeys</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomerMetricsGrid({ profile }: { profile: Customer360 }) {
  const { metrics } = profile;
  const cards = [
    { label: 'Behavioral events', value: String(metrics.totalEvents), hint: 'Tracked interactions' },
    { label: 'Engagements', value: String(metrics.totalEngagements), hint: 'Channel touchpoints' },
    { label: 'Form submissions', value: String(metrics.formSubmissions), hint: 'Captured leads' },
    { label: 'Journeys enrolled', value: `${metrics.activeJourneys}/${profile.journeyInstances.length}`, hint: 'Active / total' },
    { label: 'Stitched identities', value: String(metrics.identityCount), hint: 'Resolved IDs' },
    { label: 'Lifetime value', value: metrics.estimatedValue ? formatCurrency(metrics.estimatedValue) : '—', hint: 'From purchase events' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{card.value}</p>
          <p className="mt-1 text-[10px] text-slate-400">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function CustomerIdentityPanel({ profile }: { profile: Customer360 }) {
  const { identities, customer } = profile;

  const stitched = identities.length
    ? identities
    : [
        {
          id: 'primary',
          identity_type: 'known' as const,
          ecid: null,
          email: customer.email,
          mobile: customer.mobile,
          anonymous_id: null,
          external_id: null,
          device_id: null,
          source: 'profile',
          created_at: customer.created_at,
        },
      ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Identity graph</h3>
        <span className="text-xs text-slate-500">{stitched.length} linked</span>
      </div>
      <div className="space-y-3">
        {stitched.map((identity) => (
          <div key={identity.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={identity.identity_type === 'known' ? 'success' : 'default'}>
                {identity.identity_type}
              </Badge>
              {identity.source && <span className="text-[10px] text-slate-400">{identity.source}</span>}
            </div>
            <dl className="mt-2 grid gap-1 text-xs">
              {identity.email && <Row label="Email" value={identity.email} />}
              {identity.mobile && <Row label="Mobile" value={identity.mobile} />}
              {identity.ecid && <Row label="ECID" value={identity.ecid} mono />}
              {identity.anonymous_id && <Row label="Anonymous" value={identity.anonymous_id} mono />}
              {identity.external_id && <Row label="External ID" value={identity.external_id} mono />}
              {identity.device_id && <Row label="Device" value={identity.device_id} mono />}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`truncate text-right text-slate-800 ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</dd>
    </div>
  );
}

export function CustomerChannelsPanel({ profile }: { profile: Customer360 }) {
  const { subscribers, exclusions } = profile;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-slate-900">Channels & devices</h3>

      {subscribers.length ? (
        <div className="space-y-3">
          {subscribers.map((sub) => (
            <div key={sub.id} className="flex items-start justify-between rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Web Push</p>
                <p className="text-xs text-slate-500">
                  {[sub.browser, sub.os, sub.device].filter(Boolean).join(' · ') || 'Unknown device'}
                </p>
                {sub.last_seen && (
                  <p className="mt-1 text-[10px] text-slate-400">Last seen {formatRelativeTime(sub.last_seen)}</p>
                )}
              </div>
              <Badge variant={sub.subscription_status === 'active' ? 'success' : 'warning'}>
                {sub.subscription_status}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No active channel subscriptions.</p>
      )}

      {exclusions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase text-slate-500">Exclusions</p>
          {exclusions.map((ex) => (
            <div key={ex.id} className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {ex.channel ?? 'All channels'} · {ex.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerAttributesPanel({ profile }: { profile: Customer360 }) {
  const { customer } = profile;

  const rows = [
    { icon: Shield, label: 'Title', value: customer.title },
    { icon: User, label: 'First name', value: customer.first_name },
    { icon: User, label: 'Middle name', value: customer.middle_name },
    { icon: User, label: 'Last name', value: customer.last_name },
    { icon: Mail, label: 'Email', value: customer.email },
    { icon: Phone, label: 'Mobile country code', value: customer.mobile_country_code },
    { icon: Phone, label: 'Mobile', value: formatCustomerMobile(customer) ?? customer.mobile },
    { icon: Calendar, label: 'Date of birth', value: customer.dob ? formatSchemaDate(customer.dob) : null },
    { icon: Shield, label: 'Gender', value: customer.gender },
    { icon: MapPin, label: 'City', value: customer.city },
    { icon: MapPin, label: 'State', value: customer.state },
    { icon: MapPin, label: 'Country', value: customer.country },
    { icon: MapPin, label: 'Pincode', value: customer.pincode },
    {
      icon: Shield,
      label: 'Global consent',
      value: customer.global_consent ? 'Yes — opted in globally' : 'No',
    },
    {
      icon: Award,
      label: 'Loyalty member',
      value: customer.loyalty_member ? 'Yes' : 'No',
    },
    ...(customer.loyalty_member
      ? [
          { icon: Award, label: 'Loyalty program', value: customer.loyalty_program_name },
          { icon: Award, label: 'Tier', value: customer.loyalty_tier_name ?? customer.loyalty_tier_slug },
          { icon: Award, label: 'Points balance', value: String(customer.loyalty_points_balance ?? 0) },
        ]
      : []),
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-slate-900">Profile attributes</h3>
      <dl className="space-y-3">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Icon className="h-4 w-4 text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-sm font-medium text-slate-900">{value ?? '—'}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CustomerConsentPanel({ profile }: { profile: Customer360 }) {
  const items = getChannelConsentFlags(profile.customer);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-slate-900">Channel consent flags</h3>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-sm font-medium text-slate-700">Global consent</span>
        <Badge variant={profile.customer.global_consent ? 'success' : 'default'}>
          {profile.customer.global_consent ? 'Opted in' : 'Not opted in'}
        </Badge>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.channel} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-700">{item.channel}</span>
            <Badge variant={item.enabled ? 'success' : 'default'}>
              {item.enabled ? 'Opted in' : 'Not opted in'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomerJourneysPanel({ profile }: { profile: Customer360 }) {
  return (
    <CustomerJourneyList
      instances={profile.journeyInstances}
      variant="compact"
      showViewAllLink={profile.journeyInstances.length > 0}
    />
  );
}

export function CustomerLoyaltyPanel({ profile }: { profile: Customer360 }) {
  const { customer } = profile;
  const flags = getLoyaltyFlags(customer);

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/50 to-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Award className="h-4 w-4 text-violet-600" />
          Loyalty flags
        </h3>
        <Link to="/loyalty" className="text-xs font-medium text-brand-600 hover:underline">
          Loyalty Hub
        </Link>
      </div>

      {!customer.loyalty_member ? (
        <p className="text-sm text-slate-600">
          Not enrolled in a loyalty program. Enroll via{' '}
          <Link to="/loyalty?tab=members" className="font-medium text-brand-600 hover:underline">
            Loyalty Hub → Members
          </Link>{' '}
          or a journey enrollment step.
        </p>
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => (
            <div
              key={flag.label}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                flag.highlight ? 'bg-violet-100/60' : 'bg-slate-50'
              }`}
            >
              <span className="text-sm text-slate-700">{flag.label}</span>
              <span className={`text-sm font-medium ${flag.highlight ? 'text-violet-800' : 'text-slate-900'}`}>
                {flag.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
