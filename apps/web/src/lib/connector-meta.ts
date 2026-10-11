import {
  ArrowDownLeft,
  ArrowUpRight,
  CloudUpload,
  Database,
  FileSpreadsheet,
  Globe,
  Link2,
  Server,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { ConnectorMappingRow } from './connector-mapping';

export type ConnectorDirection = 'inbound' | 'outbound';

export type ConnectorTypeMeta = {
  value: string;
  label: string;
  direction: ConnectorDirection;
  description: string;
  icon: LucideIcon;
  accent: string;
  accentBg: string;
  popular?: boolean;
  configFields: ConfigFieldDef[];
};

export type ConfigFieldDef = {
  key: string;
  label: string;
  kind: 'text' | 'password' | 'number' | 'select' | 'textarea' | 'toggle';
  placeholder?: string;
  options?: { value: string; label: string }[];
  mono?: boolean;
};

export const CONNECTOR_TYPE_META: ConnectorTypeMeta[] = [
  {
    value: 'csv_excel',
    label: 'CSV / Excel File Load',
    direction: 'inbound',
    description: 'Ingest and map CSV, Excel (.xlsx, .xls), or TSV files from local machine into schema',
    icon: FileSpreadsheet,
    accent: '#4f46e5',
    accentBg: 'bg-indigo-500/10',
    popular: true,
    configFields: [
      { key: 'file_name', label: 'File name', kind: 'text', placeholder: 'customers_export.csv' },
      { key: 'source_type', label: 'Source Type', kind: 'text', placeholder: 'local_file_upload' },
    ],
  },
  {
    value: 'webhook',
    label: 'Webhook',
    direction: 'inbound',
    description: 'Receive JSON payloads via HTTP POST to a secure endpoint',
    icon: Webhook,
    accent: '#10b981',
    accentBg: 'bg-emerald-500/10',
    popular: true,
    configFields: [
      { key: 'endpoint_secret', label: 'Signing secret', kind: 'password', placeholder: 'whsec_…' },
      { key: 'auth_header', label: 'Auth header name', kind: 'text', placeholder: 'X-Webhook-Secret' },
      { key: 'payload_path', label: 'Records JSON path', kind: 'text', placeholder: 'data.records' },
    ],
  },
  {
    value: 'rest_api',
    label: 'REST API',
    direction: 'inbound',
    description: 'Pull data from external REST APIs with pagination',
    icon: Globe,
    accent: '#3b82f6',
    accentBg: 'bg-blue-500/10',
    popular: true,
    configFields: [
      { key: 'url', label: 'Base URL', kind: 'text', placeholder: 'https://api.example.com/v1/customers' },
      { key: 'method', label: 'HTTP method', kind: 'select', options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
      ]},
      { key: 'auth_type', label: 'Auth', kind: 'select', options: [
        { value: 'none', label: 'None' },
        { value: 'bearer', label: 'Bearer token' },
        { value: 'basic', label: 'Basic auth' },
        { value: 'api_key', label: 'API key header' },
      ]},
      { key: 'auth_token', label: 'Token / key', kind: 'password' },
      { key: 'headers', label: 'Extra headers (JSON)', kind: 'textarea', mono: true, placeholder: '{"Accept":"application/json"}' },
      { key: 'pagination', label: 'Pagination', kind: 'select', options: [
        { value: 'none', label: 'None' },
        { value: 'offset', label: 'Offset/limit' },
        { value: 'cursor', label: 'Cursor' },
        { value: 'page', label: 'Page number' },
      ]},
    ],
  },
  {
    value: 'sftp',
    label: 'SFTP',
    direction: 'inbound',
    description: 'Import files from SFTP servers on a schedule',
    icon: Server,
    accent: '#8b5cf6',
    accentBg: 'bg-violet-500/10',
    configFields: [
      { key: 'host', label: 'Host', kind: 'text', placeholder: 'sftp.example.com' },
      { key: 'port', label: 'Port', kind: 'number', placeholder: '22' },
      { key: 'username', label: 'Username', kind: 'text' },
      { key: 'password', label: 'Password', kind: 'password' },
      { key: 'remote_path', label: 'Remote path', kind: 'text', placeholder: '/exports/customers/*.csv' },
      { key: 'file_format', label: 'File format', kind: 'select', options: [
        { value: 'csv', label: 'CSV' },
        { value: 'json', label: 'JSON' },
        { value: 'parquet', label: 'Parquet' },
      ]},
    ],
  },
  {
    value: 'csv_upload',
    label: 'CSV Upload',
    direction: 'inbound',
    description: 'Manual or scheduled CSV file uploads to storage',
    icon: FileSpreadsheet,
    accent: '#f59e0b',
    accentBg: 'bg-amber-500/10',
    configFields: [
      { key: 'delimiter', label: 'Delimiter', kind: 'select', options: [
        { value: ',', label: 'Comma' },
        { value: ';', label: 'Semicolon' },
        { value: '\t', label: 'Tab' },
      ]},
      { key: 'has_header', label: 'Has header row', kind: 'toggle' },
      { key: 'encoding', label: 'Encoding', kind: 'select', options: [
        { value: 'utf-8', label: 'UTF-8' },
        { value: 'latin1', label: 'Latin-1' },
      ]},
      { key: 'storage_path', label: 'Storage path', kind: 'text', placeholder: 'imports/customers/' },
    ],
  },
  {
    value: 'database',
    label: 'Database',
    direction: 'inbound',
    description: 'Sync from PostgreSQL, MySQL, or other SQL databases',
    icon: Database,
    accent: '#06b6d4',
    accentBg: 'bg-cyan-500/10',
    configFields: [
      { key: 'driver', label: 'Driver', kind: 'select', options: [
        { value: 'postgres', label: 'PostgreSQL' },
        { value: 'mysql', label: 'MySQL' },
      ]},
      { key: 'connection_string', label: 'Connection string', kind: 'password', placeholder: 'postgresql://…' },
      { key: 'query', label: 'SQL query', kind: 'textarea', mono: true, placeholder: 'SELECT * FROM crm_customers' },
      { key: 'batch_size', label: 'Batch size', kind: 'number', placeholder: '500' },
    ],
  },
  {
    value: 'webhook_out',
    label: 'Webhook Out',
    direction: 'outbound',
    description: 'Push records to external webhook endpoints',
    icon: Link2,
    accent: '#ec4899',
    accentBg: 'bg-pink-500/10',
    configFields: [
      { key: 'url', label: 'Destination URL', kind: 'text', placeholder: 'https://hooks.example.com/marbee' },
      { key: 'method', label: 'Method', kind: 'select', options: [
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
      ]},
      { key: 'secret', label: 'Signing secret', kind: 'password' },
      { key: 'batch_size', label: 'Batch size', kind: 'number', placeholder: '50' },
    ],
  },
  {
    value: 'api_push',
    label: 'API Push',
    direction: 'outbound',
    description: 'Send transformed records to REST APIs',
    icon: CloudUpload,
    accent: '#6366f1',
    accentBg: 'bg-indigo-500/10',
    popular: true,
    configFields: [
      { key: 'url', label: 'API endpoint', kind: 'text', placeholder: 'https://api.example.com/contacts' },
      { key: 'method', label: 'Method', kind: 'select', options: [
        { value: 'POST', label: 'POST' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'PUT', label: 'PUT' },
      ]},
      { key: 'auth_type', label: 'Auth', kind: 'select', options: [
        { value: 'none', label: 'None' },
        { value: 'bearer', label: 'Bearer' },
        { value: 'api_key', label: 'API key' },
      ]},
      { key: 'auth_token', label: 'Credentials', kind: 'password' },
    ],
  },
];

export function connectorMeta(type: string): ConnectorTypeMeta | undefined {
  return CONNECTOR_TYPE_META.find((t) => t.value === type);
}

export function directionIcon(direction: ConnectorDirection) {
  return direction === 'inbound' ? ArrowDownLeft : ArrowUpRight;
}

export function directionLabel(direction: ConnectorDirection) {
  return direction === 'inbound' ? 'Inbound' : 'Outbound';
}

export function mappingPreview(mapping: ConnectorMappingRow[], max = 4): ConnectorMappingRow[] {
  return mapping.filter((m) => m.source_field && m.target_field).slice(0, max);
}

export function mappingSummary(mapping: ConnectorMappingRow[]): string {
  const valid = mapping.filter((m) => m.source_field && m.target_field);
  if (!valid.length) return 'No mappings configured';
  const schemas = [...new Set(valid.map((m) => m.target_schema))];
  return `${valid.length} field${valid.length === 1 ? '' : 's'} → ${schemas.join(', ')}`;
}

export function syncHealth(lastSync: string | null, status: string): 'healthy' | 'warning' | 'idle' | 'error' {
  if (status === 'error' || status === 'paused') return 'error';
  if (!lastSync) return 'idle';
  const hours = (Date.now() - new Date(lastSync).getTime()) / 3600000;
  if (hours > 48) return 'warning';
  return 'healthy';
}

export const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Weekly (Mon 3 AM)', value: '0 3 * * 1' },
  { label: 'Manual only', value: '' },
];

export const CONNECTOR_FEATURES = [
  { label: '7 connector types', desc: 'Webhook, REST, SFTP, CSV, DB, push' },
  { label: 'Test connections', desc: 'Validate before go-live' },
  { label: 'Link two systems', desc: 'Source → schema → target' },
  { label: 'Visual mapping', desc: 'Source → transform → schema field' },
];
