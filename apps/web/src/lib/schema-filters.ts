import {
  evaluateExpr,
  exprUsesFunction,
  formatExpr,
  inferExprType,
  type ExprNode,
} from '@/lib/schema-expressions';

export type FieldType = 'string' | 'number' | 'timestamp' | 'date' | 'enum' | 'json' | 'boolean' | 'uuid';

export type FilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export type FilterLogic = 'and' | 'or' | 'not' | 'except';

export type FilterCondition = {
  type: 'condition';
  id: string;
  /** How this rule connects to the previous one (first rule ignores this) */
  join?: FilterLogic;
  left: ExprNode;
  operator: FilterOperator;
  right: ExprNode;
};

export type FilterGroup = {
  type: 'group';
  id: string;
  logic: FilterLogic;
  /** How this group connects to the previous sibling at the parent level */
  join?: FilterLogic;
  children: FilterNode[];
};

export type FilterNode = FilterGroup | FilterCondition;

export type FilterRoot = FilterGroup;

export type SchemaFilterField = {
  key: string;
  label: string;
  type: FieldType;
  getValue: (row: Record<string, unknown>) => unknown;
  /** Group label for field pickers (e.g. raw fields vs transformed columns) */
  group?: string;
};

const STRING_OPS: FilterOperator[] = [
  'contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
];

const COMPARABLE_OPS: FilterOperator[] = [
  'equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty',
];

const ENUM_OPS: FilterOperator[] = ['equals', 'not_equals', 'is_empty', 'is_not_empty'];

export function operatorsForType(type: FieldType): FilterOperator[] {
  switch (type) {
    case 'timestamp':
    case 'date':
    case 'number':
      return COMPARABLE_OPS;
    case 'enum':
    case 'boolean':
      return ENUM_OPS;
    case 'json':
      return ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
    default:
      return STRING_OPS;
  }
}

export function operatorLabel(op: FilterOperator, type: FieldType): string {
  const date = type === 'timestamp' || type === 'date';
  const map: Record<FilterOperator, string> = {
    contains: 'contains',
    not_contains: 'does not contain',
    equals: 'equals',
    not_equals: 'does not equal',
    starts_with: 'starts with',
    ends_with: 'ends with',
    gt: date ? 'is after' : 'greater than',
    gte: date ? 'is on or after' : 'greater than or equal',
    lt: date ? 'is before' : 'less than',
    lte: date ? 'is on or before' : 'less than or equal',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
  };
  return map[op];
}

export function humanizeFieldName(name: string): string {
  const overrides: Record<string, string> = {
    fcm_token: 'FCM Token',
    ecid: 'ECID',
    customer_id: 'Customer ID',
    created_at: 'Created Date',
    updated_at: 'Updated Date',
    last_seen: 'Last Seen',
    token_invalidated_at: 'Token Invalidated At',
    event_type: 'Event Type',
    anonymous_id: 'Anonymous ID',
    permission_status: 'Permission Status',
    subscription_status: 'Subscription Status',
    customer_name: 'Customer Name',
    customer_email: 'Customer Email',
  };
  if (overrides[name]) return overrides[name];

  return name
    .replace(/_/g, ' ')
    .replace(/\bid\b/gi, 'ID')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function inferFieldType(name: string, fieldType?: string): FieldType {
  if (fieldType) {
    if (['timestamp', 'datetime'].includes(fieldType)) return 'timestamp';
    if (fieldType === 'date') return 'date';
    if (['uuid', 'id'].includes(fieldType)) return 'uuid';
    if (['int', 'integer', 'float', 'number', 'decimal'].includes(fieldType)) return 'number';
    if (fieldType === 'enum') return 'enum';
    if (fieldType === 'json') return 'json';
    if (fieldType === 'boolean') return 'boolean';
    if (['email', 'phone', 'string', 'text'].includes(fieldType)) return 'string';
  }

  if (name.endsWith('_at') || name === 'timestamp' || name === 'last_seen') return 'timestamp';
  if (name === 'dob') return 'date';
  if (name.endsWith('_id') || name === 'id') return 'uuid';
  if (name.includes('status') || name === 'gender' || name === 'channel') return 'enum';
  if (['consent', 'location', 'properties', 'metadata', 'config'].includes(name)) return 'json';
  return 'string';
}

export function buildFilterFields(
  columnKeys: string[],
  schemaFields: { name: string; field_type: string }[] | undefined,
  relationFields: SchemaFilterField[] = [],
): SchemaFilterField[] {
  const typeByName = new Map(schemaFields?.map((f) => [f.name, f.field_type]) ?? []);

  const base = columnKeys.map((key) => ({
    key,
    label: humanizeFieldName(key),
    type: inferFieldType(key, typeByName.get(key)),
    getValue: (row: Record<string, unknown>) => row[key],
  }));

  const seen = new Set(base.map((f) => f.key));
  for (const rel of relationFields) {
    if (!seen.has(rel.key)) base.push(rel);
  }

  return base.sort((a, b) => a.label.localeCompare(b.label));
}

export function createFilterRoot(): FilterRoot {
  return { type: 'group', id: crypto.randomUUID(), logic: 'and', children: [] };
}

export function createFilterGroup(logic: FilterLogic = 'and', join: FilterLogic = 'and'): FilterGroup {
  return { type: 'group', id: crypto.randomUUID(), logic, join, children: [] };
}

export function createFilterCondition(fields: SchemaFilterField[], join: FilterLogic = 'and'): FilterCondition {
  const field = fields[0]?.key ?? '';
  return {
    type: 'condition',
    id: crypto.randomUUID(),
    join,
    left: { kind: 'field', field },
    operator: 'contains',
    right: { kind: 'literal', value: '' },
  };
}

function isEmpty(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Align literal right-hand value with a string transform on the left (e.g. Lower → lowercase). */
function normalizeRightForLeftTransform(leftExpr: ExprNode, rightValue: string): string {
  if (leftExpr.kind !== 'func') return rightValue;

  switch (leftExpr.name) {
    case 'Lower':
      return rightValue.toLowerCase();
    case 'Upper':
      return rightValue.toUpperCase();
    case 'Trim':
    case 'Ltrim':
    case 'Rtrim':
      return rightValue.trim();
    case 'Smart':
      return rightValue.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return rightValue;
  }
}

function compareStringValues(
  leftRaw: unknown,
  rightRaw: unknown,
  operator: FilterOperator,
  leftExpr: ExprNode,
  rightExpr: ExprNode,
): boolean {
  let leftStr = toStr(leftRaw);
  let rightStr = toStr(rightRaw);

  const leftHasFn = exprUsesFunction(leftExpr);

  if (leftHasFn && !exprUsesFunction(rightExpr) && rightExpr.kind === 'literal') {
    rightStr = normalizeRightForLeftTransform(leftExpr, rightStr);
  } else if (!leftHasFn && !exprUsesFunction(rightExpr)) {
    leftStr = leftStr.toLowerCase();
    rightStr = rightStr.toLowerCase();
  }

  switch (operator) {
    case 'contains':
      return leftStr.includes(rightStr);
    case 'not_contains':
      return !leftStr.includes(rightStr);
    case 'starts_with':
      return leftStr.startsWith(rightStr);
    case 'ends_with':
      return leftStr.endsWith(rightStr);
    default:
      return true;
  }
}

export function previewFilterExpression(
  expr: ExprNode,
  row: Record<string, unknown>,
  fields: SchemaFilterField[],
): string {
  const value = evaluateExpr(expr, row, fields);
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toComparable(value: unknown, type: FieldType): number | string | null {
  if (isEmpty(value)) return null;
  if (type === 'timestamp' || type === 'date') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (type === 'number' || type === 'boolean') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return String(value).toLowerCase();
}

function toStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isStringOperator(operator: FilterOperator): boolean {
  return ['contains', 'not_contains', 'starts_with', 'ends_with'].includes(operator);
}

function resolveCompareType(
  operator: FilterOperator,
  leftType: FieldType,
  rightType: FieldType,
): FieldType {
  if (isStringOperator(operator)) return 'string';
  if (leftType === 'timestamp' || leftType === 'date') return leftType;
  if (leftType === 'number') return 'number';
  if (rightType === 'timestamp' || rightType === 'date') return rightType;
  return leftType;
}

function evaluateCondition(
  condition: FilterCondition,
  row: Record<string, unknown>,
  fields: SchemaFilterField[],
): boolean {
  const leftRaw = evaluateExpr(condition.left, row, fields);
  const leftType = inferExprType(condition.left, fields);
  const { operator } = condition;

  if (operator === 'is_empty') return isEmpty(leftRaw);
  if (operator === 'is_not_empty') return !isEmpty(leftRaw);

  const rightRaw = evaluateExpr(condition.right, row, fields);
  const rightType = inferExprType(condition.right, fields);
  const cmpType = resolveCompareType(operator, leftType, rightType);

  if (isStringOperator(operator)) {
    return compareStringValues(leftRaw, rightRaw, operator, condition.left, condition.right);
  }

  const left = toComparable(leftRaw, cmpType);
  const right = toComparable(rightRaw, cmpType);

  if (left == null) return false;

  const leftStr = String(left);
  const rightStr = right == null ? '' : String(right);

  switch (operator) {
    case 'contains':
      if (cmpType === 'json') return toStr(leftRaw).toLowerCase().includes(toStr(rightRaw).toLowerCase());
      return leftStr.includes(rightStr);
    case 'not_contains':
      if (cmpType === 'json') return !toStr(leftRaw).toLowerCase().includes(toStr(rightRaw).toLowerCase());
      return !leftStr.includes(rightStr);
    case 'equals':
      return leftStr === rightStr;
    case 'not_equals':
      return leftStr !== rightStr;
    case 'starts_with':
      return leftStr.startsWith(rightStr);
    case 'ends_with':
      return leftStr.endsWith(rightStr);
    case 'gt':
      return right != null && left > right;
    case 'gte':
      return right != null && left >= right;
    case 'lt':
      return right != null && left < right;
    case 'lte':
      return right != null && left <= right;
    default:
      return true;
  }
}

function conditionIsActive(condition: FilterCondition): boolean {
  if (['is_empty', 'is_not_empty'].includes(condition.operator)) return true;
  if (condition.right.kind === 'literal') return condition.right.value.trim().length > 0;
  if (condition.right.kind === 'field') return Boolean(condition.right.field);
  return true;
}

function nodeIsActive(node: FilterNode): boolean {
  if (node.type === 'condition') return conditionIsActive(node);
  return node.children.some(nodeIsActive);
}

export function countActiveFilterRules(root: FilterRoot): number {
  let count = 0;
  const walk = (nodes: FilterNode[]) => {
    for (const node of nodes) {
      if (node.type === 'condition' && conditionIsActive(node)) count += 1;
      else if (node.type === 'group') walk(node.children);
    }
  };
  walk(root.children);
  return count;
}

function evaluateNode(node: FilterNode, row: Record<string, unknown>, fields: SchemaFilterField[]): boolean {
  if (node.type === 'condition') return evaluateCondition(node, row, fields);
  return evaluateGroupInternal(node, row, fields);
}

function evaluateGroupInternal(group: FilterGroup, row: Record<string, unknown>, fields: SchemaFilterField[]): boolean {
  const active = group.children.filter(nodeIsActive);
  if (!active.length) return true;
  const isNegated = group.logic === 'not' || group.logic === 'except';
  const groupLogic = isNegated ? 'and' : group.logic;

  const results = active.map((child) => evaluateNode(child, row, fields));
  const raw = groupLogic === 'and' ? results.every(Boolean) : results.some(Boolean);
  return isNegated ? !raw : raw;
}

function evaluateSiblingList(
  children: FilterNode[],
  row: Record<string, unknown>,
  fields: SchemaFilterField[],
): boolean {
  const active = children.filter(nodeIsActive);
  if (!active.length) return true;

  const getFirstVal = (node: FilterNode) => {
    const isNeg = node.join === 'not' || node.join === 'except';
    const val = evaluateNode(node, row, fields);
    return isNeg ? !val : val;
  };

  let result = getFirstVal(active[0]);
  for (let i = 1; i < active.length; i++) {
    const child = active[i];
    const join = child.join ?? 'and';
    const val = evaluateNode(child, row, fields);

    if (join === 'or') {
      result = result || val;
    } else if (join === 'not' || join === 'except') {
      result = result && !val;
    } else {
      result = result && val;
    }
  }
  return result;
}

export function applyFilterRoot(
  rows: Record<string, unknown>[],
  root: FilterRoot,
  fields: SchemaFilterField[],
): Record<string, unknown>[] {
  if (!root.children.length) return rows;
  return rows.filter((row) => evaluateSiblingList(root.children, row, fields));
}

export function formatFilterRoot(root: FilterRoot, fields: SchemaFilterField[]): string {
  if (!root.children.length) return '';
  return formatSiblingList(root.children, fields);
}

function formatSiblingList(children: FilterNode[], fields: SchemaFilterField[]): string {
  return children
    .map((child, i) => {
      const body =
        child.type === 'condition'
          ? formatConditionBody(child, fields)
          : `( ${formatGroupInternal(child, fields)} )`;
      return i === 0 ? body : `${(child.join ?? 'and').toUpperCase()} ${body}`;
    })
    .join(' ');
}

function formatGroupInternal(group: FilterGroup, fields: SchemaFilterField[]): string {
  return group.children
    .map((child) =>
      child.type === 'condition'
        ? formatConditionBody(child, fields)
        : `( ${formatGroupInternal(child, fields)} )`,
    )
    .join(` ${group.logic.toUpperCase()} `);
}

function formatConditionBody(condition: FilterCondition, fields: SchemaFilterField[]): string {
  const leftType = inferExprType(condition.left, fields);
  const op = operatorLabel(condition.operator, leftType);
  const left = formatExpr(condition.left, fields);
  if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
    return `${left} ${op}`;
  }
  return `${left} ${op} ${formatExpr(condition.right, fields)}`;
}

/** Immutable tree update helpers */
export function updateFilterNode(
  root: FilterRoot,
  nodeId: string,
  updater: (node: FilterNode) => FilterNode,
): FilterRoot {
  return updateNodeInTree(root, nodeId, updater) as FilterRoot;
}

function updateNodeInTree(node: FilterNode, nodeId: string, updater: (node: FilterNode) => FilterNode): FilterNode {
  if (node.id === nodeId) return updater(node);

  if (node.type === 'group') {
    return {
      ...node,
      children: node.children.map((child) => updateNodeInTree(child, nodeId, updater)),
    };
  }

  return node;
}

export function removeFilterNode(root: FilterRoot, nodeId: string): FilterRoot {
  return pruneNode(root, nodeId) as FilterRoot;
}

function pruneNode(node: FilterNode, nodeId: string): FilterNode | null {
  if (node.id === nodeId) return null;

  if (node.type === 'group') {
    const children = node.children
      .map((child) => pruneNode(child, nodeId))
      .filter((c): c is FilterNode => c != null);
    return { ...node, children };
  }

  return node;
}

export function addChildToGroup(root: FilterRoot, groupId: string, child: FilterNode): FilterRoot {
  return updateFilterNode(root, groupId, (node) => {
    if (node.type !== 'group') return node;
    return { ...node, children: [...node.children, child] };
  });
}

export function findGroup(root: FilterRoot, groupId: string): FilterGroup | null {
  if (root.id === groupId) return root;
  for (const child of root.children) {
    if (child.type === 'group') {
      const found = findGroup(child as FilterRoot, groupId);
      if (found) return found;
    }
  }
  return null;
}

/** @deprecated use FilterRoot — kept for type migration */
export type FilterRule = FilterCondition;

export function applyFilterRules(
  rows: Record<string, unknown>[],
  root: FilterRoot,
  fields: SchemaFilterField[],
): Record<string, unknown>[] {
  return applyFilterRoot(rows, root, fields);
}
