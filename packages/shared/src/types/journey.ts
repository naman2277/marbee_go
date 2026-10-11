export type JourneyStatus = 'draft' | 'published' | 'paused' | 'archived';

export type Journey = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  current_version_id: string | null;
  entry_trigger_config: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type JourneyVersion = {
  id: string;
  journey_id: string;
  version_number: number;
  canvas_json: Record<string, unknown>;
  published_at: string | null;
  published_by: string | null;
};

export type JourneyInstanceStatus = 'entered' | 'active' | 'waiting' | 'completed' | 'exited' | 'failed';

export type JourneyInstance = {
  id: string;
  journey_id: string;
  version_id: string;
  customer_id: string;
  status: JourneyInstanceStatus;
  current_node_id: string | null;
  entered_at: string;
  completed_at: string | null;
  context: Record<string, unknown>;
};

export type RealTimeTrigger = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  event_type: string;
  filters: Record<string, unknown>;
  channel: string;
  template_id: string | null;
  priority: number;
  is_transactional: boolean;
  status: string;
};

export const JOURNEY_NODE_TYPES = [
  'trigger',
  'condition',
  'wait',
  'send_web_push',
  'update_profile',
  'webhook',
  'exit',
] as const;

export type JourneyNodeType = (typeof JOURNEY_NODE_TYPES)[number];
