import { Trash2 } from 'lucide-react';
import type { RcsContent, RcsSuggestion } from '@/lib/content-templates';
import { RCS_FORMAT_OPTIONS, normalizeRcsContent } from '@/lib/rcs-template-types';
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
  content: RcsContent;
  onChange: (next: RcsContent) => void;
};

const SUGGESTION_TYPES = [
  { value: 'open_url', label: 'Open URL' },
  { value: 'reply', label: 'Quick reply' },
  { value: 'dial', label: 'Dial number' },
  { value: 'view_location', label: 'View location' },
  { value: 'create_calendar_event', label: 'Add to calendar' },
];

const DESC_MAX = 2000;
const TITLE_MAX = 200;

function SuggestionRows({
  items,
  onChange,
  max = 4,
}: {
  items: RcsSuggestion[];
  onChange: (next: RcsSuggestion[]) => void;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Select
              className="flex-1"
              value={s.type}
              onChange={(v) => onChange(items.map((x, y) => (y === i ? { ...x, type: v } : x)))}
              options={SUGGESTION_TYPES}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, y) => y !== i))}
              className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextInput
              value={s.text}
              maxLength={25}
              onChange={(e) => onChange(items.map((x, y) => (y === i ? { ...x, text: e.target.value } : x)))}
              placeholder="Chip label"
            />
            {(s.type === 'open_url' || s.type === 'dial') && (
              <TextInput
                value={s.url ?? ''}
                onChange={(e) => onChange(items.map((x, y) => (y === i ? { ...x, url: e.target.value } : x)))}
                placeholder={s.type === 'dial' ? '+1 555…' : 'https://…'}
              />
            )}
          </div>
        </div>
      ))}
      {items.length < max && (
        <AddButton onClick={() => onChange([...items, { type: 'open_url', text: 'Learn more', url: 'https://' }])} label="Add suggestion" />
      )}
    </div>
  );
}

export function RcsComposer({ content, onChange }: Props) {
  const c = normalizeRcsContent(content);
  const patch = (p: Partial<RcsContent>) => onChange({ ...c, ...p });

  return (
    <div className="space-y-4">
      <StudioSection title="Message format" description="RCS Business Messaging — verified sender, rich layouts, SMS fallback.">
        <SegRow
          value={(c.format as string) ?? 'rich_card'}
          onChange={(v) => {
            // normalizeRcsContent() snaps back to `carousel` while cards exist,
            // so clear them when leaving the carousel format.
            if (v === 'carousel') {
              patch({
                format: 'carousel',
                carousel_cards: c.carousel_cards?.length
                  ? c.carousel_cards
                  : [
                      { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
                      { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
                    ],
              });
            } else {
              patch({ format: v, carousel_cards: [] });
            }
          }}
          options={RCS_FORMAT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
        />
        <p className="text-[10px] text-slate-400">
          {RCS_FORMAT_OPTIONS.find((o) => o.id === c.format)?.description}
        </p>
      </StudioSection>

      {c.format === 'text' && (
        <StudioSection title="Message" description="Plain text with optional suggestion chips.">
          <VariableTextArea value={c.description} onChange={(v) => patch({ description: v })} placeholder="Hi {{first_name}}…" rows={5} maxLength={DESC_MAX} />
          <CharMeter value={c.description.length} max={DESC_MAX} warnAt={DESC_MAX - 200} />
        </StudioSection>
      )}

      {c.format === 'rich_card' && (
        <>
          <StudioSection title="Media" description="Image or video shown at the top of the card.">
            <Field label="Media URL">
              <TextInput value={c.media?.url ?? ''} onChange={(e) => patch({ media: { ...c.media, url: e.target.value } })} placeholder="https://…" />
            </Field>
            <Field label="Height">
              <Select
                value={c.media?.height ?? 'MEDIUM'}
                onChange={(v) => patch({ media: { ...c.media, height: v } })}
                options={[
                  { value: 'SHORT', label: 'Short' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'TALL', label: 'Tall' },
                ]}
              />
            </Field>
          </StudioSection>
          <StudioSection title="Card content">
            <Field label="Title" hint={`${c.title.length}/${TITLE_MAX}`}>
              <TextInput value={c.title} maxLength={TITLE_MAX} onChange={(e) => patch({ title: e.target.value })} placeholder="Card headline" />
            </Field>
            <Field label="Description">
              <VariableTextArea value={c.description} onChange={(v) => patch({ description: v })} placeholder="Supporting text…" rows={4} maxLength={DESC_MAX} />
            </Field>
          </StudioSection>
          <StudioSection title="Suggestions" description="Up to 4 tappable chips." right={<span className="text-[10px] font-bold text-slate-400">{(c.suggestions ?? []).length}/4</span>}>
            <SuggestionRows items={c.suggestions ?? []} onChange={(next) => patch({ suggestions: next })} />
          </StudioSection>
        </>
      )}

      {c.format === 'carousel' && (
        <StudioSection
          title="Carousel cards"
          description="2–10 cards, each with media, text and up to 4 chips."
          right={<span className="text-[10px] font-bold text-slate-400">{(c.carousel_cards ?? []).length}/10</span>}
        >
          {(c.carousel_cards ?? []).map((card, i) => (
            <div key={card.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">Card {i + 1}</span>
                {(c.carousel_cards ?? []).length > 2 && (
                  <button
                    type="button"
                    onClick={() => patch({ carousel_cards: (c.carousel_cards ?? []).filter((_, y) => y !== i) })}
                    className="rounded-lg p-1 text-rose-500 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <TextInput
                value={card.media?.url ?? ''}
                onChange={(e) =>
                  patch({
                    carousel_cards: (c.carousel_cards ?? []).map((x, y) =>
                      y === i ? { ...x, media: { ...x.media, url: e.target.value } } : x,
                    ),
                  })
                }
                placeholder="Media URL https://…"
              />
              <TextInput
                value={card.title}
                onChange={(e) =>
                  patch({
                    carousel_cards: (c.carousel_cards ?? []).map((x, y) => (y === i ? { ...x, title: e.target.value } : x)),
                  })
                }
                placeholder="Card title"
              />
              <TextInput
                value={card.description}
                onChange={(e) =>
                  patch({
                    carousel_cards: (c.carousel_cards ?? []).map((x, y) => (y === i ? { ...x, description: e.target.value } : x)),
                  })
                }
                placeholder="Card description"
              />
              <SuggestionRows
                items={card.suggestions ?? []}
                onChange={(next) =>
                  patch({
                    carousel_cards: (c.carousel_cards ?? []).map((x, y) => (y === i ? { ...x, suggestions: next } : x)),
                  })
                }
              />
            </div>
          ))}
          {(c.carousel_cards ?? []).length < 10 && (
            <AddButton
              onClick={() =>
                patch({
                  carousel_cards: [
                    ...(c.carousel_cards ?? []),
                    { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
                  ],
                })
              }
              label="Add card"
            />
          )}
        </StudioSection>
      )}

      <StudioSection title="SMS fallback" description="Sent automatically when the device can't receive RCS.">
        <TextInput
          value={c.fallback?.text ?? ''}
          onChange={(e) => patch({ fallback: { channel: 'sms', text: e.target.value } })}
          placeholder="Plain-text version of this message"
        />
      </StudioSection>
    </div>
  );
}
