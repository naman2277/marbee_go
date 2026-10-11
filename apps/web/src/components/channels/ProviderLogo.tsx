import { useState } from 'react';
import { Globe, Mail, Radio, Server, Webhook, Video } from 'lucide-react';

type ProviderLogoProps = {
  providerId: string;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const LOGO_META: Record<string, { color: string; src?: string; Icon?: typeof Mail }> = {
  sendgrid: { color: '#1A82E2', src: 'https://cdn.simpleicons.org/sendgrid/1A82E2' },
  ses: { color: '#FF9900', src: 'https://cdn.simpleicons.org/amazonwebservices/FF9900' },
  smtp: { color: '#64748b', Icon: Mail },
  mailgun: { color: '#F0635A', src: 'https://cdn.simpleicons.org/mailgun/F0635A' },
  mailjet: { color: '#00A3E0', src: 'https://cdn.simpleicons.org/mailjet/00A3E0' },
  resend: { color: '#000000', src: 'https://cdn.simpleicons.org/resend/000000' },
  http: { color: '#6366f1', Icon: Webhook },
  twilio: { color: '#F22F46', src: 'https://cdn.simpleicons.org/twilio/F22F46' },
  twilio_whatsapp: { color: '#F22F46', src: 'https://cdn.simpleicons.org/twilio/F22F46' },
  gupshup: { color: '#00B900', src: 'https://cdn.simpleicons.org/gupshup/00B900' },
  infobip: { color: '#007AFF', Icon: Globe },
  meta: { color: '#0081FB', src: 'https://cdn.simpleicons.org/meta/0081FB' },
  firebase: { color: '#DD2C00', src: 'https://cdn.simpleicons.org/firebase/DD2C00' },
  onesignal: { color: '#E54B4D', src: 'https://cdn.simpleicons.org/onesignal/E54B4D' },
  google_rcs: { color: '#4285F4', src: 'https://cdn.simpleicons.org/google/4285F4' },
  runwayml_characters: { color: '#9333ea', Icon: Video },
  elevenlabs_livekit: { color: '#000000', src: 'https://cdn.simpleicons.org/elevenlabs/000000' },
  heygen_interactive: { color: '#6366f1', Icon: Video },
  tavus_video: { color: '#8b5cf6', Icon: Video },
  did_agents: { color: '#ec4899', Icon: Video },
};

const SIZE_CLASS = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

const ICON_SIZE = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function ProviderLogo({ providerId, label, size = 'md', className = '' }: ProviderLogoProps) {
  const meta = LOGO_META[providerId] ?? { color: '#64748b', Icon: Server };
  const [imgFailed, setImgFailed] = useState(false);
  const boxClass = `${SIZE_CLASS[size]} ${className}`;

  if (meta.src && !imgFailed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white ${boxClass}`}
      >
        <img
          src={meta.src}
          alt={`${label} logo`}
          className="h-full w-full object-contain p-1"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  const Icon = meta.Icon ?? Radio;
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white ${boxClass}`}
      style={{ backgroundColor: meta.color }}
      title={label}
    >
      {meta.Icon ? <Icon className={ICON_SIZE[size]} /> : initials}
    </span>
  );
}
