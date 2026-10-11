import type { LucideIcon } from 'lucide-react';
import { CAMPAIGN_ICONS, CAMPAIGN_PALETTE } from './campaign-nodes';
import { resolveJourneyDisplayStatus, type JourneyRow } from './journeys';

export type JourneyChannelStatus = 'draft' | 'published' | 'scheduled' | 'started' | 'finished';

export type JourneyChannelInfo = {
  type: string;
  label: string;
  nodeId: string;
  deliveryName?: string;
  status: JourneyChannelStatus;
};

const paletteByType = new Map(CAMPAIGN_PALETTE.map((item) => [item.type, item]));

type CanvasNode = {
  id: string;
  type?: string;
  data?: {
    stepType?: string;
    label?: string;
    deliveryName?: string;
    name?: string;
    config?: { delivery_name?: string; subject?: string };
  };
};

export function extractJourneyChannels(canvasJson: unknown): Omit<JourneyChannelInfo, 'status'>[] {
  const nodes =
    (canvasJson as { nodes?: CanvasNode[] } | null | undefined)?.nodes ?? [];
  const channels: Omit<JourneyChannelInfo, 'status'>[] = [];

  for (const node of nodes) {
    const type = node.data?.stepType ?? node.type ?? '';
    if (!type.startsWith('send_')) continue;
    const def = paletteByType.get(type);
    channels.push({
      type,
      label: def?.label ?? type.replace(/^send_/, '').replace(/_/g, ' '),
      nodeId: node.id,
      deliveryName:
        node.data?.config?.delivery_name ??
        node.data?.deliveryName ??
        node.data?.label ??
        node.data?.name,
    });
  }

  return channels;
}

export function enrichChannelsWithStatus(
  channels: Omit<JourneyChannelInfo, 'status'>[],
  journey: Pick<JourneyRow, 'status' | 'starts_at' | 'ends_at' | 'settings'>,
): JourneyChannelInfo[] {
  const displayStatus = resolveJourneyDisplayStatus(journey);
  const channelStatus: JourneyChannelStatus =
    displayStatus === 'finished'
      ? 'finished'
      : displayStatus === 'scheduled'
        ? 'scheduled'
        : displayStatus === 'started'
          ? 'started'
          : journey.status === 'published'
            ? 'published'
            : 'draft';

  return channels.map((channel) => ({ ...channel, status: channelStatus }));
}

export function channelIconForType(type: string): LucideIcon {
  const def = paletteByType.get(type);
  if (!def) return CAMPAIGN_ICONS.mail;
  return CAMPAIGN_ICONS[def.icon] ?? CAMPAIGN_ICONS.mail;
}

export function journeyChannelsFromRow(journey: JourneyRow): JourneyChannelInfo[] {
  const version = journey.journey_versions?.[0];
  return enrichChannelsWithStatus(extractJourneyChannels(version?.canvas_json), journey);
}

export function uniqueChannelsByType(
  channels: JourneyChannelInfo[],
): JourneyChannelInfo[] {
  const seen = new Set<string>();
  return channels.filter((channel) => {
    if (seen.has(channel.type)) return false;
    seen.add(channel.type);
    return true;
  });
}

export const CHANNEL_STATUS_COLORS: Record<JourneyChannelStatus, string> = {
  draft: 'bg-slate-300',
  published: 'bg-emerald-500',
  scheduled: 'bg-sky-500',
  started: 'bg-emerald-500',
  finished: 'bg-indigo-500',
};
