import { supabase } from './supabase';
import { logAudit } from './audit';

export type CouponType = 'fixed_amount' | 'percentage' | 'free_shipping' | 'free_gift' | 'points_multiplier';

export type CouponCampaign = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  code_pattern: string;
  is_generic: boolean;
  discount_type: CouponType;
  discount_value: number;
  min_cart_value: number;
  max_discount_cap?: number;
  total_codes_generated: number;
  total_redeemed: number;
  max_redemptions_per_customer: number;
  max_total_redemptions?: number;
  budget_cap?: number;
  revenue_generated: number;
  starts_at: string;
  expires_at: string | null;
  status: 'active' | 'scheduled' | 'expired' | 'exhausted';
  tags: string[];
  created_at: string;
};

export type CouponCode = {
  id: string;
  campaign_id: string;
  code: string;
  is_claimed: boolean;
  claimed_by_customer_id?: string;
  claimed_by_customer_name?: string;
  claimed_at?: string;
  is_redeemed: boolean;
  redeemed_at?: string;
  order_id?: string;
  discount_applied?: number;
  created_at: string;
};

const STORAGE_CAMPAIGNS_KEY = 'marbee_coupons_campaigns_v2';
const STORAGE_CODES_KEY = 'marbee_coupons_codes_v2';

function getStoredCampaigns(tenantId: string, environment: string): CouponCampaign[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_CAMPAIGNS_KEY}_${tenantId}_${environment}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Coupon storage read error:', e);
  }
  return [];
}

function saveStoredCampaigns(tenantId: string, environment: string, list: CouponCampaign[]) {
  try {
    localStorage.setItem(`${STORAGE_CAMPAIGNS_KEY}_${tenantId}_${environment}`, JSON.stringify(list));
  } catch (e) {
    console.warn('Coupon storage write error:', e);
  }
}

function getStoredCodes(campaignId: string): CouponCode[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_CODES_KEY}_${campaignId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Code storage read error:', e);
  }
  return [];
}

function saveStoredCodes(campaignId: string, codes: CouponCode[]) {
  try {
    localStorage.setItem(`${STORAGE_CODES_KEY}_${campaignId}`, JSON.stringify(codes));
  } catch (e) {
    console.warn('Code storage write error:', e);
  }
}

/** Fetch all coupon campaigns */
export async function fetchCouponCampaigns(
  tenantId: string,
  environment: string
): Promise<CouponCampaign[]> {
  try {
    const { data, error } = await supabase
      .from('coupon_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('created_at', { ascending: false });

    if (!error && data) return data as CouponCampaign[];
  } catch {
    // fallback to tenant storage
  }

  return getStoredCampaigns(tenantId, environment);
}

/** Fetch individual voucher codes for a campaign */
export async function fetchCouponCodes(campaignId: string): Promise<CouponCode[]> {
  try {
    const { data, error } = await supabase
      .from('coupon_codes')
      .select('*')
      .eq('campaign_id', campaignId)
      .limit(500);

    if (!error && data) return data as CouponCode[];
  } catch {
    // fallback
  }

  return getStoredCodes(campaignId);
}

/** Create a new coupon campaign with auto code generation */
export async function createCouponCampaign(
  tenantId: string,
  environment: string,
  payload: Omit<CouponCampaign, 'id' | 'tenant_id' | 'environment' | 'total_codes_generated' | 'total_redeemed' | 'revenue_generated' | 'created_at'>,
  initialCodesCount = 50
): Promise<CouponCampaign> {
  const newCampaign: CouponCampaign = {
    ...payload,
    id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    tenant_id: tenantId,
    environment,
    total_codes_generated: payload.is_generic ? 1 : initialCodesCount,
    total_redeemed: 0,
    revenue_generated: 0,
    created_at: new Date().toISOString(),
  };

  // Try saving to Supabase table
  try {
    await supabase.from('coupon_campaigns').insert({
      id: newCampaign.id,
      tenant_id: tenantId,
      environment,
      name: newCampaign.name,
      code_pattern: newCampaign.code_pattern,
      is_generic: newCampaign.is_generic,
      discount_type: newCampaign.discount_type,
      discount_value: newCampaign.discount_value,
      min_cart_value: newCampaign.min_cart_value,
      max_discount_cap: newCampaign.max_discount_cap,
      total_codes_generated: newCampaign.total_codes_generated,
      total_redeemed: 0,
      max_redemptions_per_customer: newCampaign.max_redemptions_per_customer,
      starts_at: newCampaign.starts_at,
      expires_at: newCampaign.expires_at,
      status: newCampaign.status,
      tags: newCampaign.tags,
    });
  } catch {
    // fallback
  }

  const list = getStoredCampaigns(tenantId, environment);
  saveStoredCampaigns(tenantId, environment, [newCampaign, ...list]);

  // Generate initial batch of codes
  if (!payload.is_generic) {
    const codes: CouponCode[] = [];
    for (let i = 0; i < initialCodesCount; i++) {
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const numPart = Math.floor(1000 + Math.random() * 9000);
      const codeStr = payload.code_pattern
        .replace(/####/g, String(numPart))
        .replace(/\*\*\*\*/g, randomPart);

      codes.push({
        id: `code_${newCampaign.id}_${i}`,
        campaign_id: newCampaign.id,
        code: codeStr.includes('#') || codeStr.includes('*') ? `${payload.name.slice(0, 4).toUpperCase()}-${numPart}-${randomPart}` : codeStr,
        is_claimed: false,
        is_redeemed: false,
        created_at: new Date().toISOString(),
      });
    }
    saveStoredCodes(newCampaign.id, codes);
  }

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'coupon_campaign',
    resourceId: newCampaign.id,
    resourceName: newCampaign.name,
  });

  return newCampaign;
}

/** Generate additional bulk unique codes for an existing campaign */
export async function generateAdditionalCodes(
  campaignId: string,
  pattern: string,
  count = 50
): Promise<CouponCode[]> {
  const existing = getStoredCodes(campaignId);
  const newCodes: CouponCode[] = [];

  for (let i = 0; i < count; i++) {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const numPart = Math.floor(1000 + Math.random() * 9000);
    const codeStr = pattern
      .replace(/####/g, String(numPart))
      .replace(/\*\*\*\*/g, randomPart);

    newCodes.push({
      id: `code_${campaignId}_${Date.now()}_${i}`,
      campaign_id: campaignId,
      code: codeStr.includes('#') || codeStr.includes('*') ? `VOUCHER-${numPart}-${randomPart}` : codeStr,
      is_claimed: false,
      is_redeemed: false,
      created_at: new Date().toISOString(),
    });
  }

  const updated = [...newCodes, ...existing];
  saveStoredCodes(campaignId, updated);
  return updated;
}

/** Delete a coupon campaign */
export async function deleteCouponCampaign(
  tenantId: string,
  environment: string,
  campaignId: string
): Promise<void> {
  try {
    await supabase.from('coupon_codes').delete().eq('campaign_id', campaignId);
    await supabase.from('coupon_campaigns').delete().eq('id', campaignId);
  } catch (e) {
    console.warn('Supabase delete error:', e);
  }

  const current = getStoredCampaigns(tenantId, environment);
  saveStoredCampaigns(tenantId, environment, current.filter((c) => c.id !== campaignId));
  try {
    localStorage.removeItem(`${STORAGE_CODES_KEY}_${campaignId}`);
  } catch {}

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'coupon_campaign',
    resourceId: campaignId,
    resourceName: 'Coupon Campaign',
  });
}

/** Clear all coupon campaigns for tenant */
export async function clearAllCouponCampaigns(tenantId: string, environment: string): Promise<void> {
  try {
    await supabase.from('coupon_campaigns').delete().eq('tenant_id', tenantId).eq('environment', environment);
  } catch {}

  saveStoredCampaigns(tenantId, environment, []);
}

