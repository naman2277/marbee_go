export type CustomerTesterProfile = {
  id: string;
  name: string;
  title: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  mobile: string;
  mobile_country_code: string;
  dob?: string;
  gender?: 'male' | 'female' | 'other' | 'undisclosed';
  city: string;
  state: string;
  country: string;
  pincode: string;
  status: 'active' | 'inactive';
  consent_email: boolean;
  consent_sms: boolean;
  consent_whatsapp: boolean;
  consent_web_push: boolean;
  loyalty_member: boolean;
  loyalty_program_name?: string;
  loyalty_tier_name: string;
  loyalty_tier_slug?: string;
  loyalty_points_balance: number;
  loyalty_lifetime_points?: number;
  loyalty_status: 'active' | 'suspended' | 'churned';
  // E-Commerce / Context attributes
  order_id: string;
  order_total: string;
  discount_code: string;
  // Actual delivery destination where real test emails / SMS are sent
  target_test_email: string;
  target_test_phone: string;
  notes?: string;
};

export const DEFAULT_CUSTOMER_TESTERS: CustomerTesterProfile[] = [
  {
    id: 'tester-vip-01',
    name: 'Sarah Connor (Platinum VIP)',
    title: 'Ms.',
    first_name: 'Sarah',
    middle_name: 'Jean',
    last_name: 'Connor',
    email: 'sarah.c@cyberdyne.io',
    mobile: '+1 555-0199',
    mobile_country_code: '+1',
    dob: '1984-05-12',
    gender: 'female',
    city: 'Los Angeles',
    state: 'California',
    country: 'United States',
    pincode: '90001',
    status: 'active',
    consent_email: true,
    consent_sms: true,
    consent_whatsapp: true,
    consent_web_push: true,
    loyalty_member: true,
    loyalty_program_name: 'Cyberdyne VIP Club',
    loyalty_tier_name: 'Platinum VIP',
    loyalty_tier_slug: 'platinum_vip',
    loyalty_points_balance: 3450,
    loyalty_lifetime_points: 12800,
    loyalty_status: 'active',
    order_id: 'ORD-8921',
    order_total: '$249.00',
    discount_code: 'VIP25OFF',
    target_test_email: 'tester@marbee.io',
    target_test_phone: '+1 555-0100',
    notes: 'High-value customer profile matching all customer table columns.',
  },
  {
    id: 'tester-lead-02',
    name: 'John Doe (New Signup Lead)',
    title: 'Mr.',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@techcorp.com',
    mobile: '+1 555-0142',
    mobile_country_code: '+1',
    dob: '1995-11-23',
    gender: 'male',
    city: 'Austin',
    state: 'Texas',
    country: 'United States',
    pincode: '78701',
    status: 'active',
    consent_email: true,
    consent_sms: true,
    consent_whatsapp: false,
    consent_web_push: true,
    loyalty_member: true,
    loyalty_program_name: 'Marbee Rewards',
    loyalty_tier_name: 'Bronze Member',
    loyalty_tier_slug: 'bronze',
    loyalty_points_balance: 100,
    loyalty_lifetime_points: 100,
    loyalty_status: 'active',
    order_id: 'ORD-1002',
    order_total: '$39.50',
    discount_code: 'WELCOME10',
    target_test_email: 'tester@marbee.io',
    target_test_phone: '+1 555-0100',
    notes: 'New starter lead profile for onboarding and initial purchase campaigns.',
  },
  {
    id: 'tester-gold-03',
    name: 'Alex Rivera (Gold Tier)',
    title: 'Dr.',
    first_name: 'Alex',
    last_name: 'Rivera',
    email: 'alex.r@innovate.io',
    mobile: '+1 555-0188',
    mobile_country_code: '+1',
    dob: '1990-08-15',
    gender: 'other',
    city: 'Seattle',
    state: 'Washington',
    country: 'United States',
    pincode: '98101',
    status: 'active',
    consent_email: true,
    consent_sms: true,
    consent_whatsapp: true,
    consent_web_push: true,
    loyalty_member: true,
    loyalty_program_name: 'Marbee Rewards',
    loyalty_tier_name: 'Gold Tier',
    loyalty_tier_slug: 'gold',
    loyalty_points_balance: 1250,
    loyalty_lifetime_points: 4500,
    loyalty_status: 'active',
    order_id: 'ORD-7740',
    order_total: '$129.99',
    discount_code: 'GOLD15',
    target_test_email: 'tester@marbee.io',
    target_test_phone: '+1 555-0100',
    notes: 'Mid-tier gold member profile for digest and upgrade testing.',
  },
  {
    id: 'tester-intl-04',
    name: 'Elena Rostova (International European)',
    title: 'Ms.',
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena@solarpower.de',
    mobile: '+49 151 5550123',
    mobile_country_code: '+49',
    dob: '1988-02-28',
    gender: 'female',
    city: 'Berlin',
    state: 'Berlin',
    country: 'Germany',
    pincode: '10115',
    status: 'active',
    consent_email: true,
    consent_sms: true,
    consent_whatsapp: true,
    consent_web_push: true,
    loyalty_member: true,
    loyalty_program_name: 'Global Perks',
    loyalty_tier_name: 'Platinum VIP',
    loyalty_tier_slug: 'platinum_vip',
    loyalty_points_balance: 4800,
    loyalty_lifetime_points: 15400,
    loyalty_status: 'active',
    order_id: 'ORD-9912',
    order_total: '€320.00',
    discount_code: 'EUROPEMEMBER',
    target_test_email: 'tester@marbee.io',
    target_test_phone: '+49 151 5550123',
    notes: 'International customer with Euro currency and non-US mobile number.',
  },
  {
    id: 'tester-churn-05',
    name: 'Michael Scott (Inactive / Churned)',
    title: 'Mr.',
    first_name: 'Michael',
    middle_name: 'Gary',
    last_name: 'Scott',
    email: 'michael.s@dundermifflin.com',
    mobile: '+1 555-0177',
    mobile_country_code: '+1',
    dob: '1965-03-15',
    gender: 'male',
    city: 'Scranton',
    state: 'Pennsylvania',
    country: 'United States',
    pincode: '18503',
    status: 'inactive',
    consent_email: true,
    consent_sms: false,
    consent_whatsapp: false,
    consent_web_push: false,
    loyalty_member: true,
    loyalty_program_name: 'Marbee Rewards',
    loyalty_tier_name: 'Silver Tier',
    loyalty_tier_slug: 'silver',
    loyalty_points_balance: 520,
    loyalty_lifetime_points: 1800,
    loyalty_status: 'churned',
    order_id: 'ORD-4401',
    order_total: '$85.00',
    discount_code: 'WINBACK30',
    target_test_email: 'tester@marbee.io',
    target_test_phone: '+1 555-0100',
    notes: 'Inactive customer profile for testing re-engagement and winback offers.',
  },
];

const STORAGE_KEY = 'marbee_customer_tester_profiles';

export function getCustomerTesterProfiles(tenantId?: string): CustomerTesterProfile[] {
  try {
    const key = tenantId ? `${STORAGE_KEY}_${tenantId}` : STORAGE_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_CUSTOMER_TESTERS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CUSTOMER_TESTERS;

    return parsed.map((p, idx) => {
      const fallback = DEFAULT_CUSTOMER_TESTERS[idx % DEFAULT_CUSTOMER_TESTERS.length];
      const firstName = String(p.first_name || p.name?.split(' ')[0] || fallback.first_name || 'Customer');
      const lastName = String(p.last_name || p.name?.split(' ')[1] || fallback.last_name || '');
      const name = String(p.name || `${firstName} ${lastName}`.trim());

      return {
        ...fallback,
        ...p,
        id: String(p.id || `tester-${idx}`),
        name,
        title: String(p.title || fallback.title || 'Mr.'),
        first_name: firstName,
        last_name: lastName,
        email: String(p.email || fallback.email),
        mobile: String(p.mobile || p.phone || fallback.mobile),
        mobile_country_code: String(p.mobile_country_code || '+1'),
        city: String(p.city || fallback.city || 'City'),
        state: String(p.state || fallback.state || 'State'),
        country: String(p.country || fallback.country || 'Country'),
        pincode: String(p.pincode || p.postal_code || fallback.pincode || '00000'),
        status: p.status === 'inactive' ? 'inactive' : 'active',
        loyalty_tier_name: String(p.loyalty_tier_name || p.loyalty_tier || fallback.loyalty_tier_name),
        loyalty_points_balance: Number(p.loyalty_points_balance ?? p.loyalty_points ?? fallback.loyalty_points_balance),
        order_id: String(p.order_id || fallback.order_id),
        order_total: String(p.order_total || fallback.order_total),
        discount_code: String(p.discount_code || fallback.discount_code),
        target_test_email: String(p.target_test_email || fallback.target_test_email),
        target_test_phone: String(p.target_test_phone || fallback.target_test_phone),
      };
    });
  } catch {
    return DEFAULT_CUSTOMER_TESTERS;
  }
}

export function saveCustomerTesterProfiles(
  profiles: CustomerTesterProfile[],
  tenantId?: string,
): void {
  try {
    const key = tenantId ? `${STORAGE_KEY}_${tenantId}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(profiles));
  } catch (err) {
    console.error('Failed to save customer tester profiles', err);
  }
}

export function resetCustomerTesterProfiles(tenantId?: string): CustomerTesterProfile[] {
  saveCustomerTesterProfiles(DEFAULT_CUSTOMER_TESTERS, tenantId);
  return DEFAULT_CUSTOMER_TESTERS;
}

/** Converts a CustomerTesterProfile into a complete token dictionary matching all customer columns + standard aliases. */
export function createTesterProfileContext(tester: CustomerTesterProfile): Record<string, unknown> {
  const firstName = tester.first_name || 'Customer';
  const lastName = tester.last_name || '';
  const fullName = tester.name || `${firstName} ${lastName}`.trim();

  return {
    // Exact Customer Table Columns
    id: tester.id,
    title: tester.title || '',
    first_name: firstName,
    middle_name: tester.middle_name ?? '',
    last_name: lastName,
    name: fullName,
    email: tester.email || '',
    primary_email: tester.email || '',
    mobile: tester.mobile || '',
    primary_phone: tester.mobile || '',
    phone: tester.mobile || '',
    mobile_country_code: tester.mobile_country_code || '+1',
    dob: tester.dob ?? '',
    gender: tester.gender ?? '',
    city: tester.city || '',
    state: tester.state || '',
    country: tester.country || '',
    pincode: tester.pincode || '',
    postal_code: tester.pincode || '',
    status: tester.status || 'active',
    consent_email: tester.consent_email ?? true,
    consent_sms: tester.consent_sms ?? true,
    consent_whatsapp: tester.consent_whatsapp ?? true,
    consent_web_push: tester.consent_web_push ?? true,
    loyalty_member: tester.loyalty_member ?? true,
    loyalty_program_name: tester.loyalty_program_name ?? '',
    loyalty_tier_name: tester.loyalty_tier_name || 'Standard',
    loyalty_tier: tester.loyalty_tier_name || 'Standard',
    loyalty_tier_slug: tester.loyalty_tier_slug ?? '',
    loyalty_points_balance: tester.loyalty_points_balance ?? 0,
    loyalty_points: tester.loyalty_points_balance ?? 0,
    loyalty_lifetime_points: tester.loyalty_lifetime_points ?? tester.loyalty_points_balance ?? 0,
    loyalty_status: tester.loyalty_status || 'active',
    // E-Commerce / Contextual Attributes
    order_id: tester.order_id || 'ORD-0000',
    order_total: tester.order_total || '$0.00',
    discount_code: tester.discount_code || 'WELCOME10',
  };
}
