export type ConnectorMappingRow = {
  source_field: string;
  transform: string;
  target_schema: string;
  target_field: string;
  /** Wizard-only: an auto-suggested binding the user has not yet confirmed. */
  confirmed?: boolean;
};

export const TRANSFORM_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'uppercase', label: 'uppercase' },
  { value: 'trim', label: 'trim' },
  { value: 'e164', label: 'E.164 phone' },
  { value: 'date_iso', label: 'ISO date' },
  { value: 'json_parse', label: 'JSON parse' },
] as const;

export const CONNECTOR_TYPES = [
  { value: 'webhook', label: 'Webhook', direction: 'inbound' as const },
  { value: 'rest_api', label: 'REST API', direction: 'inbound' as const },
  { value: 'sftp', label: 'SFTP', direction: 'inbound' as const },
  { value: 'csv_upload', label: 'CSV Upload', direction: 'inbound' as const },
  { value: 'webhook_out', label: 'Webhook Out', direction: 'outbound' as const },
  { value: 'api_push', label: 'API Push', direction: 'outbound' as const },
];

export function emptyMappingRow(): ConnectorMappingRow {
  return { source_field: '', transform: '', target_schema: 'customer', target_field: '' };
}

export function applyTransform(value: unknown, transform: string): unknown {
  if (value == null || !transform) return value;
  const str = String(value);
  switch (transform) {
    case 'lowercase':
      return str.toLowerCase();
    case 'uppercase':
      return str.toUpperCase();
    case 'trim':
      return str.trim();
    case 'date_iso':
      return new Date(str).toISOString();
    case 'json_parse':
      return JSON.parse(str);
    default:
      return value;
  }
}
