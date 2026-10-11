// ─── Automation Types ───────────────────────────────────────────────────────

export interface AutomationNode {
  id: string;
  type: 'trigger' | 'action' | 'logic' | 'ai' | 'transform';
  category: string;
  title: string;
  subtitle?: string;
  icon: string;
  color: string;
  config: Record<string, any>;
  x: number;
  y: number;
  width?: number;
  height?: number;
  lastInput?: Record<string, any>;
  lastOutput?: Record<string, any>;
  lastExecutionTimeMs?: number;
  lastStatus?: 'success' | 'failed' | 'skipped';
  disabled?: boolean;
  notes?: string;
}

export interface AutomationEdge {
  id: string;
  fromId: string;
  toId: string;
  fromHandle?: string;
  toHandle?: string;
  label?: string;
  animated?: boolean;
}

export interface AutomationWorkflow {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'draft' | 'paused' | 'error';
  version: number;
  triggerType: string;
  scheduleLabel?: string;
  updatedAt: string;
  createdAt: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  runsCount: number;
  successCount?: number;
  failCount?: number;
  lastRunStatus?: 'success' | 'failed' | 'running';
  lastRunAt?: string;
  tags?: string[];
}

export interface ConnectionCredential {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'disconnected';
  apiKey?: string;
  updatedAt: string;
  icon?: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'marbee_automation_workflows_v2';
const CONNECTIONS_KEY = 'marbee_automation_connections_v2';

export function getWorkflows(): AutomationWorkflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return SEED_WORKFLOWS;
}

export function saveWorkflows(workflows: AutomationWorkflow[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows)); } catch { /* empty */ }
}

export function getWorkflowById(id: string): AutomationWorkflow | undefined {
  return getWorkflows().find((w) => w.id === id);
}

export function saveWorkflow(workflow: AutomationWorkflow) {
  const list = getWorkflows();
  const idx = list.findIndex((w) => w.id === workflow.id);
  if (idx >= 0) list[idx] = { ...workflow, updatedAt: new Date().toISOString() };
  else list.push(workflow);
  saveWorkflows(list);
}

export function getConnections(): ConnectionCredential[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return SEED_CONNECTIONS;
}

export function saveConnections(connections: ConnectionCredential[]) {
  try { localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections)); } catch { /* empty */ }
}

// ─── Node palette ───────────────────────────────────────────────────────────

export const NODE_PALETTE = [
  {
    category: 'Triggers',
    items: [
      { title: 'Webhook', subtitle: 'Listen for incoming HTTP requests', icon: 'Globe', type: 'trigger' as const, color: 'emerald' },
      { title: 'Schedule', subtitle: 'Run on cron or interval', icon: 'Clock', type: 'trigger' as const, color: 'emerald' },
      { title: 'Form Submit', subtitle: 'On Marbee form submission', icon: 'FileInput', type: 'trigger' as const, color: 'emerald' },
      { title: 'Event', subtitle: 'On customer/system event', icon: 'Zap', type: 'trigger' as const, color: 'emerald' },
      { title: 'Stripe', subtitle: 'Payment & subscription events', icon: 'CreditCard', type: 'trigger' as const, color: 'emerald' },
      { title: 'Email Received', subtitle: 'Inbound email trigger', icon: 'Mail', type: 'trigger' as const, color: 'emerald' },
    ],
  },
  {
    category: 'Flow Control',
    items: [
      { title: 'If / Else', subtitle: 'Branch on condition', icon: 'GitBranch', type: 'logic' as const, color: 'amber' },
      { title: 'Switch', subtitle: 'Multi-way branch', icon: 'GitBranch', type: 'logic' as const, color: 'amber' },
      { title: 'Loop', subtitle: 'Iterate over items', icon: 'Repeat', type: 'logic' as const, color: 'amber' },
      { title: 'Wait', subtitle: 'Delay execution', icon: 'Timer', type: 'logic' as const, color: 'amber' },
      { title: 'Merge', subtitle: 'Combine branches', icon: 'Merge', type: 'logic' as const, color: 'amber' },
      { title: 'Error Handler', subtitle: 'Catch & handle errors', icon: 'ShieldAlert', type: 'logic' as const, color: 'amber' },
    ],
  },
  {
    category: 'AI',
    items: [
      { title: 'GPT-4o', subtitle: 'OpenAI reasoning & generation', icon: 'Sparkles', type: 'ai' as const, color: 'violet' },
      { title: 'Claude Sonnet', subtitle: 'Anthropic analysis & writing', icon: 'Wand2', type: 'ai' as const, color: 'violet' },
      { title: 'Classifier', subtitle: 'Categorize text into labels', icon: 'Tags', type: 'ai' as const, color: 'violet' },
      { title: 'Summarizer', subtitle: 'Condense long content', icon: 'FileText', type: 'ai' as const, color: 'violet' },
      { title: 'Sentiment', subtitle: 'Analyze tone & emotion', icon: 'Heart', type: 'ai' as const, color: 'violet' },
      { title: 'Embeddings', subtitle: 'Generate vector embeddings', icon: 'Braces', type: 'ai' as const, color: 'violet' },
    ],
  },
  {
    category: 'Transform',
    items: [
      { title: 'Code', subtitle: 'Run JavaScript / Python', icon: 'Code', type: 'transform' as const, color: 'cyan' },
      { title: 'Set Fields', subtitle: 'Map & rename fields', icon: 'Pencil', type: 'transform' as const, color: 'cyan' },
      { title: 'Filter', subtitle: 'Keep matching items', icon: 'Filter', type: 'transform' as const, color: 'cyan' },
      { title: 'Aggregate', subtitle: 'Group & summarize', icon: 'BarChart3', type: 'transform' as const, color: 'cyan' },
      { title: 'Split', subtitle: 'Split items into batches', icon: 'Scissors', type: 'transform' as const, color: 'cyan' },
      { title: 'HTML Parse', subtitle: 'Extract from HTML / XML', icon: 'FileCode', type: 'transform' as const, color: 'cyan' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { title: 'HTTP Request', subtitle: 'Call any REST API', icon: 'Globe', type: 'action' as const, color: 'blue' },
      { title: 'Send Email', subtitle: 'Via Resend / SES / SMTP', icon: 'Mail', type: 'action' as const, color: 'blue' },
      { title: 'Slack', subtitle: 'Post to channel or DM', icon: 'MessageSquare', type: 'action' as const, color: 'blue' },
      { title: 'WhatsApp', subtitle: 'Send template message', icon: 'MessageCircle', type: 'action' as const, color: 'blue' },
      { title: 'Customer DB', subtitle: 'Update Marbee profiles', icon: 'Database', type: 'action' as const, color: 'blue' },
      { title: 'Webhook Out', subtitle: 'POST to external URL', icon: 'Send', type: 'action' as const, color: 'blue' },
      { title: 'Google Sheets', subtitle: 'Read / write rows', icon: 'Sheet', type: 'action' as const, color: 'blue' },
      { title: 'Respond', subtitle: 'Return data to caller', icon: 'Reply', type: 'action' as const, color: 'blue' },
    ],
  },
];

// ─── Graph helpers ──────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 80;
const X_GAP = 280;
const Y_GAP = 130;

export function autoLayoutNodes(nodes: AutomationNode[], edges: AutomationEdge[]): AutomationNode[] {
  if (nodes.length === 0) return [];

  const inDegree: Record<string, number> = {};
  nodes.forEach((n) => (inDegree[n.id] = 0));
  edges.forEach((e) => { if (inDegree[e.toId] !== undefined) inDegree[e.toId]++; });

  const levels: Record<string, number> = {};
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  queue.forEach((id) => (levels[id] = 0));

  const visited = new Set<string>();
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const lvl = levels[cur] || 0;
    edges.filter((e) => e.fromId === cur).forEach((e) => {
      levels[e.toId] = Math.max(levels[e.toId] || 0, lvl + 1);
      queue.push(e.toId);
    });
  }

  const byLevel: Record<number, string[]> = {};
  nodes.forEach((n) => {
    const l = levels[n.id] || 0;
    (byLevel[l] ??= []).push(n.id);
  });

  return nodes.map((n) => {
    const l = levels[n.id] || 0;
    const items = byLevel[l] || [n.id];
    const idx = items.indexOf(n.id);
    return { ...n, x: 80 + l * X_GAP, y: 120 + idx * Y_GAP };
  });
}

export function getNodeCenter(node: AutomationNode): { x: number; y: number } {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

export function getOutputPos(node: AutomationNode, handle?: string): { x: number; y: number } {
  const base = { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
  if (handle === 'true') return { ...base, y: node.y + NODE_H * 0.3 };
  if (handle === 'false') return { ...base, y: node.y + NODE_H * 0.7 };
  return base;
}

export function getInputPos(node: AutomationNode): { x: number; y: number } {
  return { x: node.x, y: node.y + NODE_H / 2 };
}

export function buildBezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.abs(to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

// ─── Execution engine ───────────────────────────────────────────────────────

export function executeSingleNode(
  node: AutomationNode,
): { output: Record<string, any>; executionTimeMs: number; status: 'success' | 'failed' } {
  const start = performance.now();
  const t = node.title.toLowerCase();
  let output: Record<string, any> = {};

  if (t.includes('webhook')) {
    output = { event: 'webhook_received', method: node.config.method || 'POST', body: { email: 'user@example.com', plan: 'growth' }, receivedAt: new Date().toISOString() };
  } else if (t.includes('schedule')) {
    output = { event: 'schedule_fired', cron: node.config.cron || '0 8 * * 1-5', executedAt: new Date().toISOString() };
  } else if (t.includes('form')) {
    output = { event: 'form_submitted', formId: node.config.formId || 'form_lead', fields: { name: 'Alex', email: 'alex@brand.io' } };
  } else if (t.includes('event')) {
    output = { event: node.config.eventName || 'order_completed', customerId: 'cust_123', data: { orderId: 'ORD-456', amount: 1299 } };
  } else if (t.includes('stripe')) {
    output = { event: 'payment_intent.succeeded', amount: 49900, currency: 'usd', customer: 'cus_abc' };
  } else if (t.includes('if') || t.includes('switch')) {
    output = { result: true, branch: 'true', field: node.config.field || 'amount', value: 249.99 };
  } else if (t.includes('loop') || t.includes('each')) {
    output = { totalItems: 12, currentIndex: 0, item: { id: 'item_1', name: 'Product A' } };
  } else if (t.includes('wait') || t.includes('delay')) {
    output = { waited: `${node.config.duration || 5}s`, resumedAt: new Date().toISOString() };
  } else if (t.includes('merge')) {
    output = { mergedItems: 24, source: 'branch_a + branch_b' };
  } else if (t.includes('gpt') || t.includes('openai')) {
    output = { model: 'gpt-4o', tokens: 284, response: 'Customer represents a high-value lead. Recommended: VIP outreach sequence.', score: 94 };
  } else if (t.includes('claude') || t.includes('anthropic')) {
    output = { model: 'claude-sonnet-4', tokens: 310, response: 'Analysis complete. 88% satisfaction. High demand for automation features.' };
  } else if (t.includes('classif')) {
    output = { label: 'high_intent', confidence: 0.94, labels: ['high_intent', 'enterprise', 'demo_request'] };
  } else if (t.includes('summar')) {
    output = { summary: '3 key findings: (1) Growth in automation, (2) AI-first workflows, (3) Real-time processing.', wordCount: 42 };
  } else if (t.includes('sentiment')) {
    output = { sentiment: 'positive', score: 0.87, aspects: { product: 0.91, support: 0.82 } };
  } else if (t.includes('code')) {
    output = { result: { processed: true, count: 42 }, logs: ['Executed 12 lines', 'No errors'] };
  } else if (t.includes('set field') || t.includes('map')) {
    output = { mappedFields: { fullName: 'Alex Morgan', tier: 'VIP', score: 94 } };
  } else if (t.includes('filter')) {
    output = { kept: 8, removed: 4, total: 12 };
  } else if (t.includes('http')) {
    output = { status: 200, body: { success: true, data: { id: 'rec_123' } }, headers: { 'content-type': 'application/json' } };
  } else if (t.includes('email') || t.includes('mail')) {
    output = { messageId: `msg_${Date.now().toString(36)}`, to: node.config.to || 'user@example.com', delivered: true };
  } else if (t.includes('slack')) {
    output = { channel: node.config.channel || '#general', ts: '1725678291.000100', ok: true };
  } else if (t.includes('whatsapp')) {
    output = { messageId: `wa_${Date.now().toString(36)}`, to: node.config.phone || '+91 98765 43210', status: 'sent' };
  } else if (t.includes('customer db') || t.includes('marbee')) {
    output = { customerId: 'cust_123', action: node.config.action || 'upsert', updatedFields: { vip: true, points: 1750 } };
  } else if (t.includes('respond')) {
    output = { statusCode: 200, body: { success: true, message: 'Workflow completed' } };
  } else {
    output = { status: 'ok', nodeType: node.type, executedAt: new Date().toISOString() };
  }

  const ms = Math.round(performance.now() - start + Math.random() * 80 + 20);
  return { output, executionTimeMs: ms, status: 'success' };
}

// ─── Seed data ──────────────────────────────────────────────────────────────

const SEED_CONNECTIONS: ConnectionCredential[] = [
  { id: 'c1', name: 'OpenAI', provider: 'openai', status: 'connected', apiKey: 'sk-proj-•••88f1', updatedAt: '2026-09-01', icon: 'Sparkles' },
  { id: 'c2', name: 'Anthropic', provider: 'anthropic', status: 'connected', apiKey: 'sk-ant-•••a79e', updatedAt: '2026-09-02', icon: 'Wand2' },
  { id: 'c3', name: 'Resend', provider: 'resend', status: 'connected', apiKey: 're_929•••', updatedAt: '2026-09-05', icon: 'Mail' },
  { id: 'c4', name: 'Stripe', provider: 'stripe', status: 'connected', apiKey: 'whsec_•••', updatedAt: '2026-09-04', icon: 'CreditCard' },
  { id: 'c5', name: 'Slack', provider: 'slack', status: 'connected', apiKey: 'xoxb-•••', updatedAt: '2026-09-03', icon: 'MessageSquare' },
  { id: 'c6', name: 'Telegram', provider: 'telegram', status: 'disconnected', updatedAt: '2026-08-20', icon: 'Send' },
  { id: 'c7', name: 'Google Sheets', provider: 'google', status: 'connected', apiKey: 'OAuth', updatedAt: '2026-09-06', icon: 'Sheet' },
];

const SEED_WORKFLOWS: AutomationWorkflow[] = [
  {
    id: 'flow-morning-digest',
    title: 'Morning Tech Digest',
    description: 'Fetch HackerNews top stories, summarize with GPT-4o, format with Claude, email digest.',
    status: 'active',
    version: 3,
    triggerType: 'Schedule',
    scheduleLabel: 'Weekdays 8 AM',
    updatedAt: '2026-09-07T08:00:00Z',
    createdAt: '2026-09-01',
    runsCount: 42,
    successCount: 41,
    failCount: 1,
    lastRunStatus: 'success',
    lastRunAt: 'Today 8:00 AM',
    tags: ['content', 'ai', 'email'],
    nodes: [
      { id: 'n1', type: 'trigger', category: 'Triggers', title: 'Schedule', subtitle: 'Weekdays 8 AM', icon: 'Clock', color: 'emerald', config: { cron: '0 8 * * 1-5' }, x: 80, y: 180 },
      { id: 'n2', type: 'action', category: 'Actions', title: 'HTTP Request', subtitle: 'GET HackerNews API', icon: 'Globe', color: 'blue', config: { method: 'GET', url: 'https://hn.algolia.com/api/v1/search?tags=front_page' }, x: 360, y: 180 },
      { id: 'n3', type: 'logic', category: 'Flow Control', title: 'Loop', subtitle: 'Over top 10 stories', icon: 'Repeat', color: 'amber', config: { key: 'hits', limit: 10 }, x: 640, y: 180 },
      { id: 'n4', type: 'ai', category: 'AI', title: 'GPT-4o', subtitle: 'Summarize each story', icon: 'Sparkles', color: 'violet', config: { model: 'gpt-4o', prompt: 'Summarize in 3 bullets' }, x: 920, y: 120 },
      { id: 'n5', type: 'ai', category: 'AI', title: 'Claude Sonnet', subtitle: 'Format newsletter', icon: 'Wand2', color: 'violet', config: { model: 'claude-sonnet-4', prompt: 'Create HTML newsletter' }, x: 920, y: 280 },
      { id: 'n6', type: 'action', category: 'Actions', title: 'Send Email', subtitle: 'Via Resend', icon: 'Mail', color: 'blue', config: { to: 'team@company.com', subject: 'Daily Tech Digest' }, x: 1200, y: 280 },
    ],
    edges: [
      { id: 'e1', fromId: 'n1', toId: 'n2' },
      { id: 'e2', fromId: 'n2', toId: 'n3' },
      { id: 'e3', fromId: 'n3', toId: 'n4', fromHandle: 'each', label: 'each' },
      { id: 'e4', fromId: 'n3', toId: 'n5', fromHandle: 'done', label: 'done' },
      { id: 'e5', fromId: 'n5', toId: 'n6' },
    ],
  },
  {
    id: 'flow-lead-scoring',
    title: 'AI Lead Scoring Pipeline',
    description: 'Score inbound leads using GPT-4o, route high-value to Slack, update Marbee CRM.',
    status: 'active',
    version: 2,
    triggerType: 'Webhook',
    updatedAt: '2026-09-06T14:30:00Z',
    createdAt: '2026-09-03',
    runsCount: 156,
    successCount: 152,
    failCount: 4,
    lastRunStatus: 'success',
    lastRunAt: '2 hours ago',
    tags: ['crm', 'ai', 'sales'],
    nodes: [
      { id: 'n1', type: 'trigger', category: 'Triggers', title: 'Webhook', subtitle: 'POST /leads/inbound', icon: 'Globe', color: 'emerald', config: { method: 'POST', path: '/api/leads/inbound' }, x: 80, y: 200 },
      { id: 'n2', type: 'ai', category: 'AI', title: 'GPT-4o', subtitle: 'Score & classify lead', icon: 'Sparkles', color: 'violet', config: { model: 'gpt-4o', prompt: 'Score this lead 0-100' }, x: 360, y: 200 },
      { id: 'n3', type: 'logic', category: 'Flow Control', title: 'If / Else', subtitle: 'Score > 70?', icon: 'GitBranch', color: 'amber', config: { field: 'score', op: '>', value: 70 }, x: 640, y: 200 },
      { id: 'n4', type: 'action', category: 'Actions', title: 'Slack', subtitle: 'Alert #sales-hot', icon: 'MessageSquare', color: 'blue', config: { channel: '#sales-hot' }, x: 920, y: 120 },
      { id: 'n5', type: 'action', category: 'Actions', title: 'Customer DB', subtitle: 'Create lead profile', icon: 'Database', color: 'blue', config: { action: 'upsert' }, x: 920, y: 300 },
    ],
    edges: [
      { id: 'e1', fromId: 'n1', toId: 'n2' },
      { id: 'e2', fromId: 'n2', toId: 'n3' },
      { id: 'e3', fromId: 'n3', toId: 'n4', fromHandle: 'true', label: 'true' },
      { id: 'e4', fromId: 'n3', toId: 'n5', fromHandle: 'false', label: 'false' },
    ],
  },
  {
    id: 'flow-cart-recovery',
    title: 'Cart Abandonment Recovery',
    description: 'Detect abandoned carts, wait 30 min, send personalized WhatsApp + email with AI discount.',
    status: 'active',
    version: 1,
    triggerType: 'Event',
    updatedAt: '2026-09-05T10:00:00Z',
    createdAt: '2026-09-04',
    runsCount: 89,
    successCount: 85,
    failCount: 4,
    lastRunStatus: 'success',
    lastRunAt: '45 min ago',
    tags: ['commerce', 'recovery', 'ai'],
    nodes: [
      { id: 'n1', type: 'trigger', category: 'Triggers', title: 'Event', subtitle: 'cart_abandoned', icon: 'Zap', color: 'emerald', config: { eventName: 'cart_abandoned' }, x: 80, y: 200 },
      { id: 'n2', type: 'logic', category: 'Flow Control', title: 'If / Else', subtitle: 'Cart > ₹500?', icon: 'GitBranch', color: 'amber', config: { field: 'cart_total', op: '>', value: 500 }, x: 360, y: 200 },
      { id: 'n3', type: 'logic', category: 'Flow Control', title: 'Wait', subtitle: '30 minutes', icon: 'Timer', color: 'amber', config: { duration: 30, unit: 'minutes' }, x: 640, y: 140 },
      { id: 'n4', type: 'ai', category: 'AI', title: 'GPT-4o', subtitle: 'Generate offer copy', icon: 'Sparkles', color: 'violet', config: { prompt: 'Write recovery message with 10% discount' }, x: 920, y: 140 },
      { id: 'n5', type: 'action', category: 'Actions', title: 'WhatsApp', subtitle: 'Send recovery msg', icon: 'MessageCircle', color: 'blue', config: {}, x: 1200, y: 80 },
      { id: 'n6', type: 'action', category: 'Actions', title: 'Send Email', subtitle: 'Recovery email', icon: 'Mail', color: 'blue', config: {}, x: 1200, y: 220 },
    ],
    edges: [
      { id: 'e1', fromId: 'n1', toId: 'n2' },
      { id: 'e2', fromId: 'n2', toId: 'n3', fromHandle: 'true', label: 'high value' },
      { id: 'e3', fromId: 'n3', toId: 'n4' },
      { id: 'e4', fromId: 'n4', toId: 'n5' },
      { id: 'e5', fromId: 'n4', toId: 'n6' },
    ],
  },
];
