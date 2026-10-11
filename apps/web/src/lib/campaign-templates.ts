import type { Edge, Node } from 'reactflow';
import type { CampaignNodeData } from './campaign-graph';

function mkNode(
  id: string,
  stepType: string,
  label: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
  liveCount?: number,
): Node<CampaignNodeData> {
  return {
    id,
    type: 'campaignStep',
    position: { x, y },
    data: { label, stepType, config, liveCount },
  };
}

function mkEdge(id: string, source: string, target: string, sourceHandle?: string, label?: string): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    label,
    type: 'campaignThread',
    animated: false,
    style: {
      stroke: sourceHandle === 'no' ? '#f97316' : sourceHandle === 'yes' ? '#3b82f6' : '#94a3b8',
      strokeWidth: 2,
    },
  };
}

export function emptyCampaignCanvas(): { nodes: Node<CampaignNodeData>[]; edges: Edge[] } {
  return { nodes: [], edges: [] };
}

/** Adobe Campaign Classic–style workflow: Query → dedupe → email delivery */
export function workflowBlastTemplate(): { nodes: Node<CampaignNodeData>[]; edges: Edge[] } {
  const nodes: Node<CampaignNodeData>[] = [
    mkNode('query-1', 'query', 'Query', 60, 180, { query_source: 'schema', schema_slug: 'customer', quick_search: '' }),
    mkNode('dedupe-1', 'deduplication', 'Deduplication', 380, 180, { dedupe_field: 'email' }),
    mkNode('email-1', 'send_email', 'Email delivery', 700, 180, {
      delivery_name: 'August Newsletter',
      subject: 'Your monthly update',
    }),
  ];

  const edges: Edge[] = [
    mkEdge('we1', 'query-1', 'dedupe-1'),
    mkEdge('we2', 'dedupe-1', 'email-1'),
  ];

  return { nodes, edges };
}

/**
 * Clean starter graph for a new flow journey — Entry → Welcome message → Exit.
 * The redesigned Journey builder (`components/journeys/builder`) takes it from here.
 */
export function nurtureBlastTemplate(): { nodes: Node<CampaignNodeData>[]; edges: Edge[] } {
  const nodes: Node<CampaignNodeData>[] = [
    mkNode('entry', 'segment_entry', 'Audience entry', 80, 200, {
      audience_name: 'Nurture segment',
      audience_slug: 'email-reachable',
      re_entry: 'none',
    }),
    mkNode('welcome', 'send_email', 'Welcome message', 440, 200, {
      delivery_name: 'Welcome message',
      subject: 'Welcome aboard 👋',
    }),
    mkNode('exit', 'exit', 'Exit journey', 800, 200, { reason: 'completed' }),
  ];

  const edges: Edge[] = [
    mkEdge('e-entry-welcome', 'entry', 'welcome'),
    mkEdge('e-welcome-exit', 'welcome', 'exit'),
  ];

  return { nodes, edges };
}
