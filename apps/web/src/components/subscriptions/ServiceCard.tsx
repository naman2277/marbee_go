import { Link } from 'react-router-dom';
import {
  Bell,
  Clock,
  Mail,
  MessageSquare,
  MoreVertical,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import {
  channelLabel,
  validityLabel,
  type InformationService,
} from '@/lib/subscriptions';
import type { ServiceChannel } from '@/lib/subscriptions';

const CHANNEL_ICONS: Record<ServiceChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  web_push: Bell,
  whatsapp: MessageSquare,
  mobile_app: Smartphone,
};

type Props = {
  service: InformationService;
  onDelete?: () => void;
  deleting?: boolean;
};

export function ServiceCard({ service, onDelete, deleting }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ChannelIcon = CHANNEL_ICONS[service.channel] ?? Bell;

  const gradient =
    service.channel === 'email'
      ? 'from-sky-600 via-blue-600 to-indigo-600'
      : service.channel === 'web_push'
        ? 'from-violet-600 via-purple-600 to-fuchsia-600'
        : 'from-emerald-600 via-teal-600 to-cyan-600';

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl">
        <div className={`relative bg-gradient-to-r ${gradient} px-5 py-4 text-white`}>
          <div className="flex items-start justify-between gap-3">
            <Link to={`/subscriptions/${service.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <ChannelIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold group-hover:underline">{service.name}</h3>
                <p className="text-xs text-white/70">{channelLabel(service.channel)}</p>
              </div>
            </Link>
            {onDelete && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDelete(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete service
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {service.confirmation_mode === 'double_opt_in' && (
            <span className="absolute bottom-3 right-4 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
              Double opt-in
            </span>
          )}
        </div>

        <Link to={`/subscriptions/${service.id}`} className="block flex-1 p-5">
          {service.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{service.description}</p>
          )}

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subscribers</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-3xl font-bold tabular-nums text-blue-700">
                <Users className="h-6 w-6 text-blue-400" />
                {service.subscriber_count.toLocaleString()}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" />
                {validityLabel(service)}
              </p>
              {service.delivery_mode && (
                <p className="mt-0.5 capitalize">{service.delivery_mode}</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge variant={service.status === 'active' ? 'success' : 'default'}>{service.status}</Badge>
            {service.send_subscribe_confirmation && (
              <Badge variant="default">Subscribe confirm</Badge>
            )}
            {service.send_unsubscribe_confirmation && (
              <Badge variant="default">Unsubscribe confirm</Badge>
            )}
          </div>
        </Link>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <Link to={`/subscriptions/${service.id}`} className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              Manage subscribers
            </Button>
          </Link>
          <Link to={`/subscriptions/${service.id}?tab=settings`} className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              Settings
            </Button>
          </Link>
        </div>
      </article>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete information service?"
        message={`"${service.name}" and all subscriber history will be permanently removed.`}
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          onDelete?.();
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
