/** ERD model — built dynamically from schema metadata + FK fields */

export type ErdFieldPreview = {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  pii?: boolean;
};

export type ErdSchemaInput = {
  id?: string;
  slug: string;
  name?: string;
  table_name?: string | null;
  is_system?: boolean;
  status?: string;
  schema_fields?: Array<{
    name: string;
    field_type: string;
    is_primary_key?: boolean;
    is_pii?: boolean;
    is_indexed?: boolean;
    is_required?: boolean;
    references_schema_id?: string | null;
    references_field?: string | null;
  }>;
};

export type ErdGraphNode = {
  slug: string;
  label: string;
  table: string;
  x: number;
  y: number;
};

export type ErdGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  join: ErdJoinMeta;
};

export type ErdFieldTechMeta = {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isIndexed?: boolean;
  isRequired?: boolean;
  isPii?: boolean;
  isForeignKey?: boolean;
};

export type ErdTableTechMeta = {
  slug: string;
  label: string;
  table: string;
  primaryKeys: string[];
  indexedColumns: string[];
  foreignKeys: string[];
  fields: ErdFieldTechMeta[];
};

export type ErdJoinMeta = {
  id: string;
  from: string;
  to: string;
  label: string;
  sourceLabel: string;
  targetLabel: string;
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  fieldType: string;
  cardinality: 'many-to-one' | 'one-to-many';
  joinKind: 'foreign_key' | 'inferred' | 'platform';
  sqlJoin: string;
  postgrestHint: string;
  description: string;
  sourceField: ErdFieldTechMeta;
  targetField: ErdFieldTechMeta;
  sourceTableMeta: ErdTableTechMeta;
  targetTableMeta: ErdTableTechMeta;
  suggestedIndex: string;
};

export type ErdGraph = {
  nodes: ErdGraphNode[];
  edges: ErdGraphEdge[];
};

export type ErdSchemaMeta = {
  slug: string;
  name?: string;
  table_name?: string | null;
  fieldCount?: number;
  is_system?: boolean;
  status?: string;
  fields?: ErdFieldPreview[];
};

export type SchemaRelationship = {
  direction: 'outbound' | 'inbound';
  relatedSlug: string;
  relatedLabel: string;
  relatedTable: string;
  field: string;
  join?: ErdJoinMeta;
};

/** Fallback field previews when DB metadata isn't loaded */
export const ERD_KEY_FIELDS: Record<string, ErdFieldPreview[]> = {
  customer: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'first_name', type: 'string', pii: true },
    { name: 'last_name', type: 'string', pii: true },
    { name: 'email', type: 'email', pii: true },
    { name: 'loyalty_member', type: 'boolean' },
    { name: 'loyalty_points_balance', type: 'integer' },
    { name: 'status', type: 'enum' },
    { name: 'created_at', type: 'timestamp' },
  ],
  customer_identity: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'email', type: 'email', pii: true },
    { name: 'identity_type', type: 'enum' },
  ],
  events: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'event_type', type: 'string' },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'timestamp', type: 'timestamp' },
    { name: 'properties', type: 'json' },
  ],
  web_push_subscriber: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'fcm_token', type: 'string' },
    { name: 'subscription_status', type: 'enum' },
  ],
  engagement_log: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'channel', type: 'enum' },
    { name: 'event', type: 'enum' },
    { name: 'timestamp', type: 'timestamp' },
  ],
  delivery: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'channel', type: 'enum' },
    { name: 'status', type: 'enum' },
    { name: 'scheduled_at', type: 'timestamp' },
  ],
  exclusion: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'channel', type: 'enum' },
    { name: 'reason', type: 'string' },
  ],
  real_time_triggers: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'name', type: 'string' },
    { name: 'event_type', type: 'string' },
    { name: 'channel', type: 'enum' },
    { name: 'status', type: 'enum' },
  ],
  loyalty_programs: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'name', type: 'string' },
    { name: 'slug', type: 'string' },
    { name: 'status', type: 'string' },
  ],
  loyalty_members: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'program_id', type: 'uuid', fk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'points_balance', type: 'integer' },
    { name: 'status', type: 'string' },
  ],
  loyalty_offers: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'program_id', type: 'uuid', fk: true },
    { name: 'name', type: 'string' },
    { name: 'offer_type', type: 'string' },
    { name: 'status', type: 'string' },
  ],
  offer_decision_policies: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'name', type: 'string' },
    { name: 'placement', type: 'string' },
    { name: 'status', type: 'string' },
  ],
  social_posts: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'content', type: 'string' },
    { name: 'platforms', type: 'array' },
    { name: 'status', type: 'string' },
  ],
};

/** Known FK links when schema_fields lack references_schema_id */
const INFERRED_FK_FIELDS: Record<string, string> = {
  customer_id: 'customer',
  program_id: 'loyalty_programs',
  policy_id: 'offer_decision_policies',
  offer_id: 'loyalty_offers',
  member_id: 'loyalty_members',
};

const FALLBACK_GRAPH: ErdGraph = {
  nodes: [
    { slug: 'customer', label: 'Customer', table: 'customers', x: 420, y: 220 },
    { slug: 'customer_identity', label: 'Identity', table: 'customer_identities', x: 80, y: 60 },
    { slug: 'events', label: 'Events', table: 'events', x: 760, y: 60 },
    { slug: 'web_push_subscriber', label: 'pushSubscribers', table: 'pushSubscribers', x: 80, y: 380 },
    { slug: 'engagement_log', label: 'Engagement', table: 'engagement_log', x: 760, y: 380 },
    { slug: 'exclusion', label: 'Exclusion', table: 'exclusions', x: 80, y: 560 },
    { slug: 'delivery', label: 'Delivery', table: 'deliveries', x: 760, y: 560 },
    { slug: 'real_time_triggers', label: 'Triggers', table: 'real_time_triggers', x: 420, y: 560 },
    { slug: 'loyalty_programs', label: 'Loyalty Programs', table: 'loyalty_programs', x: 80, y: 220 },
    { slug: 'loyalty_members', label: 'Loyalty Members', table: 'loyalty_members', x: 420, y: 60 },
    { slug: 'loyalty_offers', label: 'Loyalty Offers', table: 'loyalty_offers', x: 760, y: 220 },
    { slug: 'offer_decision_policies', label: 'Offer Policies', table: 'offer_decision_policies', x: 420, y: 380 },
    { slug: 'social_posts', label: 'Social Posts', table: 'social_posts', x: 760, y: 560 },
  ],
  edges: [],
};

function extractTableTechMeta(schema: ErdSchemaInput): ErdTableTechMeta {
  const dbFields = schema.schema_fields ?? [];
  const keyFields = ERD_KEY_FIELDS[schema.slug] ?? [];
  const names = new Set([...dbFields.map((f) => f.name), ...keyFields.map((f) => f.name)]);

  const fields: ErdFieldTechMeta[] = [...names].map((name) => {
    const db = dbFields.find((f) => f.name === name);
    const key = keyFields.find((f) => f.name === name);
    return {
      name,
      type: db?.field_type ?? key?.type ?? 'string',
      isPrimaryKey: db?.is_primary_key ?? key?.pk,
      isIndexed: db?.is_indexed,
      isRequired: db?.is_required,
      isPii: db?.is_pii ?? key?.pii,
      isForeignKey: Boolean(db?.references_schema_id) || key?.fk,
    };
  });

  return {
    slug: schema.slug,
    label: schema.name ?? schema.slug,
    table: schema.table_name ?? schema.slug,
    primaryKeys: fields.filter((f) => f.isPrimaryKey).map((f) => f.name),
    indexedColumns: fields.filter((f) => f.isIndexed).map((f) => f.name),
    foreignKeys: fields.filter((f) => f.isForeignKey).map((f) => f.name),
    fields,
  };
}

function buildJoinMeta(
  fromSchema: ErdSchemaInput,
  toSchema: ErdSchemaInput,
  fieldName: string,
  fieldType: string,
  targetColumn: string,
  joinKind: ErdJoinMeta['joinKind'],
): ErdJoinMeta {
  const sourceTable = fromSchema.table_name ?? fromSchema.slug;
  const targetTable = toSchema.table_name ?? toSchema.slug;
  const sourceLabel = fromSchema.name ?? fromSchema.slug;
  const targetLabel = toSchema.name ?? toSchema.slug;
  const sourceTableMeta = extractTableTechMeta(fromSchema);
  const targetTableMeta = extractTableTechMeta(toSchema);

  const sourceField =
    sourceTableMeta.fields.find((f) => f.name === fieldName) ?? {
      name: fieldName,
      type: fieldType,
      isForeignKey: true,
    };

  const targetField =
    targetTableMeta.fields.find((f) => f.name === targetColumn) ?? {
      name: targetColumn,
      type: 'uuid',
      isPrimaryKey: targetColumn === 'id',
    };

  const fkIndexed = sourceField.isIndexed ? 'yes' : 'recommended';
  const suggestedIndex = `idx_${sourceTable}_${fieldName}`;

  return {
    id: `fk-${fromSchema.slug}-${toSchema.slug}-${fieldName}`,
    from: fromSchema.slug,
    to: toSchema.slug,
    label: fieldName,
    sourceLabel,
    targetLabel,
    sourceTable,
    targetTable,
    sourceColumn: fieldName,
    targetColumn,
    fieldType,
    cardinality: 'many-to-one',
    joinKind,
    sqlJoin: `INNER JOIN ${targetTable}\n  ON ${sourceTable}.${fieldName} = ${targetTable}.${targetColumn}`,
    postgrestHint: `${sourceTable}?select=*,${toSchema.slug}:${targetTable}!${fieldName}(*)`,
    description: `Each row in ${sourceTable} links to one ${targetTable} row via ${fieldName} → ${targetColumn}.`,
    sourceField,
    targetField,
    sourceTableMeta,
    targetTableMeta,
    suggestedIndex,
  };
}

function makeFallbackEdges(): ErdGraphEdge[] {
  const schemasBySlug = new Map(FALLBACK_GRAPH.nodes.map((n) => [n.slug, {
    slug: n.slug,
    name: n.label,
    table_name: n.table,
  } satisfies ErdSchemaInput]));

  const pairs: Array<[string, string, string, string]> = [
    ['customer_identity', 'customer', 'customer_id', 'uuid'],
    ['events', 'customer', 'customer_id', 'uuid'],
    ['web_push_subscriber', 'customer', 'customer_id', 'uuid'],
    ['engagement_log', 'customer', 'customer_id', 'uuid'],
    ['exclusion', 'customer', 'customer_id', 'uuid'],
    ['loyalty_members', 'customer', 'customer_id', 'uuid'],
    ['loyalty_members', 'loyalty_programs', 'program_id', 'uuid'],
    ['loyalty_offers', 'loyalty_programs', 'program_id', 'uuid'],
  ];

  return pairs.map(([from, to, field, type]) => {
    const fromSchema = schemasBySlug.get(from)!;
    const toSchema = schemasBySlug.get(to)!;
    const join = buildJoinMeta(fromSchema, toSchema, field, type, 'id', 'platform');
    return { id: join.id, from, to, label: field, join };
  });
}

FALLBACK_GRAPH.edges = makeFallbackEdges();

/** @deprecated Use buildErdGraph() — kept for any legacy imports */
export const ERD_SCHEMAS = FALLBACK_GRAPH.nodes.map((n) => ({
  id: n.slug,
  slug: n.slug,
  label: n.label,
  table: n.table,
  x: n.x,
  y: n.y,
}));

/** @deprecated Use buildErdGraph() */
export const ERD_RELATIONSHIPS = FALLBACK_GRAPH.edges.map((e) => ({
  id: e.id,
  from: e.from,
  to: e.to,
  label: e.label,
}));

function inferTargetSlug(
  fieldName: string,
  fieldType: string,
  schemas: ErdSchemaInput[],
): string | null {
  if (fieldType !== 'uuid' && !fieldName.endsWith('_id')) return null;
  if (!fieldName.endsWith('_id')) return null;

  const known = INFERRED_FK_FIELDS[fieldName];
  if (known && schemas.some((s) => s.slug === known)) return known;

  const base = fieldName.slice(0, -3);
  const slugs = schemas.map((s) => s.slug);

  if (slugs.includes(base)) return base;

  const plural = `${base}s`;
  if (slugs.includes(plural)) return plural;

  const suffixMatches = slugs.filter(
    (s) => s === base || s.endsWith(`_${base}`) || s.endsWith(`_${plural}`),
  );
  if (suffixMatches.length === 1) return suffixMatches[0];
  if (suffixMatches.length > 1) {
    const preferred = suffixMatches.find((s) => s.endsWith(`_${plural}`) || s.endsWith(`_${base}s`));
    return preferred ?? suffixMatches[0];
  }

  return null;
}

function collectEdges(schemas: ErdSchemaInput[]): ErdGraphEdge[] {
  const byId = new Map(schemas.filter((s) => s.id).map((s) => [s.id!, s]));
  const bySlug = new Map(schemas.map((s) => [s.slug, s]));
  const slugSet = new Set(schemas.map((s) => s.slug));
  const edges: ErdGraphEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (
    fromSchema: ErdSchemaInput,
    toSchema: ErdSchemaInput,
    fieldName: string,
    fieldType: string,
    targetColumn: string,
    joinKind: ErdJoinMeta['joinKind'],
  ) => {
    if (fromSchema.slug === toSchema.slug || !slugSet.has(toSchema.slug)) return;
    const key = `${fromSchema.slug}->${toSchema.slug}:${fieldName}`;
    if (seen.has(key)) return;
    seen.add(key);

    const join = buildJoinMeta(fromSchema, toSchema, fieldName, fieldType, targetColumn, joinKind);
    edges.push({ id: join.id, from: fromSchema.slug, to: toSchema.slug, label: fieldName, join });
  };

  for (const schema of schemas) {
    const dbFields = schema.schema_fields ?? [];
    const keyFields = ERD_KEY_FIELDS[schema.slug] ?? [];
    const fieldNames = new Set([...dbFields.map((f) => f.name), ...keyFields.map((f) => f.name)]);

    for (const fieldName of fieldNames) {
      const dbField = dbFields.find((f) => f.name === fieldName);
      const keyField = keyFields.find((f) => f.name === fieldName);
      const fieldType = dbField?.field_type ?? keyField?.type ?? 'uuid';

      let targetSlug: string | null = null;
      let targetColumn = dbField?.references_field ?? 'id';
      let joinKind: ErdJoinMeta['joinKind'] = 'inferred';

      if (dbField?.references_schema_id) {
        const ref = byId.get(dbField.references_schema_id);
        targetSlug = ref?.slug ?? null;
        joinKind = 'foreign_key';
      }

      if (!targetSlug && (keyField?.fk || fieldName.endsWith('_id'))) {
        targetSlug = inferTargetSlug(fieldName, fieldType, schemas);
      }

      if (!targetSlug) continue;

      const toSchema = bySlug.get(targetSlug);
      if (!toSchema) continue;

      if (joinKind === 'inferred' && dbField?.references_schema_id) {
        joinKind = 'foreign_key';
      } else if (joinKind === 'inferred' && keyField?.fk && !dbField?.references_schema_id) {
        joinKind = 'platform';
      }

      addEdge(schema, toSchema, fieldName, fieldType, targetColumn, joinKind);
    }
  }

  return edges;
}

function layoutNodes(slugs: string[], edges: ErdGraphEdge[], focusSlug?: string): Map<string, { x: number; y: number }> {
  const NODE_W = 300;
  const NODE_H = 200;
  const GAP_X = 80;
  const GAP_Y = 64;

  if (focusSlug && slugs.includes(focusSlug)) {
    const related = new Set<string>([focusSlug]);
    for (const edge of edges) {
      if (edge.from === focusSlug) related.add(edge.to);
      if (edge.to === focusSlug) related.add(edge.from);
    }

    const positions = new Map<string, { x: number; y: number }>();
    const centerX = 480;
    const centerY = 360;

    positions.set(focusSlug, { x: centerX - NODE_W / 2, y: centerY - NODE_H / 2 });

    const others = [...related].filter((s) => s !== focusSlug);
    const count = Math.max(others.length, 1);
    const radius = Math.max(420, 160 + count * 48);

    others.forEach((slug, index) => {
      const angle = (2 * Math.PI * index) / count - Math.PI / 2;
      positions.set(slug, {
        x: centerX + radius * Math.cos(angle) - NODE_W / 2,
        y: centerY + radius * Math.sin(angle) - NODE_H / 2,
      });
    });

    let orphanY = 620;
    let orphanX = 40;
    for (const slug of slugs) {
      if (positions.has(slug)) continue;
      positions.set(slug, { x: orphanX, y: orphanY });
      orphanX += NODE_W + GAP_X;
      if (orphanX > 900) {
        orphanX = 40;
        orphanY += NODE_H + GAP_Y;
      }
    }

    return positions;
  }

  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();

  for (const slug of slugs) {
    children.set(slug, new Set());
    parents.set(slug, new Set());
  }

  for (const edge of edges) {
    if (!children.has(edge.from) || !parents.has(edge.to)) continue;
    children.get(edge.from)!.add(edge.to);
    parents.get(edge.to)!.add(edge.from);
  }

  const roots = slugs.filter((s) => parents.get(s)!.size === 0);
  const start =
    (focusSlug && slugs.includes(focusSlug) ? focusSlug : null) ??
    (slugs.includes('customer') ? 'customer' : null) ??
    roots[0] ??
    slugs[0];

  const level = new Map<string, number>();
  const queue: string[] = start ? [start] : [];
  if (start) level.set(start, 0);

  while (queue.length) {
    const cur = queue.shift()!;
    const curLevel = level.get(cur)!;
    for (const child of children.get(cur) ?? []) {
      if (!level.has(child)) {
        level.set(child, curLevel + 1);
        queue.push(child);
      }
    }
    for (const parent of parents.get(cur) ?? []) {
      if (!level.has(parent)) {
        level.set(parent, curLevel + 1);
        queue.push(parent);
      }
    }
  }

  let maxLevel = level.size ? Math.max(...level.values()) : 0;
  for (const slug of slugs) {
    if (!level.has(slug)) {
      maxLevel += 1;
      level.set(slug, maxLevel);
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const slug of slugs) {
    const l = level.get(slug)!;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(slug);
  }

  for (const [, group] of byLevel) {
    group.sort((a, b) => a.localeCompare(b));
  }

  const positions = new Map<string, { x: number; y: number }>();
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  let y = 60;

  for (const l of sortedLevels) {
    const group = byLevel.get(l)!;
    const rowWidth = group.length * NODE_W + Math.max(0, group.length - 1) * GAP_X;
    let x = Math.max(40, (1100 - rowWidth) / 2);

    for (const slug of group) {
      positions.set(slug, { x, y });
      x += NODE_W + GAP_X;
    }
    y += NODE_H + GAP_Y;
  }

  return positions;
}

export function buildErdGraph(schemas?: ErdSchemaInput[], focusSlug?: string): ErdGraph {
  if (!schemas?.length) return FALLBACK_GRAPH;

  const edges = collectEdges(schemas);
  const slugSet = new Set(schemas.map((s) => s.slug));

  for (const fallbackEdge of FALLBACK_GRAPH.edges) {
    if (!slugSet.has(fallbackEdge.from) || !slugSet.has(fallbackEdge.to)) continue;
    const exists = edges.some(
      (e) => e.from === fallbackEdge.from && e.to === fallbackEdge.to && e.label === fallbackEdge.label,
    );
    if (!exists) {
      const fromSchema = schemas.find((s) => s.slug === fallbackEdge.from);
      const toSchema = schemas.find((s) => s.slug === fallbackEdge.to);
      if (fromSchema && toSchema) {
        const join = buildJoinMeta(
          fromSchema,
          toSchema,
          fallbackEdge.label,
          fallbackEdge.join.fieldType,
          fallbackEdge.join.targetColumn,
          'platform',
        );
        edges.push({ id: join.id, from: fallbackEdge.from, to: fallbackEdge.to, label: fallbackEdge.label, join });
      }
    }
  }

  const positions = layoutNodes([...slugSet], edges, focusSlug);

  const nodes: ErdGraphNode[] = schemas.map((s) => {
    const pos = positions.get(s.slug) ?? { x: 0, y: 0 };
    return {
      slug: s.slug,
      label: s.name ?? s.slug,
      table: s.table_name ?? s.slug,
      x: pos.x,
      y: pos.y,
    };
  });

  return { nodes, edges };
}

export function resolveErdFields(
  slug: string,
  dbFields?: Array<{
    name: string;
    field_type: string;
    is_primary_key?: boolean;
    is_pii?: boolean;
    references_schema_id?: string | null;
  }>,
  allSchemas?: ErdSchemaInput[],
): ErdFieldPreview[] {
  if (dbFields?.length) {
    const graph = allSchemas ? buildErdGraph(allSchemas) : null;
    const outbound = new Set(
      graph?.edges.filter((e) => e.from === slug).map((e) => e.label) ?? [],
    );

    return dbFields.slice(0, 8).map((f) => ({
      name: f.name,
      type: f.field_type,
      pk: f.is_primary_key,
      pii: f.is_pii,
      fk:
        Boolean(f.references_schema_id) ||
        outbound.has(f.name) ||
        Boolean(ERD_KEY_FIELDS[slug]?.find((k) => k.name === f.name)?.fk),
    }));
  }
  return ERD_KEY_FIELDS[slug] ?? [];
}

export function buildErdSchemaMeta(schemas?: ErdSchemaInput[]): ErdSchemaMeta[] {
  const graph = buildErdGraph(schemas);
  return graph.nodes.map((node) => {
    const db = schemas?.find((s) => s.slug === node.slug);
    const dbFields = db?.schema_fields;
    return {
      slug: node.slug,
      name: db?.name ?? node.label,
      table_name: db?.table_name ?? node.table,
      fieldCount: dbFields?.length ?? ERD_KEY_FIELDS[node.slug]?.length ?? 0,
      is_system: db?.is_system ?? true,
      status: db?.status,
      fields: resolveErdFields(node.slug, dbFields, schemas),
    };
  });
}

export function getRelatedSchemaSlugs(slug: string, schemas?: ErdSchemaInput[]): string[] {
  const graph = buildErdGraph(schemas);
  if (!graph.nodes.some((n) => n.slug === slug)) return [slug];

  const related = new Set<string>([slug]);
  for (const edge of graph.edges) {
    if (edge.from === slug) related.add(edge.to);
    if (edge.to === slug) related.add(edge.from);
  }
  return [...related];
}

export function getRelationshipsForSlug(slug: string, schemas?: ErdSchemaInput[]): SchemaRelationship[] {
  const graph = buildErdGraph(schemas);
  const nodeBySlug = new Map(graph.nodes.map((n) => [n.slug, n]));
  if (!nodeBySlug.has(slug)) return [];

  const results: SchemaRelationship[] = [];

  for (const edge of graph.edges) {
    if (edge.from === slug) {
      const target = nodeBySlug.get(edge.to);
      if (target) {
        results.push({
          direction: 'outbound',
          relatedSlug: target.slug,
          relatedLabel: target.label,
          relatedTable: target.table,
          field: edge.label,
          join: edge.join,
        });
      }
    }
    if (edge.to === slug) {
      const source = nodeBySlug.get(edge.from);
      if (source) {
        results.push({
          direction: 'inbound',
          relatedSlug: source.slug,
          relatedLabel: source.label,
          relatedTable: source.table,
          field: edge.label,
          join: edge.join,
        });
      }
    }
  }

  return results;
}

export function getSchemaIconKey(slug: string): 'customer' | 'identity' | 'events' | 'engagement' | 'delivery' | 'exclusion' | 'push' | 'triggers' | 'loyalty' | 'offers' | 'social' | 'default' {
  if (slug === 'customer') return 'customer';
  if (slug.includes('identity')) return 'identity';
  if (slug.includes('event')) return 'events';
  if (slug.includes('engagement')) return 'engagement';
  if (slug.includes('delivery')) return 'delivery';
  if (slug.includes('exclusion')) return 'exclusion';
  if (slug.includes('push')) return 'push';
  if (slug.includes('trigger')) return 'triggers';
  if (slug.includes('loyalty') || slug.includes('offer') || slug.includes('tier')) return 'loyalty';
  if (slug.includes('social')) return 'social';
  return 'default';
}

export function edgeHandles(
  source: { x: number; y: number },
  target: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (Math.abs(dx) > Math.abs(dy) * 0.6) {
    return dx > 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }

  return dy > 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

export const FIELD_TYPES = [
  'string',
  'email',
  'phone',
  'uuid',
  'number',
  'boolean',
  'date',
  'timestamp',
  'enum',
  'json',
] as const;

export type SchemaFieldType = (typeof FIELD_TYPES)[number];
