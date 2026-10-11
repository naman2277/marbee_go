import { GripVertical, Trash2 } from 'lucide-react';
import type { WhatsAppContent } from '@/lib/content-templates';
import {
  WHATSAPP_BUTTON_TYPE_OPTIONS,
  WHATSAPP_CATEGORY_OPTIONS,
  normalizeWhatsAppContent,
} from '@/lib/whatsapp-template-types';
import {
  AddButton,
  CharMeter,
  Field,
  SegRow,
  Select,
  StudioSection,
  TextInput,
  VariableTextArea,
} from './studio-ui';

type Props = {
  content: WhatsAppContent;
  onChange: (next: WhatsAppContent) => void;
};

const BODY_MAX = 1024;
const FOOTER_MAX = 60;

const newButton = (type: string): NonNullable<WhatsAppContent['buttons']>[number] => {
  if (type === 'URL') return { type, text: 'Visit website', url: 'https://' };
  if (type === 'PHONE_NUMBER') return { type, text: 'Call us', phone_number: '+15551234567' };
  if (type === 'COPY_CODE') return { type, text: 'Copy code' };
  return { type: 'QUICK_REPLY', text: 'Quick reply' };
};

export function WhatsAppComposer({ content, onChange }: Props) {
  const c = normalizeWhatsAppContent(content);
  const patch = (p: Partial<WhatsAppContent>) => onChange({ ...c, ...p });
  const header = c.header ?? { format: 'NONE' as const };
  const buttons = c.buttons ?? [];
  const isCarousel = c.template_format === 'carousel';

  const setButton = (i: number, p: Partial<(typeof buttons)[number]>) => {
    const next = buttons.map((b, x) => (x === i ? { ...b, ...p } : b));
    patch({ buttons: next });
  };

  return (
    <div className="space-y-4">
      <StudioSection title="Message type" description="Category and layout decide how Meta reviews and renders this template.">
        <Field label="Format">
          <SegRow
            value={c.template_format ?? 'standard'}
            onChange={(v) => {
              // normalizeWhatsAppContent() forces the format back to `carousel`
              // when cards exist, or `authentication` when the category/buttons
              // imply it — so switching format has to clear those triggers too.
              if (v === 'carousel') {
                patch({
                  template_format: 'carousel',
                  carousel_cards: c.carousel_cards?.length
                    ? c.carousel_cards
                    : [
                        { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
                        { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
                      ],
                });
              } else if (v === 'authentication') {
                patch({
                  template_format: 'authentication',
                  category: 'AUTHENTICATION',
                  carousel_cards: [],
                  buttons: (c.buttons ?? []).some((b) => String(b.type).toUpperCase() === 'COPY_CODE')
                    ? c.buttons
                    : [{ type: 'COPY_CODE', text: 'Copy code' }],
                });
              } else {
                patch({
                  template_format: 'standard',
                  carousel_cards: [],
                  category: c.category === 'AUTHENTICATION' ? 'MARKETING' : c.category,
                  buttons: (c.buttons ?? []).filter((b) => String(b.type).toUpperCase() !== 'COPY_CODE'),
                });
              }
            }}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'carousel', label: 'Carousel' },
              { value: 'authentication', label: 'Authentication' },
            ]}
          />
        </Field>
        <Field label="Category">
          <Select
            value={c.category ?? 'MARKETING'}
            onChange={(v) => patch({ category: v as WhatsAppContent['category'] })}
            options={WHATSAPP_CATEGORY_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
          />
        </Field>
        <Field label="Language">
          <TextInput value={c.language ?? 'en'} onChange={(e) => patch({ language: e.target.value })} placeholder="en_US" />
        </Field>
      </StudioSection>

      {!isCarousel && (
        <StudioSection title="Header" description="Optional. One text line or a single media attachment.">
          <Field label="Header type">
            <SegRow
              value={header.format}
              onChange={(v) => patch({ header: { ...header, format: v } })}
              options={[
                { value: 'NONE', label: 'None' },
                { value: 'TEXT', label: 'Text' },
                { value: 'IMAGE', label: 'Image' },
                { value: 'VIDEO', label: 'Video' },
                { value: 'DOCUMENT', label: 'Doc' },
              ]}
            />
          </Field>
          {header.format === 'TEXT' && (
            <Field label="Header text" hint={`${(header.text ?? '').length}/60`}>
              <TextInput
                value={header.text ?? ''}
                maxLength={60}
                onChange={(e) => patch({ header: { ...header, text: e.target.value } })}
                placeholder="e.g. Your order is on the way"
              />
            </Field>
          )}
          {(header.format === 'IMAGE' || header.format === 'VIDEO' || header.format === 'DOCUMENT') && (
            <Field label="Media URL" hint="hosted sample">
              <TextInput
                value={header.media_url ?? ''}
                onChange={(e) => patch({ header: { ...header, media_url: e.target.value } })}
                placeholder="https://…"
              />
            </Field>
          )}
        </StudioSection>
      )}

      <StudioSection
        title={isCarousel ? 'Intro message' : 'Body'}
        description="Use *bold*, _italic_, ~strike~ and {{variables}}. WhatsApp shows this as the message text."
      >
        <VariableTextArea
          value={c.body}
          onChange={(v) => patch({ body: v })}
          placeholder="Hi {{first_name}}, thanks for your order {{order_id}}…"
          rows={6}
          maxLength={BODY_MAX}
        />
        <CharMeter value={c.body.length} max={BODY_MAX} warnAt={BODY_MAX - 80} />
      </StudioSection>

      {!isCarousel && (
        <StudioSection title="Footer" description="Small grey text under the body. No variables allowed by Meta.">
          <TextInput
            value={c.footer ?? ''}
            maxLength={FOOTER_MAX}
            onChange={(e) => patch({ footer: e.target.value })}
            placeholder="e.g. Reply STOP to opt out"
          />
          <CharMeter value={(c.footer ?? '').length} max={FOOTER_MAX} />
        </StudioSection>
      )}

      {!isCarousel && (
        <StudioSection
          title="Buttons"
          description="Up to 2 URL, 1 phone, 1 copy-code and 3 quick-reply buttons."
          right={<span className="text-[10px] font-bold text-slate-400">{buttons.length}/10</span>}
        >
          {buttons.map((b, i) => {
            const t = String(b.type).toUpperCase();
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <GripVertical className="h-3.5 w-3.5 text-slate-300" />
                  <Select
                    className="flex-1"
                    value={t}
                    onChange={(v) => setButton(i, newButton(v))}
                    options={WHATSAPP_BUTTON_TYPE_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ buttons: buttons.filter((_, x) => x !== i) })}
                    className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TextInput
                    value={b.text}
                    maxLength={25}
                    onChange={(e) => setButton(i, { text: e.target.value })}
                    placeholder="Button label"
                  />
                  {t === 'URL' && (
                    <TextInput value={b.url ?? ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://…" />
                  )}
                  {t === 'PHONE_NUMBER' && (
                    <TextInput
                      value={b.phone_number ?? ''}
                      onChange={(e) => setButton(i, { phone_number: e.target.value })}
                      placeholder="+1 555 123 4567"
                    />
                  )}
                </div>
              </div>
            );
          })}
          {buttons.length < 10 && <AddButton onClick={() => patch({ buttons: [...buttons, newButton('QUICK_REPLY')] })} label="Add button" />}
        </StudioSection>
      )}

      {isCarousel && (
        <StudioSection
          title="Carousel cards"
          description="2–10 cards. Every card must share the same button layout."
          right={<span className="text-[10px] font-bold text-slate-400">{c.carousel_cards?.length ?? 0}/10</span>}
        >
          {(c.carousel_cards ?? []).map((card, i) => (
            <div key={card.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">Card {i + 1}</span>
                {(c.carousel_cards?.length ?? 0) > 2 && (
                  <button
                    type="button"
                    onClick={() => patch({ carousel_cards: (c.carousel_cards ?? []).filter((_, x) => x !== i) })}
                    className="rounded-lg p-1 text-rose-500 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <Select
                  value={card.header_format ?? 'IMAGE'}
                  onChange={(v) =>
                    patch({
                      carousel_cards: (c.carousel_cards ?? []).map((x, y) =>
                        y === i ? { ...x, header_format: v as 'IMAGE' | 'VIDEO' } : x,
                      ),
                    })
                  }
                  options={[
                    { value: 'IMAGE', label: 'Image header' },
                    { value: 'VIDEO', label: 'Video header' },
                  ]}
                />
                <TextInput
                  value={card.header_media_url ?? ''}
                  onChange={(e) =>
                    patch({
                      carousel_cards: (c.carousel_cards ?? []).map((x, y) =>
                        y === i ? { ...x, header_media_url: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Media URL https://…"
                />
                <TextInput
                  value={card.body}
                  maxLength={160}
                  onChange={(e) =>
                    patch({
                      carousel_cards: (c.carousel_cards ?? []).map((x, y) => (y === i ? { ...x, body: e.target.value } : x)),
                    })
                  }
                  placeholder="Card body text"
                />
              </div>
            </div>
          ))}
          {(c.carousel_cards?.length ?? 0) < 10 && (
            <AddButton
              onClick={() =>
                patch({
                  carousel_cards: [
                    ...(c.carousel_cards ?? []),
                    { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
                  ],
                })
              }
              label="Add card"
            />
          )}
        </StudioSection>
      )}
    </div>
  );
}
