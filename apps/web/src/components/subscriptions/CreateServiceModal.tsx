import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  CONFIRMATION_MODES,
  DELIVERY_MODES,
  SERVICE_CHANNELS,
  type ConfirmationMode,
  type CreateServiceInput,
  type DeliveryMode,
  type ServiceChannel,
} from '@/lib/subscriptions';

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: Omit<CreateServiceInput, 'tenantId' | 'environment'>) => void;
};

export function CreateServiceModal({ open, loading, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState<ServiceChannel>('email');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('newsletter');
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>('simple');
  const [sendSubscribeConfirmation, setSendSubscribeConfirmation] = useState(false);
  const [sendUnsubscribeConfirmation, setSendUnsubscribeConfirmation] = useState(true);
  const [unlimited, setUnlimited] = useState(true);
  const [validityValue, setValidityValue] = useState(30);
  const [validityUnit, setValidityUnit] = useState<'days' | 'months'>('days');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      channel,
      deliveryMode: channel === 'email' ? deliveryMode : null,
      confirmationMode,
      sendSubscribeConfirmation,
      sendUnsubscribeConfirmation,
      unlimited,
      validityValue: unlimited ? null : validityValue,
      validityUnit: unlimited ? null : validityUnit,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Create information service</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Label</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly Newsletter"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Channel</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ServiceChannel)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {SERVICE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>

            {channel === 'email' && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Delivery mode</span>
                <select
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {DELIVERY_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Confirmation mechanism</span>
            <select
              value={confirmationMode}
              onChange={(e) => setConfirmationMode(e.target.value as ConfirmationMode)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {CONFIRMATION_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>

          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sendSubscribeConfirmation}
                onChange={(e) => setSendSubscribeConfirmation(e.target.checked)}
                className="rounded border-slate-300"
              />
              Send subscription confirmation message
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sendUnsubscribeConfirmation}
                onChange={(e) => setSendUnsubscribeConfirmation(e.target.checked)}
                className="rounded border-slate-300"
              />
              Send unsubscription confirmation message
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
                className="rounded border-slate-300"
              />
              Unlimited subscription duration
            </label>
            {!unlimited && (
              <div className="flex gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  value={validityValue}
                  onChange={(e) => setValidityValue(Number(e.target.value))}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <select
                  value={validityUnit}
                  onChange={(e) => setValidityUnit(e.target.value as 'days' | 'months')}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create service'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
