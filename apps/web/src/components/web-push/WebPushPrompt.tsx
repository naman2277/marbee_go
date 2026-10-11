import { Bell, X } from 'lucide-react';
import type { WebPushBehaviorConfig } from '@/lib/web-push-config';

type Props = {
  behavior: WebPushBehaviorConfig;
  subscribing: boolean;
  onAccept: () => void;
  onDismiss: () => void;
};

export function WebPushPrompt({ behavior, subscribing, onAccept, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 left-1/2 z-[400] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {behavior.prompt_title ?? 'Stay in the loop'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {behavior.prompt_message ?? 'Get timely updates in your browser.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={subscribing}
                onClick={onAccept}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {subscribing ? 'Enabling…' : behavior.prompt_accept_label ?? 'Allow notifications'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                {behavior.prompt_dismiss_label ?? 'Not now'}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
