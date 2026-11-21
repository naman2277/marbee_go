import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { supabase } from './supabase';
import { logAudit } from './audit';
import type { SchemaWithFields } from './fetch-schemas';

export type IngestMappingField = {
  schemaField: string;
  sourceHeader: string | null;
  fieldType: string;
  isKey: boolean;
  isRequired: boolean;
  isPii?: boolean;
  confidence: number;
  typeCast: 'string' | 'number' | 'integer' | 'boolean' | 'date_iso' | 'json';
  transform: {
    trimWhitespace: boolean;
    caseFormat: 'none' | 'uppercase' | 'lowercase' | 'titlecase';
    normalizePhone: boolean;
    normalizeDate: boolean;
    dateFormat?: string;
    defaultValue?: string;
  };
};

export type IngestionScheduleConfig = {
  mode: 'run_once' | 'recurring';
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  timezone: string;
  cadence: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom_cron';
  weeklyDays: number[]; // 0=Sun, 1=Mon, ...
  monthlyDay: number; // 1-31
  cronExpression?: string;
  ingestMode: 'upsert' | 'append' | 'replace';
  errorHandling: 'skip_and_continue' | 'halt';
};


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate Sample dummy values based on schema field type */
export function getSampleValueForField(fieldName: string, fieldType: string, index = 1): string {
  const name = fieldName.toLowerCase();
  if (name.includes('email')) {
    return index === 1 ? 'alex.morgan@acme.com' : index === 2 ? 'sam.smith@globex.org' : 'jordan.lee@initech.io';
  }
  if (name.includes('phone') || name.includes('mobile')) {
    return index === 1 ? '+1 415 555 0199' : index === 2 ? '+91 98765 43210' : '+44 20 7946 0912';
  }
  if (name.includes('first_name') || name === 'fname') {
    return index === 1 ? 'Alex' : index === 2 ? 'Sam' : 'Jordan';
  }
  if (name.includes('last_name') || name === 'lname') {
    return index === 1 ? 'Morgan' : index === 2 ? 'Smith' : 'Lee';
  }
  if (name.includes('city')) {
    return index === 1 ? 'San Francisco' : index === 2 ? 'Mumbai' : 'London';
  }
  if (name.includes('country')) {
    return index === 1 ? 'United States' : index === 2 ? 'India' : 'United Kingdom';
  }
  if (name.includes('state')) {
    return index === 1 ? 'California' : index === 2 ? 'Maharashtra' : 'Greater London';
  }
  if (name.includes('pincode') || name.includes('zip')) {
    return index === 1 ? '94105' : index === 2 ? '400001' : 'EC1A 1BB';
  }
  if (name.includes('dob') || name.includes('birth')) {
    return index === 1 ? '1992-04-15' : index === 2 ? '1988-11-23' : '1995-08-30';
  }
  if (name.includes('amount') || name.includes('price') || name.includes('total') || name.includes('balance')) {
    return index === 1 ? '1499.50' : index === 2 ? '349.00' : '2850.00';
  }
  if (name.includes('points')) {
    return index === 1 ? '1250' : index === 2 ? '450' : '3800';
  }
  if (name.includes('tier')) {
    return index === 1 ? 'Platinum' : index === 2 ? 'Gold' : 'Diamond';
  }
  if (name.includes('status')) {
    return 'active';
  }
  if (fieldType === 'boolean' || name.startsWith('is_') || name.startsWith('has_') || name.startsWith('consent_')) {
    return index === 1 ? 'TRUE' : index === 2 ? 'TRUE' : 'FALSE';
  }
  if (fieldType === 'number' || fieldType === 'integer') {
    return String(100 * index);
  }
  if (fieldType === 'date' || fieldType === 'timestamp') {
    return new Date(Date.now() - index * 86400000).toISOString().split('T')[0];
  }
  return `Sample_${fieldName}_${index}`;
}

/** Generate a downloadable CSV Sample template */
export function generateSampleCsvContent(schema: SchemaWithFields, numRows = 3): string {
  const fields = (schema.schema_fields ?? []).filter((f) => f.name !== 'id' && f.name !== 'tenant_id' && f.name !== 'environment');
  const headers = fields.map((f) => f.name);
  const rows: string[][] = [];

  for (let i = 1; i <= numRows; i++) {
    const row = fields.map((f) => getSampleValueForField(f.name, f.field_type, i));
    rows.push(row);
  }

  return Papa.unparse({
    fields: headers,
    data: rows,
  });
}

/** Download Sample CSV file directly to local machine */
export function downloadSampleCsvTemplate(schema: SchemaWithFields) {
  const csv = generateSampleCsvContent(schema, 3);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${schema.slug || 'schema'}_template_sample.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download Sample Excel (.xlsx) file directly to local machine */
export function downloadSampleExcelTemplate(schema: SchemaWithFields) {
  const fields = (schema.schema_fields ?? []).filter((f) => f.name !== 'id' && f.name !== 'tenant_id' && f.name !== 'environment');
  const headers = fields.map((f) => f.name);
  const data: Record<string, string>[] = [];

  for (let i = 1; i <= 3; i++) {
    const item: Record<string, string> = {};
    fields.forEach((f) => {
      item[f.name] = getSampleValueForField(f.name, f.field_type, i);
    });
    data.push(item);
  }

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, schema.name || 'Sample Data');

  XLSX.writeFile(wb, `${schema.slug || 'schema'}_template_sample.xlsx`);
}

/** Parse uploaded CSV or Excel File from Local Machine */
export async function parseUploadedFile(file: File): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  sheetNames?: string[];
  fileSizeFormatted: string;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fileSizeFormatted =
    file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : `${(file.size / 1024).toFixed(1)} KB`;

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetNames = workbook.SheetNames;
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
    const headers = rawData.length > 0 ? Object.keys(rawData[0]).map((h) => h.trim()).filter(Boolean) : [];

    return {
      headers,
      rows: rawData,
      rowCount: rawData.length,
      sheetNames,
      fileSizeFormatted,
    };
  }

  // Handle CSV / TSV text files
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const rawHeaders = results.meta.fields ?? [];
        const cleanHeaders = rawHeaders.map((h) => h.trim()).filter(Boolean);
        resolve({
          headers: cleanHeaders,
          rows: results.data,
          rowCount: results.data.length,
          fileSizeFormatted,
        });
      },
      error: (err) => reject(err),
    });
  });
}

/** Smart Auto-Header Mapping with Fuzzy Matching */
export function autoDetectColumnMapping(
  sourceHeaders: string[],
  schema: SchemaWithFields
): IngestMappingField[] {
  const fields = (schema.schema_fields ?? []).filter(
    (f) => f.name !== 'tenant_id' && f.name !== 'environment' && f.name !== 'deleted_at'
  );
  const normalizedSource = sourceHeaders.map((h) => ({
    raw: h,
    clean: h.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));

  return fields.map((f) => {
    const cleanTarget = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedHeader: string | null = null;
    let confidence = 0;

    // 1. Exact match
    const exact = normalizedSource.find((s) => s.clean === cleanTarget);
    if (exact) {
      matchedHeader = exact.raw;
      confidence = 100;
    } else {
      // 2. Common synonyms
      const synonyms: Record<string, string[]> = {
        email: ['email', 'emailaddress', 'mail', 'custemail', 'primaryemail', 'useremail'],
        mobile: ['mobile', 'phone', 'phonenumber', 'cell', 'cellphone', 'contactnumber', 'primaryphone', 'contact'],
        first_name: ['firstname', 'fname', 'first', 'givenname', 'name', 'customername'],
        last_name: ['lastname', 'lname', 'last', 'surname', 'familyname'],
        city: ['city', 'town', 'location', 'cityname'],
        country: ['country', 'countrycode', 'nation'],
        state: ['state', 'province', 'region'],
        pincode: ['pincode', 'zip', 'zipcode', 'postalcode', 'postal'],
        dob: ['dob', 'birthdate', 'dateofbirth', 'birthday'],
        id: ['id', 'custid', 'customerid', 'uid', 'identifier'],
      };

      const synList = synonyms[f.name] ?? [];
      const synMatch = normalizedSource.find((s) => synList.includes(s.clean));
      if (synMatch) {
        matchedHeader = synMatch.raw;
        confidence = 90;
      } else {
        // 3. Substring matching
        const subMatch = normalizedSource.find(
          (s) => s.clean.includes(cleanTarget) || cleanTarget.includes(s.clean)
        );
        if (subMatch && subMatch.clean.length >= 3) {
          matchedHeader = subMatch.raw;
          confidence = 70;
        }
      }
    }

    const isKey =
      Boolean(f.is_primary_key) ||
      f.name.toLowerCase() === 'id' ||
      f.name.toLowerCase() === 'email' ||
      f.name.toLowerCase().endsWith('_id') ||
      Boolean(f.references_schema_id);

    let typeCast: IngestMappingField['typeCast'] = 'string';
    if (f.field_type === 'number' || f.field_type === 'float') typeCast = 'number';
    else if (f.field_type === 'integer') typeCast = 'integer';
    else if (f.field_type === 'boolean') typeCast = 'boolean';
    else if (f.field_type === 'date' || f.field_type === 'timestamp') typeCast = 'date_iso';
    else if (f.field_type === 'json' || f.field_type === 'jsonb') typeCast = 'json';

    return {
      schemaField: f.name,
      sourceHeader: matchedHeader,
      fieldType: f.field_type,
      isKey,
      isRequired: Boolean(f.is_required),
      isPii: Boolean(f.is_pii),
      confidence,
      typeCast,
      transform: {
        trimWhitespace: true,
        caseFormat: f.name.includes('email') ? 'lowercase' : 'none',
        normalizePhone: f.name.includes('phone') || f.name.includes('mobile'),
        normalizeDate: f.field_type === 'date' || f.field_type === 'timestamp',
      },
    };
  });
}

/** Transform and Typecast a single row */
export function transformRow(
  rawRow: Record<string, unknown>,
  mappings: IngestMappingField[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  mappings.forEach((m) => {
    if (!m.sourceHeader) return;
    const rawVal = rawRow[m.sourceHeader];

    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
      if (m.transform.defaultValue !== undefined && m.transform.defaultValue !== '') {
        result[m.schemaField] = m.transform.defaultValue;
      } else {
        result[m.schemaField] = null;
      }
      return;
    }

    let val = String(rawVal);

    // Apply String Transformations
    if (m.transform.trimWhitespace) val = val.trim();
    if (m.transform.caseFormat === 'uppercase') val = val.toUpperCase();
    if (m.transform.caseFormat === 'lowercase') val = val.toLowerCase();
    if (m.transform.caseFormat === 'titlecase') {
      val = val
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    if (m.transform.normalizePhone) {
      val = val.replace(/[^0-9+]/g, '');
    }

    // Apply Type Casting
    if (m.typeCast === 'number' || m.typeCast === 'integer') {
      const num = Number(val.replace(/,/g, ''));
      result[m.schemaField] = isNaN(num) ? null : m.typeCast === 'integer' ? Math.round(num) : num;
    } else if (m.typeCast === 'boolean') {
      const lower = val.toLowerCase();
      result[m.schemaField] = lower === 'true' || lower === '1' || lower === 'yes' || lower === 't';
    } else if (m.typeCast === 'date_iso') {
      try {
        const d = new Date(val);
        result[m.schemaField] = isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      } catch {
        result[m.schemaField] = null;
      }
    } else if (m.typeCast === 'json') {
      try {
        result[m.schemaField] = JSON.parse(val);
      } catch {
        result[m.schemaField] = { value: val };
      }
    } else {
      result[m.schemaField] = val;
    }
  });

  return result;
}

/** Sanitize row for specific destination table schema constraints */
function sanitizeRowForTable(
  tableName: string,
  row: Record<string, unknown>,
  tenantId: string,
  environment: string
): Record<string, unknown> {
  const isCustomerTable = tableName === 'customers' || tableName.includes('customer');

  if (isCustomerTable) {
    const clean: Record<string, unknown> = {
      tenant_id: tenantId,
      environment,
      status: 'active',
    };

    // If ID is valid UUID, preserve; otherwise let postgres generate UUID
    if (row.id && typeof row.id === 'string' && UUID_REGEX.test(row.id)) {
      clean.id = row.id;
    }

    // Email cleaning
    if (row.email && typeof row.email === 'string' && row.email.includes('@')) {
      clean.email = row.email.trim().toLowerCase();
    }

    // Mobile cleaning
    if (row.mobile && typeof row.mobile === 'string') {
      const cleanMobile = row.mobile.trim();
      if (cleanMobile && !cleanMobile.includes('@')) {
        clean.mobile = cleanMobile;
      }
    }

    // Name splitting if full name mapped
    if (row.first_name) {
      clean.first_name = String(row.first_name).trim();
    } else if (row.name) {
      const parts = String(row.name).trim().split(' ');
      clean.first_name = parts[0] || 'Customer';
      if (parts.length > 1 && !row.last_name) {
        clean.last_name = parts.slice(1).join(' ');
      }
    }

    if (row.last_name) clean.last_name = String(row.last_name).trim();
    if (row.city) clean.city = String(row.city).trim();
    if (row.state) clean.state = String(row.state).trim();
    if (row.country) clean.country = String(row.country).trim();
    if (row.pincode) clean.pincode = String(row.pincode).trim();
    if (row.dob) clean.dob = row.dob;
    if (row.title) clean.title = String(row.title).trim();

    if (row.loyalty_member !== undefined && row.loyalty_member !== null) {
      clean.loyalty_member = Boolean(row.loyalty_member);
    }
    if (row.loyalty_points_balance !== undefined && row.loyalty_points_balance !== null) {
      clean.loyalty_points_balance = Number(row.loyalty_points_balance) || 0;
    }
    if (row.loyalty_tier_name) clean.loyalty_tier_name = String(row.loyalty_tier_name);

    return clean;
  }

  // Generic custom schema table
  return {
    ...row,
    tenant_id: tenantId,
    environment,
  };
}

/** Execute Ingestion into Supabase Target Table with True Application-Layer Upsert */
export async function executeFileIngestionBatch(
  tenantId: string,
  environment: string,
  schema: SchemaWithFields,
  rows: Record<string, unknown>[],
  mappings: IngestMappingField[],
  scheduleConfig: IngestionScheduleConfig,
  onProgress?: (percent: number, processed: number, total: number) => void
): Promise<{
  success: boolean;
  totalProcessed: number;
  insertedCount: number;
  errorCount: number;
  errorMessages: string[];
}> {
  const transformedRows = rows.map((r) => transformRow(r, mappings));
  const tableName = schema.table_name || 'customers';
  const total = transformedRows.length;
  let insertedCount = 0;
  let errorCount = 0;
  const errorMessages: string[] = [];

  const isCustomerTable = tableName === 'customers' || tableName.includes('customer');

  // If upsert mode, fetch existing lookup indices to update in-place without Postgres onConflict errors
  const existingByEmail = new Map<string, string>();
  const existingByMobile = new Map<string, string>();
  const existingById = new Map<string, string>();

  if (scheduleConfig.ingestMode === 'upsert' && isCustomerTable) {
    try {
      const { data: existingList } = await supabase
        .from('customers')
        .select('id, email, mobile')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .limit(10000);

      (existingList ?? []).forEach((c) => {
        if (c.id) existingById.set(c.id, c.id);
        if (c.email) existingByEmail.set(String(c.email).trim().toLowerCase(), c.id);
        if (c.mobile) {
          const cleanMob = String(c.mobile).replace(/[^0-9]/g, '');
          if (cleanMob.length >= 7) existingByMobile.set(cleanMob, c.id);
        }
      });
    } catch (err) {
      console.warn('Could not pre-fetch existing customers for upsert lookup:', err);
    }
  }

  const BATCH_SIZE = 25;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const rawBatch = transformedRows.slice(i, i + BATCH_SIZE);
    const batch = rawBatch.map((row) => sanitizeRowForTable(tableName, row, tenantId, environment));

    try {
      if (scheduleConfig.ingestMode === 'upsert' && isCustomerTable) {
        // Application-Level True Upsert: Update if matching email/mobile/id exists, otherwise Insert
        for (const item of batch) {
          try {
            const emailKey = item.email ? String(item.email).trim().toLowerCase() : null;
            const mobileKey = item.mobile ? String(item.mobile).replace(/[^0-9]/g, '') : null;
            const idKey = item.id ? String(item.id) : null;

            let existingId: string | undefined;
            if (idKey && existingById.has(idKey)) {
              existingId = existingById.get(idKey);
            } else if (emailKey && existingByEmail.has(emailKey)) {
              existingId = existingByEmail.get(emailKey);
            } else if (mobileKey && existingByMobile.has(mobileKey)) {
              existingId = existingByMobile.get(mobileKey);
            }

            if (existingId) {
              // UPDATE EXISTING RECORD IN-PLACE
              const { error: updErr } = await supabase
                .from('customers')
                .update({ ...item, updated_at: new Date().toISOString() })
                .eq('id', existingId)
                .eq('tenant_id', tenantId)
                .eq('environment', environment);

              if (updErr) throw updErr;
              insertedCount++;
            } else {
              // INSERT NEW RECORD
              const { data: inserted, error: insErr } = await supabase
                .from('customers')
                .insert(item)
                .select('id, email, mobile')
                .single();

              if (insErr) throw insErr;
              insertedCount++;

              // Register newly inserted record in memory cache so subsequent duplicate rows in the batch also update
              if (inserted?.id) {
                existingById.set(inserted.id, inserted.id);
                if (inserted.email) existingByEmail.set(String(inserted.email).trim().toLowerCase(), inserted.id);
                if (inserted.mobile) {
                  const mDigits = String(inserted.mobile).replace(/[^0-9]/g, '');
                  if (mDigits.length >= 7) existingByMobile.set(mDigits, inserted.id);
                }
              }
            }
          } catch (rowErr: unknown) {
            errorCount++;
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            if (errorMessages.length < 5) errorMessages.push(msg);
          }
        }
      } else {
        // Append or replace mode
        const { error: insErr } = await supabase.from(tableName).insert(batch);
        if (insErr) {
          for (const item of batch) {
            const { error: sErr } = await supabase.from(tableName).insert(item);
            if (sErr) {
              errorCount++;
              if (errorMessages.length < 5) errorMessages.push(sErr.message);
            } else {
              insertedCount++;
            }
          }
        } else {
          insertedCount += batch.length;
        }
      }
    } catch (err: unknown) {
      errorCount += batch.length;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errorMessages.length < 5) errorMessages.push(errMsg);
      if (scheduleConfig.errorHandling === 'halt') {
        break;
      }
    }

    if (onProgress) {
      const processed = Math.min(i + BATCH_SIZE, total);
      onProgress(Math.round((processed / total) * 100), processed, total);
    }
  }

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'data_ingestion',
    resourceId: schema.id,
    resourceName: `CSV/Excel Ingest to ${schema.name} (${insertedCount} records processed)`,
  });

  return {
    success: errorCount === 0 || insertedCount > 0,
    totalProcessed: total,
    insertedCount,
    errorCount,
    errorMessages,
  };
}

/** Save Connection as a reusable, scheduled Data Connector */
export async function saveConnectorConnection(
  tenantId: string,
  environment: string,
  name: string,
  schemaId: string,
  fileName: string,
  mappings: IngestMappingField[],
  schedule: IngestionScheduleConfig
) {
  const cron =
    schedule.mode === 'recurring'
      ? schedule.cadence === 'hourly'
        ? `0 * * * *`
        : schedule.cadence === 'daily'
        ? `${schedule.startTime.split(':')[1]} ${schedule.startTime.split(':')[0]} * * *`
        : schedule.cadence === 'weekly'
        ? `${schedule.startTime.split(':')[1]} ${schedule.startTime.split(':')[0]} * * ${schedule.weeklyDays.join(',')}`
        : schedule.cronExpression || '0 9 * * *'
      : null;

  const { data, error } = await supabase.from('connectors').insert({
    tenant_id: tenantId,
    environment,
    name,
    connector_type: 'csv_excel',
    direction: 'inbound',
    status: 'active',
    schedule_cron: cron,
    config: {
      source_type: 'local_file_upload',
      file_name: fileName,
      target_schema_id: schemaId,
      schedule,
    },
    mapping: mappings.map((m) => ({
      source_field: m.sourceHeader,
      target_field: m.schemaField,
      type_cast: m.typeCast,
      transforms: m.transform,
    })),
  }).select('id').single();

  if (error) throw error;
  return data;
}
