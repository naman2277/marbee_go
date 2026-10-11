export type CustomerStatus = 'active' | 'inactive' | 'merged';

export type Customer = {
  id: string;
  tenant_id: string;
  environment: string;
  email: string | null;
  mobile: string | null;
  mobile_country_code: string | null;
  title: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  dob: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  location: Record<string, unknown> | null;
  consent_email: boolean | null;
  consent_sms: boolean | null;
  consent_web_push: boolean | null;
  consent_whatsapp: boolean | null;
  global_consent: boolean | null;
  loyalty_member: boolean | null;
  loyalty_program_id: string | null;
  loyalty_program_name: string | null;
  loyalty_tier_slug: string | null;
  loyalty_tier_name: string | null;
  loyalty_points_balance: number | null;
  loyalty_lifetime_points: number | null;
  loyalty_status: 'active' | 'suspended' | 'churned' | null;
  loyalty_enrolled_at: string | null;
  source: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
};

export type CustomerIdentity = {
  id: string;
  tenant_id: string;
  environment: string;
  customer_id: string | null;
  ecid: string | null;
  email: string | null;
  mobile: string | null;
  device_id: string | null;
  anonymous_id: string | null;
  external_id: string | null;
  source: string | null;
  identity_type: 'anonymous' | 'known' | 'merged';
  created_at: string;
};

export type WebPushSubscriber = {
  id: string;
  tenant_id: string;
  environment: string;
  customer_id: string | null;
  ecid: string | null;
  fcm_token: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  permission_status: string;
  subscription_status: string;
  last_seen: string | null;
};

export type Exclusion = {
  id: string;
  tenant_id: string;
  environment: string;
  customer_id: string;
  channel: string | null;
  reason: string;
  source: string;
  start_date: string;
  end_date: string | null;
};
