/** Seed graph + models for the /dev/journey-studio harness (in-memory, no Supabase). */
import type { Edge, Node } from 'reactflow';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import {
  defaultJourneySettings,
  mkActivityNode,
  mkJourneyEdge,
  serializeJourneyGraph,
  type EntryConfig,
  type JourneySettings,
} from '@/lib/journey-builder';

const nodes: Node<CampaignNodeData>[] = [
  mkActivityNode('entry', 'segment_entry', 'Audience entry', 80, 240, {
    audience_slug: 'email-reachable',
    audience_name: 'Email reachable',
    re_entry: 'none',
  }),
  mkActivityNode('welcome', 'send_email', 'Welcome email', 420, 240, {
    delivery_name: 'Welcome email',
    subject: 'Welcome aboard 👋',
  }),
  mkActivityNode('wait', 'wait_duration', 'Wait 2 days', 760, 240, {
    duration_value: 2,
    duration_unit: 'days',
  }),
  mkActivityNode('clicked', 'condition_clicked', 'Clicked welcome?', 1100, 240, {
    delivery_ref: 'Welcome email',
    within_hours: 168,
  }),
  mkActivityNode('nudge', 'send_email', 'Reminder email', 1440, 400, {
    delivery_name: 'Reminder email',
    subject: 'Still interested?',
  }),
  mkActivityNode('exit', 'exit', 'Exit journey', 1440, 100, { reason: 'engaged' }),
];

const edges: Edge[] = [
  mkJourneyEdge('e-entry-welcome', 'entry', 'welcome'),
  mkJourneyEdge('e-welcome-wait', 'welcome', 'wait'),
  mkJourneyEdge('e-wait-clicked', 'wait', 'clicked'),
  mkJourneyEdge('e-clicked-exit', 'clicked', 'exit', 'yes', 'Yes'),
  mkJourneyEdge('e-clicked-nudge', 'clicked', 'nudge', 'no', 'No'),
];

export const DEV_JOURNEY_CANVAS = serializeJourneyGraph(nodes, edges);

export const DEV_JOURNEY_ENTRY: EntryConfig = {
  sourceType: 'audience',
  audienceSlug: 'email-reachable',
  audienceName: 'Email reachable',
  reEntry: 'none',
  extraFilter: null,
  schedule: { mode: 'one_time', timezone: 'Asia/Kolkata', startsAt: null, endsAt: null },
};

export const DEV_JOURNEY_SETTINGS: JourneySettings = defaultJourneySettings();
