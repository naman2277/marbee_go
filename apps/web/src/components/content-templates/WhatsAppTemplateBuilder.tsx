import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui';
import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import { PersonalizedInput, PersonalizedTextarea } from '@/components/content-templates/PersonalizedField';
import type { WhatsAppContent } from '@/lib/content-templates';
import {
  WHATSAPP_BUTTON_TYPE_OPTIONS,
  WHATSAPP_CATEGORY_OPTIONS,
  WHATSAPP_FORMAT_OPTIONS,
  WHATSAPP_HEADER_OPTIONS,
  emptyWhatsAppContent,
  normalizeWhatsAppContent,
  type WhatsAppButton,
  type WhatsAppButtonType,
  type WhatsAppCarouselCard,
  type WhatsAppTemplateFormat,
} from '@/lib/whatsapp-template-types';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-600';

type Props = {
  content: WhatsAppContent;
  onChange: (content: WhatsAppContent) => void;
};

function countButtons(buttons: WhatsAppButton[], type: WhatsAppButtonType) {
  return buttons.filter((b) => String(b.type).toUpperCase() === type).length;
}

function canAddButton(buttons: WhatsAppButton[], type: WhatsAppButtonType) {
  const opt = WHATSAPP_BUTTON_TYPE_OPTIONS.find((o) => o.id === type);
  if (!opt?.max) return true;
  return countButtons(buttons, type) < opt.max;
}

function ButtonEditor({
  buttons,
  onChange,
  lockedTypes,
}: {
  buttons: WhatsAppButton[];
  onChange: (buttons: WhatsAppButton[]) => void;
  lockedTypes?: WhatsAppButtonType[];
}) {
  const update = (index: number, patch: Partial<WhatsAppButton>) => {
    onChange(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const remove = (index: number) => onChange(buttons.filter((_, i) => i !== index));

  const add = (type: WhatsAppButtonType) => {
    if (!canAddButton(buttons, type)) return;
    const defaults: Record<WhatsAppButtonType, WhatsAppButton> = {
      URL: { type: 'URL', text: 'Visit website', url: 'https://' },
      PHONE_NUMBER: { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+1' },
      QUICK_REPLY: { type: 'QUICK_REPLY', text: 'Yes' },
      COPY_CODE: { type: 'COPY_CODE', text: 'Copy code' },
    };
    onChange([...buttons, defaults[type]]);
  };

  return (
    <div className="space-y-3">
      {buttons.map((btn, i) => (
        <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {WHATSAPP_BUTTON_TYPE_OPTIONS.find((o) => o.id === String(btn.type).toUpperCase())?.label ?? btn.type}
            </span>
            {!lockedTypes?.includes(String(btn.type).toUpperCase() as WhatsAppButtonType) && (
              <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PersonalizedInput
              label="Button text"
              value={btn.text}
              onChange={(text) => update(i, { text })}
              maxLength={25}
            />
            {String(btn.type).toUpperCase() === 'URL' && (
              <PersonalizedInput
                label="Website URL"
                value={btn.url ?? ''}
                onChange={(url) => update(i, { url })}
                placeholder="https:// or {{link}}"
              />
            )}
            {String(btn.type).toUpperCase() === 'PHONE_NUMBER' && (
              <PersonalizedInput
                label="Phone number"
                value={btn.phone_number ?? ''}
                onChange={(phone_number) => update(i, { phone_number })}
                placeholder="+1234567890"
              />
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {WHATSAPP_BUTTON_TYPE_OPTIONS.filter((o) => !lockedTypes?.includes(o.id)).map((opt) => (
          <Button
            key={opt.id}
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canAddButton(buttons, opt.id)}
            onClick={() => add(opt.id)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CarouselCardEditor({
  card,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  card: WhatsAppCarouselCard;
  index: number;
  onChange: (card: WhatsAppCarouselCard) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <GripVertical className="h-4 w-4 text-slate-300" />
          Card {index + 1}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Header media type</span>
            <select
              value={card.header_format ?? 'IMAGE'}
              onChange={(e) => onChange({ ...card, header_format: e.target.value as 'IMAGE' | 'VIDEO' })}
              className={inputClass}
            >
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
            </select>
          </label>
          <PersonalizedInput
            label="Media URL"
            value={card.header_media_url ?? ''}
            onChange={(header_media_url) => onChange({ ...card, header_media_url })}
            placeholder="https://… or {{image_url}}"
          />
        </div>
        <PersonalizedTextarea
          label="Card body"
          value={card.body}
          onChange={(body) => onChange({ ...card, body })}
          rows={3}
          maxLength={160}
          inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 font-mono text-xs focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <ButtonEditor
          buttons={(card.buttons ?? []) as WhatsAppButton[]}
          onChange={(buttons) => onChange({ ...card, buttons })}
        />
      </div>
    </div>
  );
}

export function WhatsAppTemplateBuilder({ content, onChange }: Props) {
  const c = normalizeWhatsAppContent(content);
  const format = c.template_format ?? 'standard';

  const patch = (next: Partial<WhatsAppContent>) => onChange({ ...c, ...next });

  const setFormat = (next: WhatsAppTemplateFormat) => {
    if (next === format) return;
    patch(emptyWhatsAppContent(next));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#008069]/20 bg-[#008069]/5 p-4">
        <p className="text-sm font-semibold text-[#008069]">WhatsApp Business template</p>
        <p className="mt-1 text-xs text-slate-600">
          Build templates matching Meta Business Manager — standard messages, carousels, authentication OTP, and CTA buttons.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Category</span>
          <select
            value={c.category ?? 'MARKETING'}
            onChange={(e) => patch({ category: e.target.value as WhatsAppContent['category'] })}
            className={inputClass}
          >
            {WHATSAPP_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Language code</span>
          <input
            value={c.language ?? 'en'}
            onChange={(e) => patch({ language: e.target.value })}
            placeholder="en, en_US, hi"
            className={inputClass}
          />
        </label>
      </div>

      <div>
        <span className={labelClass}>Template format</span>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {WHATSAPP_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFormat(opt.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                format === opt.id
                  ? 'border-[#008069] bg-[#008069]/5 ring-2 ring-[#008069]/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
              <p className="mt-1 text-xs text-slate-500">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {format === 'standard' && (
        <>
          <TemplateBuilderSection title="Header" description="Optional — text or media appears above the body">
            <div className="space-y-3">
              <label>
                <span className={labelClass}>Header type</span>
                <select
                  value={c.header?.format ?? 'NONE'}
                  onChange={(e) =>
                    patch({
                      header: {
                        format: e.target.value as NonNullable<WhatsAppContent['header']>['format'],
                        text: '',
                        media_url: '',
                      },
                    })
                  }
                  className={inputClass}
                >
                  {WHATSAPP_HEADER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {c.header?.format === 'TEXT' && (
                <PersonalizedInput
                  label="Header text"
                  value={c.header.text ?? ''}
                  onChange={(text) => patch({ header: { ...c.header!, text } })}
                  maxLength={60}
                />
              )}
              {c.header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.header.format) && (
                <PersonalizedInput
                  label="Media sample URL"
                  value={c.header.media_url ?? ''}
                  onChange={(media_url) => patch({ header: { ...c.header!, media_url } })}
                  placeholder="https://… or {{media_url}}"
                />
              )}
            </div>
          </TemplateBuilderSection>

          <TemplateBuilderSection title="Body" description="Required — use *bold* and {{1}} variables" required>
            <PersonalizedTextarea
              value={c.body}
              onChange={(body) => patch({ body })}
              rows={6}
              inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 font-mono text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </TemplateBuilderSection>

          <TemplateBuilderSection title="Footer" description="Optional — small gray text below the body">
            <PersonalizedInput
              value={c.footer ?? ''}
              onChange={(footer) => patch({ footer })}
              maxLength={60}
              placeholder="Reply STOP to unsubscribe"
            />
          </TemplateBuilderSection>

          <TemplateBuilderSection
            title="Buttons"
            description="Call-to-action (URL, phone) or quick reply buttons — same as WhatsApp Manager"
          >
            <ButtonEditor buttons={(c.buttons ?? []) as WhatsAppButton[]} onChange={(buttons) => patch({ buttons })} />
          </TemplateBuilderSection>
        </>
      )}

      {format === 'carousel' && (
        <>
          <TemplateBuilderSection title="Message body" description="Intro text shown above the carousel cards">
            <PersonalizedTextarea
              value={c.body}
              onChange={(body) => patch({ body })}
              rows={3}
              inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 font-mono text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </TemplateBuilderSection>

          <TemplateBuilderSection
            title="Carousel cards"
            description="2–10 cards with image/video header and buttons"
            action={
              (c.carousel_cards?.length ?? 0) < 10 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    patch({
                      carousel_cards: [
                        ...(c.carousel_cards ?? []),
                        { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add card
                </Button>
              ) : null
            }
          >
            <div className="space-y-4">
              {(c.carousel_cards ?? []).map((card, i) => (
                <CarouselCardEditor
                  key={card.id}
                  card={card}
                  index={i}
                  canRemove={(c.carousel_cards?.length ?? 0) > 2}
                  onChange={(updated) =>
                    patch({
                      carousel_cards: (c.carousel_cards ?? []).map((x) => (x.id === card.id ? updated : x)),
                    })
                  }
                  onRemove={() =>
                    patch({ carousel_cards: (c.carousel_cards ?? []).filter((x) => x.id !== card.id) })
                  }
                />
              ))}
            </div>
          </TemplateBuilderSection>
        </>
      )}

      {format === 'authentication' && (
        <>
          <TemplateBuilderSection title="Body" description="Include {{1}} for the OTP code placeholder" required>
            <PersonalizedTextarea
              value={c.body}
              onChange={(body) => patch({ body })}
              rows={4}
              inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 font-mono text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </TemplateBuilderSection>

          <TemplateBuilderSection title="Copy code button" description="Required for authentication templates">
            <ButtonEditor
              buttons={(c.buttons ?? [{ type: 'COPY_CODE', text: 'Copy code' }]) as WhatsAppButton[]}
              onChange={(buttons) => patch({ buttons })}
              lockedTypes={['COPY_CODE']}
            />
          </TemplateBuilderSection>

          <TemplateBuilderSection title="Footer" description="Optional expiry or security note">
            <PersonalizedInput
              value={c.footer ?? ''}
              onChange={(footer) => patch({ footer })}
              placeholder="This code expires in 10 minutes"
            />
          </TemplateBuilderSection>
        </>
      )}
    </div>
  );
}
