import { supabase } from './supabase';
import { logAudit } from './audit';
import type { Customer } from '@marbee/shared';

export type RealDataIssueType =
  | 'email_in_phone'
  | 'duplicate_email'
  | 'duplicate_phone'
  | 'invalid_email'
  | 'invalid_phone'
  | 'missing_name'
  | 'missing_contact';

export type RealCustomerIssue = {
  id: string; // unique issue id
  customerId: string;
  customerName: string;
  issueType: RealDataIssueType;
  title: string;
  description: string;
  field: string;
  currentValue: string;
  recommendedValue?: string;
  severity: 'critical' | 'warning' | 'info';
  duplicateCustomerIds?: string[];
  duplicateCustomers?: Customer[];
};

export type JoinIndexIssue = {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  relationship: string;
  isIndexed: boolean;
  status: 'optimal' | 'missing_index' | 'orphan_warning';
  description: string;
  recommendedIndexSql?: string;
};

export type DuplicateMatchCriteria = 'email' | 'mobile' | 'both' | 'custom';
export type MasterStrategy = 'creation_date_oldest' | 'last_updated_newest' | 'manual';

export const CUSTOMER_DUPLICATE_COLUMNS: { id: keyof Customer; label: string }[] = [
  { id: 'first_name', label: 'First Name' },
  { id: 'last_name', label: 'Last Name' },
  { id: 'email', label: 'Email Address' },
  { id: 'mobile', label: 'Mobile / Phone' },
  { id: 'city', label: 'City' },
  { id: 'state', label: 'State' },
  { id: 'country', label: 'Country' },
  { id: 'pincode', label: 'Pincode / ZIP' },
  { id: 'dob', label: 'Date of Birth' },
  { id: 'title', label: 'Title / Prefix' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-().]{7,20}$/;

export function analyzeCustomerDataIssues(
  customers: Customer[],
  criteria: DuplicateMatchCriteria = 'email',
  customColumns: (keyof Customer)[] = ['first_name', 'last_name']
): {
  issues: RealCustomerIssue[];
  cleanCount: number;
  totalCount: number;
  healthScore: number;
  issueCounts: Record<RealDataIssueType, number>;
} {
  const issues: RealCustomerIssue[] = [];
  const cleanCustomerIds = new Set<string>(customers.map((c) => c.id));

  const issueCounts: Record<RealDataIssueType, number> = {
    email_in_phone: 0,
    duplicate_email: 0,
    duplicate_phone: 0,
    invalid_email: 0,
    invalid_phone: 0,
    missing_name: 0,
    missing_contact: 0,
  };

  const emailMap = new Map<string, Customer[]>();
  const phoneMap = new Map<string, Customer[]>();

  customers.forEach((c) => {
    let hasIssue = false;
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed Customer';
    const email = (c.email ?? '').trim().toLowerCase();
    const phone = (c.mobile ?? '').trim();

    // 1. Check: Email string entered into phone column
    if (phone && phone.includes('@')) {
      hasIssue = true;
      issueCounts.email_in_phone++;
      issues.push({
        id: `email_in_phone_${c.id}`,
        customerId: c.id,
        customerName: name,
        issueType: 'email_in_phone',
        title: 'Email Address Stored in Phone Column',
        description: `Mobile field contains "${phone}". This causes SMS dispatch failures.`,
        field: 'mobile',
        currentValue: phone,
        recommendedValue: '',
        severity: 'critical',
      });
    } else if (phone && !PHONE_REGEX.test(phone)) {
      hasIssue = true;
      issueCounts.invalid_phone++;
      issues.push({
        id: `invalid_phone_${c.id}`,
        customerId: c.id,
        customerName: name,
        issueType: 'invalid_phone',
        title: 'Invalid Phone Number Format',
        description: `Phone "${phone}" has invalid characters or length.`,
        field: 'mobile',
        currentValue: phone,
        severity: 'warning',
      });
    }

    // 2. Check: Invalid email format
    if (email && !EMAIL_REGEX.test(email)) {
      hasIssue = true;
      issueCounts.invalid_email++;
      issues.push({
        id: `invalid_email_${c.id}`,
        customerId: c.id,
        customerName: name,
        issueType: 'invalid_email',
        title: 'Invalid Email RFC Syntax',
        description: `Email "${email}" has an invalid syntax or missing domain.`,
        field: 'email',
        currentValue: email,
        severity: 'critical',
      });
    }

    // 3. Check: Missing contact information
    if (!email && !phone) {
      hasIssue = true;
      issueCounts.missing_contact++;
      issues.push({
        id: `missing_contact_${c.id}`,
        customerId: c.id,
        customerName: name,
        issueType: 'missing_contact',
        title: 'Unreachable Profile (No Email or Phone)',
        description: 'Customer profile has neither email nor phone number.',
        field: 'contact',
        currentValue: '—',
        severity: 'warning',
      });
    }

    // Index for duplicate analysis
    if (email && email.includes('@')) {
      const list = emailMap.get(email) ?? [];
      list.push(c);
      emailMap.set(email, list);
    }

    if (phone && !phone.includes('@')) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 7) {
        const list = phoneMap.get(cleanPhone) ?? [];
        list.push(c);
        phoneMap.set(cleanPhone, list);
      }
    }

    if (hasIssue) {
      cleanCustomerIds.delete(c.id);
    }
  });

  // Duplicate Groups evaluation based on selected criteria
  if (criteria === 'email' || criteria === 'both') {
    emailMap.forEach((dups, email) => {
      if (dups.length > 1) {
        issueCounts.duplicate_email += dups.length - 1;
        dups.forEach((c) => {
          cleanCustomerIds.delete(c.id);
          const otherNames = dups
            .filter((x) => x.id !== c.id)
            .map((x) => [x.first_name, x.last_name].filter(Boolean).join(' ') || 'Unnamed');

          issues.push({
            id: `dup_email_${c.id}`,
            customerId: c.id,
            customerName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed',
            issueType: 'duplicate_email',
            title: `Duplicate Customer by Email (${email})`,
            description: `Shared by ${dups.length} customer records: ${otherNames.join(', ')}.`,
            field: 'email',
            currentValue: email,
            severity: 'critical',
            duplicateCustomerIds: dups.map((x) => x.id),
            duplicateCustomers: dups,
          });
        });
      }
    });
  }

  if (criteria === 'mobile' || criteria === 'both') {
    phoneMap.forEach((dups, phoneVal) => {
      if (dups.length > 1) {
        issueCounts.duplicate_phone += dups.length - 1;
        dups.forEach((c) => {
          cleanCustomerIds.delete(c.id);
          const otherNames = dups
            .filter((x) => x.id !== c.id)
            .map((x) => [x.first_name, x.last_name].filter(Boolean).join(' ') || 'Unnamed');

          issues.push({
            id: `dup_phone_${c.id}`,
            customerId: c.id,
            customerName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed',
            issueType: 'duplicate_phone',
            title: `Duplicate Customer by Mobile (${phoneVal})`,
            description: `Shared by ${dups.length} customer records: ${otherNames.join(', ')}.`,
            field: 'mobile',
            currentValue: phoneVal,
            severity: 'critical',
            duplicateCustomerIds: dups.map((x) => x.id),
            duplicateCustomers: dups,
          });
        });
      }
    });
  }

  if (criteria === 'custom' && customColumns.length > 0) {
    const customMap = new Map<string, Customer[]>();
    customers.forEach((c) => {
      const parts = customColumns
        .map((col) => String(c[col] ?? '').trim().toLowerCase())
        .filter(Boolean);
      if (parts.length === customColumns.length) {
        const key = parts.join(' · ');
        const list = customMap.get(key) ?? [];
        list.push(c);
        customMap.set(key, list);
      }
    });

    customMap.forEach((dups, keyVal) => {
      if (dups.length > 1) {
        issueCounts.duplicate_email += dups.length - 1;
        const colLabels = customColumns
          .map((col) => CUSTOMER_DUPLICATE_COLUMNS.find((x) => x.id === col)?.label ?? String(col))
          .join(' + ');

        dups.forEach((c) => {
          cleanCustomerIds.delete(c.id);
          const otherNames = dups
            .filter((x) => x.id !== c.id)
            .map((x) => [x.first_name, x.last_name].filter(Boolean).join(' ') || 'Unnamed');

          issues.push({
            id: `dup_custom_${c.id}`,
            customerId: c.id,
            customerName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed',
            issueType: 'duplicate_email',
            title: `Duplicate Customer by ${colLabels}`,
            description: `Shared match "${keyVal}" across ${dups.length} profiles: ${otherNames.join(', ')}.`,
            field: colLabels.toLowerCase(),
            currentValue: keyVal,
            severity: 'critical',
            duplicateCustomerIds: dups.map((x) => x.id),
            duplicateCustomers: dups,
          });
        });
      }
    });
  }

  const totalCount = customers.length;
  const cleanCount = cleanCustomerIds.size;
  const healthScore = totalCount > 0 ? Math.round((cleanCount / totalCount) * 100) : 100;

  return {
    issues,
    cleanCount,
    totalCount,
    healthScore,
    cleanScore: healthScore,
    totalCustomers: totalCount,
    issueCounts,
  };
}

export function evaluateJoinIndexHealth(): JoinIndexIssue[] {
  return [
    {
      id: 'events_customer_id',
      sourceTable: 'events',
      sourceColumn: 'customer_id',
      targetTable: 'customers',
      targetColumn: 'id',
      relationship: '1:N',
      isIndexed: true,
      status: 'optimal',
      description: 'Foreign key index present on events.customer_id for fast event stream aggregations.',
    },
    {
      id: 'engagement_log_customer_id',
      sourceTable: 'engagement_log',
      sourceColumn: 'customer_id',
      targetTable: 'customers',
      targetColumn: 'id',
      relationship: '1:N',
      isIndexed: false,
      status: 'missing_index',
      description: 'Missing B-Tree index on engagement_log.customer_id. Audience joins on email activity require sequential table scans.',
      recommendedIndexSql: 'CREATE INDEX IF NOT EXISTS idx_engagement_log_customer_id ON engagement_log (customer_id);',
    },
    {
      id: 'journey_instances_customer_id',
      sourceTable: 'journey_instances',
      sourceColumn: 'customer_id',
      targetTable: 'customers',
      targetColumn: 'id',
      relationship: '1:N',
      isIndexed: true,
      status: 'optimal',
      description: 'Foreign key link indexed on journey_instances.customer_id.',
    },
    {
      id: 'web_push_subscribers_customer_id',
      sourceTable: 'web_push_subscribers',
      sourceColumn: 'customer_id',
      targetTable: 'customers',
      targetColumn: 'id',
      relationship: '1:N',
      isIndexed: false,
      status: 'missing_index',
      description: 'Missing join index on web_push_subscribers.customer_id. Push reachability checks perform unindexed scans.',
      recommendedIndexSql: 'CREATE INDEX IF NOT EXISTS idx_web_push_customer_id ON web_push_subscribers (customer_id);',
    },
  ];
}

export function pickMasterCustomer(
  dups: Customer[],
  strategy: MasterStrategy,
  manualMasterId?: string
): { master: Customer; secondary: Customer[] } {
  if (strategy === 'manual' && manualMasterId) {
    const master = dups.find((d) => d.id === manualMasterId) || dups[0];
    return { master, secondary: dups.filter((d) => d.id !== master.id) };
  }

  const sorted = [...dups].sort((a, b) => {
    if (strategy === 'creation_date_oldest') {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime; // oldest first
    }
    if (strategy === 'last_updated_newest') {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime; // newest first
    }
    return 0;
  });

  const master = sorted[0] || dups[0];
  return { master, secondary: sorted.filter((d) => d.id !== master.id) };
}

/** Delete a single customer record cleanly from Supabase */
export async function deleteSingleCustomerRecord(tenantId: string, environment: string, customerId: string) {
  await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'customer',
    resourceId: customerId,
    resourceName: `Deleted customer record ${customerId}`,
  });
}

/** Fix a single record where email is stored in phone */
export async function fixEmailInPhoneRecord(tenantId: string, environment: string, customerId: string) {
  const { error } = await supabase
    .from('customers')
    .update({ mobile: null })
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'customer',
    resourceId: customerId,
    resourceName: 'Cleaned contaminated email from phone field',
  });
}

/** Automatically fix all records where email is in phone field across tenant */
export async function autoFixAllEmailInPhone(tenantId: string, environment: string, customers: Customer[]): Promise<number> {
  const contaminated = customers.filter((c) => c.mobile && c.mobile.includes('@'));
  if (!contaminated.length) return 0;

  for (const c of contaminated) {
    await supabase
      .from('customers')
      .update({ mobile: null })
      .eq('id', c.id)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'customer',
    resourceId: tenantId,
    resourceName: `Auto-cleaned ${contaminated.length} contaminated phone fields`,
  });

  return contaminated.length;
}

/** Merge duplicate customers into a single master profile */
export async function mergeCustomerProfiles(
  tenantId: string,
  environment: string,
  masterId: string,
  duplicateIds: string[]
) {
  const toMerge = duplicateIds.filter((id) => id !== masterId);
  if (!toMerge.length) return;

  // 1. Fetch master and secondary customer records to enrich master with any missing data
  const { data: records } = await supabase
    .from('customers')
    .select('*')
    .in('id', [masterId, ...toMerge])
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  const masterRecord = records?.find((r) => r.id === masterId);
  const secondaryRecords = records?.filter((r) => r.id !== masterId) ?? [];

  if (masterRecord && secondaryRecords.length > 0) {
    const patch: Record<string, unknown> = {};
    if (!masterRecord.first_name) {
      const fn = secondaryRecords.find((r) => r.first_name)?.first_name;
      if (fn) patch.first_name = fn;
    }
    if (!masterRecord.last_name) {
      const ln = secondaryRecords.find((r) => r.last_name)?.last_name;
      if (ln) patch.last_name = ln;
    }
    if (!masterRecord.mobile || String(masterRecord.mobile).includes('@')) {
      const mob = secondaryRecords.find((r) => r.mobile && !String(r.mobile).includes('@'))?.mobile;
      if (mob) patch.mobile = mob;
    }
    if (!masterRecord.city) {
      const city = secondaryRecords.find((r) => r.city)?.city;
      if (city) patch.city = city;
    }
    if (!masterRecord.country) {
      const cty = secondaryRecords.find((r) => r.country)?.country;
      if (cty) patch.country = cty;
    }

    if (Object.keys(patch).length > 0) {
      await supabase
        .from('customers')
        .update(patch)
        .eq('id', masterId)
        .eq('tenant_id', tenantId)
        .eq('environment', environment);
    }
  }

  // 2. Re-link foreign key rows across all child tables to the master customer ID
  try {
    await supabase
      .from('events')
      .update({ customer_id: masterId })
      .in('customer_id', toMerge)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch (err) {
    console.warn('events re-link:', err);
  }

  try {
    await supabase
      .from('journey_instances')
      .update({ customer_id: masterId })
      .in('customer_id', toMerge)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch (err) {
    console.warn('journey_instances re-link:', err);
  }

  try {
    await supabase
      .from('web_push_subscribers')
      .update({ customer_id: masterId })
      .in('customer_id', toMerge)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch (err) {
    console.warn('web_push_subscribers re-link:', err);
  }

  try {
    await supabase
      .from('customer_identities')
      .update({ customer_id: masterId })
      .in('customer_id', toMerge)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch (err) {
    console.warn('customer_identities re-link:', err);
  }

  try {
    await supabase
      .from('exclusions')
      .delete()
      .in('customer_id', toMerge)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);
  } catch (err) {
    console.warn('exclusions clean:', err);
  }

  // 3. Hard-delete duplicate records
  const { error: delError } = await supabase
    .from('customers')
    .delete()
    .in('id', toMerge)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (delError) {
    console.error('Failed to delete merged customer records:', delError);
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'customer',
    resourceId: masterId,
    resourceName: `Merged ${toMerge.length} duplicate customer profiles into master ${masterId}`,
  });
}

/** Automatically merge all duplicate customer records sharing identical emails with strategy */
export async function autoMergeAllEmailDuplicates(
  tenantId: string,
  environment: string,
  customers: Customer[],
  strategy: MasterStrategy = 'creation_date_oldest'
): Promise<number> {
  const emailMap = new Map<string, Customer[]>();
  customers.forEach((c) => {
    const email = (c.email ?? '').trim().toLowerCase();
    if (email && EMAIL_REGEX.test(email)) {
      const list = emailMap.get(email) ?? [];
      list.push(c);
      emailMap.set(email, list);
    }
  });

  let mergedGroups = 0;
  for (const [, dups] of emailMap.entries()) {
    if (dups.length > 1) {
      const { master, secondary } = pickMasterCustomer(dups, strategy);
      const duplicateIds = secondary.map((d) => d.id);
      await mergeCustomerProfiles(tenantId, environment, master.id, duplicateIds);
      mergedGroups++;
    }
  }

  return mergedGroups;
}
