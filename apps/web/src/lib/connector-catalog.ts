import {
  CONNECTOR_TYPE_META,
  type ConnectorDirection,
  type ConnectorTypeMeta,
} from './connector-meta';

/**
 * Marketplace catalogue model (Blueprint S-02).
 *
 * The catalogue is a superset of the connector types the engine can actually
 * run today (`CONNECTOR_TYPE_META`) plus a handful of SaaS entries that are
 * listed but not yet buildable — those carry `status: 'coming_soon'` and their
 * card shows a disabled action. Everything a card needs to be understood
 * *before* the user clicks — category, capabilities, auth methods — lives here.
 */

export type ConnectorCapability =
  | 'import'
  | 'export'
  | 'realtime'
  | 'incremental'
  | 'webhook'
  | 'oauth'
  | 'api';

export type ConnectorAuthMethod =
  | 'none'
  | 'api_key'
  | 'bearer'
  | 'basic'
  | 'oauth2'
  | 'db_credentials'
  | 'ssh_sftp'
  | 'signing_secret';

export type ConnectorCategory =
  | 'files'
  | 'crm'
  | 'marketing'
  | 'advertising'
  | 'analytics'
  | 'databases'
  | 'storage'
  | 'commerce'
  | 'support'
  | 'warehouses'
  | 'apis'
  | 'custom';

export type CatalogStatus = 'available' | 'coming_soon';

export type CatalogEntry = {
  type: string;
  label: string;
  description: string;
  direction: ConnectorDirection;
  category: ConnectorCategory;
  capabilities: ConnectorCapability[];
  authMethods: ConnectorAuthMethod[];
  status: CatalogStatus;
  popular?: boolean;
  /** Present when the engine can run this type (drives the wizard config step). */
  meta?: ConnectorTypeMeta;
};

export const CONNECTOR_CATEGORIES: { key: ConnectorCategory; label: string }[] = [
  { key: 'files', label: 'Files' },
  { key: 'crm', label: 'CRM' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'advertising', label: 'Advertising' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'databases', label: 'Databases' },
  { key: 'storage', label: 'Storage' },
  { key: 'commerce', label: 'Commerce' },
  { key: 'support', label: 'Support' },
  { key: 'warehouses', label: 'Warehouses' },
  { key: 'apis', label: 'APIs' },
  { key: 'custom', label: 'Custom' },
];

export const CAPABILITY_LABELS: Record<ConnectorCapability, string> = {
  import: 'Import',
  export: 'Export',
  realtime: 'Realtime',
  incremental: 'Incremental',
  webhook: 'Webhook',
  oauth: 'OAuth',
  api: 'API',
};

export const AUTH_METHOD_LABELS: Record<ConnectorAuthMethod, string> = {
  none: 'No auth',
  api_key: 'API key',
  bearer: 'Bearer token',
  basic: 'Basic auth',
  oauth2: 'OAuth 2.0',
  db_credentials: 'DB credentials',
  ssh_sftp: 'SSH / SFTP',
  signing_secret: 'Signing secret',
};

/** Per-runnable-type catalogue facets, keyed by `connector_type`. */
const RUNNABLE_FACETS: Record<
  string,
  {
    category: ConnectorCategory;
    capabilities: ConnectorCapability[];
    authMethods: ConnectorAuthMethod[];
  }
> = {
  csv_excel: {
    category: 'files',
    capabilities: ['import'],
    authMethods: ['none'],
  },
  csv_upload: {
    category: 'files',
    capabilities: ['import', 'incremental'],
    authMethods: ['none'],
  },
  webhook: {
    category: 'apis',
    capabilities: ['import', 'realtime', 'webhook'],
    authMethods: ['signing_secret'],
  },
  rest_api: {
    category: 'apis',
    capabilities: ['import', 'incremental', 'api'],
    authMethods: ['none', 'api_key', 'bearer', 'basic'],
  },
  sftp: {
    category: 'storage',
    capabilities: ['import', 'incremental'],
    authMethods: ['ssh_sftp', 'basic'],
  },
  database: {
    category: 'databases',
    capabilities: ['import', 'incremental'],
    authMethods: ['db_credentials'],
  },
  webhook_out: {
    category: 'apis',
    capabilities: ['export', 'realtime', 'webhook'],
    authMethods: ['signing_secret'],
  },
  api_push: {
    category: 'apis',
    capabilities: ['export', 'incremental', 'api'],
    authMethods: ['none', 'api_key', 'bearer'],
  },
};

/** Listed-but-not-yet-buildable SaaS connectors. */
const COMING_SOON: CatalogEntry[] = [
  {
    type: 'salesforce',
    label: 'Salesforce',
    description: 'Sync accounts, contacts, leads, and opportunities from Salesforce CRM.',
    direction: 'inbound',
    category: 'crm',
    capabilities: ['import', 'incremental', 'oauth', 'api'],
    authMethods: ['oauth2'],
    status: 'coming_soon',
    popular: true,
  },
  {
    type: 'hubspot',
    label: 'HubSpot',
    description: 'Contacts, companies, deals, and marketing events from HubSpot.',
    direction: 'inbound',
    category: 'marketing',
    capabilities: ['import', 'export', 'incremental', 'oauth', 'api'],
    authMethods: ['oauth2', 'api_key'],
    status: 'coming_soon',
    popular: true,
  },
  {
    type: 'google_sheets',
    label: 'Google Sheets',
    description: 'Treat a spreadsheet tab as a live table with scheduled refresh.',
    direction: 'inbound',
    category: 'files',
    capabilities: ['import', 'oauth'],
    authMethods: ['oauth2'],
    status: 'coming_soon',
  },
  {
    type: 'stripe',
    label: 'Stripe',
    description: 'Customers, subscriptions, invoices, and payment events.',
    direction: 'inbound',
    category: 'commerce',
    capabilities: ['import', 'realtime', 'webhook', 'incremental', 'api'],
    authMethods: ['api_key', 'signing_secret'],
    status: 'coming_soon',
    popular: true,
  },
  {
    type: 'shopify',
    label: 'Shopify',
    description: 'Orders, customers, and products from a Shopify storefront.',
    direction: 'inbound',
    category: 'commerce',
    capabilities: ['import', 'realtime', 'webhook', 'incremental', 'oauth'],
    authMethods: ['oauth2', 'api_key'],
    status: 'coming_soon',
  },
  {
    type: 'bigquery',
    label: 'BigQuery',
    description: 'Query a warehouse dataset and load results on a schedule.',
    direction: 'inbound',
    category: 'warehouses',
    capabilities: ['import', 'export', 'incremental'],
    authMethods: ['oauth2', 'api_key'],
    status: 'coming_soon',
  },
  {
    type: 'snowflake',
    label: 'Snowflake',
    description: 'Read from or write to a Snowflake warehouse table.',
    direction: 'inbound',
    category: 'warehouses',
    capabilities: ['import', 'export', 'incremental'],
    authMethods: ['basic', 'db_credentials'],
    status: 'coming_soon',
  },
  {
    type: 's3',
    label: 'Amazon S3',
    description: 'Ingest CSV / JSON / Parquet objects from an S3 prefix.',
    direction: 'inbound',
    category: 'storage',
    capabilities: ['import', 'incremental'],
    authMethods: ['api_key'],
    status: 'coming_soon',
  },
  {
    type: 'zendesk',
    label: 'Zendesk',
    description: 'Tickets, users, and organisations from Zendesk Support.',
    direction: 'inbound',
    category: 'support',
    capabilities: ['import', 'incremental', 'api'],
    authMethods: ['oauth2', 'api_key'],
    status: 'coming_soon',
  },
  {
    type: 'ga4',
    label: 'Google Analytics 4',
    description: 'Pull GA4 report data into a schema for blended reporting.',
    direction: 'inbound',
    category: 'analytics',
    capabilities: ['import', 'oauth', 'api'],
    authMethods: ['oauth2'],
    status: 'coming_soon',
  },
  {
    type: 'meta_ads',
    label: 'Meta Ads',
    description: 'Campaign, ad set, and ad performance from Meta Marketing API.',
    direction: 'inbound',
    category: 'advertising',
    capabilities: ['import', 'incremental', 'oauth', 'api'],
    authMethods: ['oauth2'],
    status: 'coming_soon',
  },
  {
    type: 'google_ads',
    label: 'Google Ads',
    description: 'Spend, clicks, and conversions from Google Ads reporting.',
    direction: 'inbound',
    category: 'advertising',
    capabilities: ['import', 'incremental', 'oauth', 'api'],
    authMethods: ['oauth2'],
    status: 'coming_soon',
  },
];

export const CONNECTOR_CATALOG: CatalogEntry[] = [
  ...CONNECTOR_TYPE_META.map((meta): CatalogEntry => {
    const facets = RUNNABLE_FACETS[meta.value] ?? {
      category: 'custom' as ConnectorCategory,
      capabilities: (meta.direction === 'inbound' ? ['import'] : ['export']) as ConnectorCapability[],
      authMethods: ['none'] as ConnectorAuthMethod[],
    };
    return {
      type: meta.value,
      label: meta.label,
      description: meta.description,
      direction: meta.direction,
      category: facets.category,
      capabilities: facets.capabilities,
      authMethods: facets.authMethods,
      status: 'available',
      popular: meta.popular,
      meta,
    };
  }),
  ...COMING_SOON,
];

export function catalogEntry(type: string | null | undefined): CatalogEntry | undefined {
  if (!type) return undefined;
  return CONNECTOR_CATALOG.find((c) => c.type === type);
}

export type CatalogFilter = {
  search: string;
  category: ConnectorCategory | 'all';
  capability: ConnectorCapability | 'all';
  auth: ConnectorAuthMethod | 'all';
  /** 'all' | 'connected' | 'not_connected' | 'draft' — needs `connectedTypes`. */
  connection: 'all' | 'connected' | 'not_connected' | 'draft';
};

export const DEFAULT_CATALOG_FILTER: CatalogFilter = {
  search: '',
  category: 'all',
  capability: 'all',
  auth: 'all',
  connection: 'all',
};

export function filterCatalog(
  entries: CatalogEntry[],
  filter: CatalogFilter,
  connectedTypes: Set<string>,
  draftTypes: Set<string>,
): CatalogEntry[] {
  const q = filter.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (q && !`${e.label} ${e.description} ${e.category}`.toLowerCase().includes(q)) return false;
    if (filter.category !== 'all' && e.category !== filter.category) return false;
    if (filter.capability !== 'all' && !e.capabilities.includes(filter.capability)) return false;
    if (filter.auth !== 'all' && !e.authMethods.includes(filter.auth)) return false;
    if (filter.connection === 'connected' && !connectedTypes.has(e.type)) return false;
    if (filter.connection === 'not_connected' && connectedTypes.has(e.type)) return false;
    if (filter.connection === 'draft' && !draftTypes.has(e.type)) return false;
    return true;
  });
}
