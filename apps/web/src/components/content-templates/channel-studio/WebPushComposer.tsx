import { Trash2 } from 'lucide-react';
import type { WebPushContent } from '@/lib/content-templates';
import {
  AddButton,
  CharMeter,
  Field,
  StudioSection,
  TextInput,
  Toggle,
  VariableTextArea,
} from './studio-ui';

type Props = {
  content: WebPushContent;
  onChange: (next: WebPushContent) => void;
};

const TITLE_MAX = 60;
const BODY_MAX = 160;

export function WebPushComposer({ content, onChange }: Props) {
  const patch = (p: Partial<WebPushContent>) => onChange({ ...content, ...p });
  const actions = content.actions ?? [];

  return (
    <div className="space-y-4">
      <StudioSection title="Content" description="Titles over ~50 chars get truncated on most desktops.">
        <Field label="Title" hint={`${(content.title ?? '').length}/${TITLE_MAX}`}>
          <TextInput
            value={content.title ?? ''}
            maxLength={TITLE_MAX}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Flash sale — 3 hours left"
          />
        </Field>
        <Field label="Body">
          <VariableTextArea value={content.body ?? ''} onChange={(v) => patch({ body: v })} placeholder="Hi {{first_name}}, your cart is waiting…" rows={3} maxLength={BODY_MAX} />
          <CharMeter value={(content.body ?? '').length} max={BODY_MAX} warnAt={120} />
        </Field>
        <Field label="Landing URL">
          <TextInput value={content.action_url ?? ''} onChange={(e) => patch({ action_url: e.target.value })} placeholder="https://…" />
        </Field>
      </StudioSection>

      <StudioSection title="Imagery" description="Icon shows everywhere; hero image only on Chrome desktop & Android.">
        <Field label="Icon URL" hint="192×192">
          <TextInput value={content.icon_url ?? ''} onChange={(e) => patch({ icon_url: e.target.value })} placeholder="https://…/icon.png" />
        </Field>
        <Field label="Hero image URL" hint="optional, 360×180">
          <TextInput value={content.image_url ?? ''} onChange={(e) => patch({ image_url: e.target.value })} placeholder="https://…/hero.jpg" />
        </Field>
        <Field label="Badge URL" hint="monochrome, Android">
          <TextInput value={content.badge_url ?? ''} onChange={(e) => patch({ badge_url: e.target.value })} placeholder="https://…/badge.png" />
        </Field>
      </StudioSection>

      <StudioSection
        title="Action buttons"
        description="Up to 2. Rendered on Chrome desktop and Android."
        right={<span className="text-[10px] font-bold text-slate-400">{actions.length}/2</span>}
      >
        {actions.map((a, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600">Button {i + 1}</span>
              <button
                type="button"
                onClick={() => patch({ actions: actions.filter((_, x) => x !== i) })}
                className="rounded-lg p-1 text-rose-500 transition hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                value={a.title ?? ''}
                maxLength={20}
                onChange={(e) => patch({ actions: actions.map((x, y) => (y === i ? { ...x, title: e.target.value } : x)) })}
                placeholder="Label"
              />
              <TextInput
                value={a.url ?? ''}
                onChange={(e) => patch({ actions: actions.map((x, y) => (y === i ? { ...x, url: e.target.value } : x)) })}
                placeholder="https://…"
              />
            </div>
          </div>
        ))}
        {actions.length < 2 && (
          <AddButton
            onClick={() => patch({ actions: [...actions, { action: `a${actions.length + 1}`, title: '', url: '' }] })}
            label="Add button"
          />
        )}
      </StudioSection>

      <StudioSection title="Delivery behaviour">
        <Toggle
          checked={Boolean(content.require_interaction)}
          onChange={(v) => patch({ require_interaction: v })}
          label="Require interaction"
          description="Notification stays on screen until the user dismisses it."
        />
        <Field label="Time to live (hours)" hint="drop if undelivered after">
          <TextInput
            type="number"
            min={1}
            max={168}
            value={content.ttl_hours ?? 24}
            onChange={(e) => patch({ ttl_hours: Number(e.target.value) || 24 })}
          />
        </Field>
      </StudioSection>
    </div>
  );
}
