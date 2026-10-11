import {
  CHANNEL_STATUS_COLORS,
  channelIconForType,
  uniqueChannelsByType,
  type JourneyChannelInfo,
} from '@/lib/journey-channels';

type Props = {
  channels: JourneyChannelInfo[];
  size?: 'sm' | 'md';
  showLabels?: boolean;
};

export function JourneyChannelIcons({ channels, size = 'md', showLabels = false }: Props) {
  const unique = uniqueChannelsByType(channels);
  if (!unique.length) return null;

  const boxClass = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {unique.map((channel) => {
        const Icon = channelIconForType(channel.type);
        return (
          <div key={channel.type} className="flex items-center gap-1">
            <span
              title={`${channel.label}${channel.deliveryName ? `: ${channel.deliveryName}` : ''}`}
              className={`relative inline-flex ${boxClass} items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm`}
            >
              <Icon className={iconClass} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${CHANNEL_STATUS_COLORS[channel.status]}`}
              />
            </span>
            {showLabels && (
              <span className="text-[11px] font-medium text-slate-500">{channel.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
