import { GripVertical, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import { PersonalizedInput, PersonalizedTextarea } from '@/components/content-templates/PersonalizedField';
import type { RcsCarouselCard, RcsContent, RcsSuggestion } from '@/lib/content-templates';
import {
  RCS_FORMAT_OPTIONS,
  emptyRcsContent,
  emptyRcsSuggestion,
  normalizeRcsContent,
  type RcsTemplateFormat,
} from '@/lib/rcs-template-types';

const selectClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-600';
const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';

type Props = {
  content: RcsContent;
  onChange: (content: RcsContent) => void;
};

function SuggestionEditor({
  suggestions,
  onChange,
  max = 4,
}: {
  suggestions: RcsSuggestion[];
  onChange: (suggestions: RcsSuggestion[]) => void;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      {suggestions.map((s, i) => (
        <div key={i} className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          <PersonalizedInput
            value={s.text}
            onChange={(text) => onChange(suggestions.map((x, j) => (j === i ? { ...x, text } : x)))}
            placeholder="Chip label"
            inputClassName={inputClass}
          />
          <PersonalizedInput
            value={s.url ?? ''}
            onChange={(url) => onChange(suggestions.map((x, j) => (j === i ? { ...x, url } : x)))}
            placeholder="URL"
            inputClassName={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(suggestions.filter((_, j) => j !== i))}
            className="px-2 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {suggestions.length < max && (
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...suggestions, emptyRcsSuggestion()])}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add suggestion
        </Button>
      )}
      {!suggestions.length && <p className="text-xs text-slate-400">No suggestions — add up to {max} action chips.</p>}
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
  card: RcsCarouselCard;
  index: number;
  onChange: (card: RcsCarouselCard) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const suggestions = card.suggestions ?? [];

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
        <PersonalizedInput label="Title" value={card.title} onChange={(title) => onChange({ ...card, title })} maxLength={200} />
        <PersonalizedTextarea
          label="Description"
          value={card.description}
          onChange={(description) => onChange({ ...card, description })}
          rows={3}
          maxLength={2000}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <PersonalizedInput
            label="Media URL"
            value={card.media?.url ?? ''}
            onChange={(url) => onChange({ ...card, media: { ...card.media, url } })}
            placeholder="https://… or {{image_url}}"
          />
          <label>
            <span className={labelClass}>Media height</span>
            <select
              value={card.media?.height ?? 'MEDIUM'}
              onChange={(e) => onChange({ ...card, media: { ...card.media, height: e.target.value } })}
              className={selectClass}
            >
              <option value="SHORT">Short</option>
              <option value="MEDIUM">Medium</option>
              <option value="TALL">Tall</option>
            </select>
          </label>
        </div>
        <div>
          <p className={labelClass}>Suggestions</p>
          <SuggestionEditor
            suggestions={suggestions}
            onChange={(next) => onChange({ ...card, suggestions: next })}
            max={4}
          />
        </div>
      </div>
    </div>
  );
}

export function RcsTemplateBuilder({ content, onChange }: Props) {
  const c = normalizeRcsContent(content);
  const format = (c.format ?? 'rich_card') as RcsTemplateFormat;
  const patch = (next: Partial<RcsContent>) => onChange({ ...c, ...next });
  const suggestions = c.suggestions ?? [];

  const setFormat = (next: RcsTemplateFormat) => {
    if (next === format) return;
    onChange(emptyRcsContent(next));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-4">
        <p className="text-sm font-semibold text-fuchsia-900">RCS message</p>
        <p className="mt-1 text-xs text-fuchsia-700/80">
          Rich cards, carousels, and text with suggestion chips — matches Google RCS / RBM capabilities.
        </p>
      </div>

      <div>
        <span className={labelClass}>Message format</span>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {RCS_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFormat(opt.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                format === opt.id
                  ? 'border-fuchsia-400 bg-fuchsia-50/50 ring-2 ring-fuchsia-200/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
              <p className="mt-1 text-xs text-slate-500">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {format === 'text' && (
        <TemplateBuilderSection title="Message" required>
          <PersonalizedTextarea
            value={c.description}
            onChange={(description) => patch({ description })}
            rows={5}
            maxLength={2000}
            placeholder="Plain text message"
          />
        </TemplateBuilderSection>
      )}

      {format === 'rich_card' && (
        <>
          <TemplateBuilderSection title="Card layout">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Orientation</span>
                <select
                  value={c.orientation ?? 'VERTICAL'}
                  onChange={(e) => patch({ orientation: e.target.value })}
                  className={selectClass}
                >
                  <option value="VERTICAL">Vertical</option>
                  <option value="HORIZONTAL">Horizontal</option>
                </select>
              </label>
              <label>
                <span className={labelClass}>Media height</span>
                <select
                  value={c.media?.height ?? 'MEDIUM'}
                  onChange={(e) => patch({ media: { ...c.media, height: e.target.value } })}
                  className={selectClass}
                >
                  <option value="SHORT">Short</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="TALL">Tall</option>
                </select>
              </label>
            </div>
          </TemplateBuilderSection>

          <TemplateBuilderSection title="Content" required>
            <div className="space-y-3">
              <PersonalizedInput label="Title" value={c.title} onChange={(title) => patch({ title })} maxLength={200} />
              <PersonalizedTextarea
                label="Description"
                value={c.description}
                onChange={(description) => patch({ description })}
                rows={4}
                maxLength={2000}
              />
              <PersonalizedInput
                label="Media URL"
                value={c.media?.url ?? ''}
                onChange={(url) => patch({ media: { ...c.media, url } })}
                placeholder="https://…/image.jpg"
              />
            </div>
          </TemplateBuilderSection>
        </>
      )}

      {format === 'carousel' && (
        <>
          <TemplateBuilderSection title="Intro" description="Optional text shown above the carousel">
            <div className="space-y-3">
              <PersonalizedInput label="Title" value={c.title} onChange={(title) => patch({ title })} maxLength={200} />
              <PersonalizedTextarea
                label="Description"
                value={c.description}
                onChange={(description) => patch({ description })}
                rows={2}
                maxLength={2000}
              />
            </div>
          </TemplateBuilderSection>

          <TemplateBuilderSection
            title="Carousel cards"
            description="2–10 cards — each with media, title, description, and suggestions"
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
                        { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
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
                  onRemove={() => patch({ carousel_cards: (c.carousel_cards ?? []).filter((x) => x.id !== card.id) })}
                />
              ))}
            </div>
          </TemplateBuilderSection>
        </>
      )}

      {format !== 'carousel' && (
        <TemplateBuilderSection title="Suggestions" description="Action chips below the message (open URL, etc.)">
          <SuggestionEditor suggestions={suggestions} onChange={(next) => patch({ suggestions: next })} />
        </TemplateBuilderSection>
      )}

      <TemplateBuilderSection title="SMS fallback">
        <PersonalizedTextarea
          value={c.fallback?.text ?? ''}
          onChange={(text) => patch({ fallback: { channel: 'sms', text } })}
          rows={3}
          placeholder="Plain SMS if RCS is unavailable"
        />
      </TemplateBuilderSection>
    </div>
  );
}

function RichCardPreview({ content }: { content: RcsContent }) {
  const heightClass =
    content.media?.height === 'TALL' ? 'h-48' : content.media?.height === 'SHORT' ? 'h-24' : 'h-36';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      {content.media?.url ? (
        <img src={content.media.url} alt="" className={`${heightClass} w-full object-cover`} />
      ) : (
        <div className={`${heightClass} bg-gradient-to-br from-fuchsia-100 to-violet-100`} />
      )}
      <div className="p-4">
        <p className="font-semibold text-slate-900">{content.title || 'RCS card title'}</p>
        <p className="mt-1 text-sm text-slate-600">{content.description || 'Rich card description'}</p>
      </div>
      {(content.suggestions?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          {content.suggestions!.map((s, i) => (
            <span key={i} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {s.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselPreview({ content }: { content: RcsContent }) {
  const cards = content.carousel_cards ?? [];
  return (
    <div className="space-y-2">
      {(content.title || content.description) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {content.title && <p className="font-semibold text-slate-900">{content.title}</p>}
          {content.description && <p className="mt-1 text-sm text-slate-600">{content.description}</p>}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((card) => (
          <div key={card.id} className="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-fuchsia-50 to-violet-50">
              {card.media?.url ? (
                <img src={card.media.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-1 text-xs font-semibold text-slate-900">{card.title || 'Card title'}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{card.description || 'Description'}</p>
            </div>
            {(card.suggestions?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 px-2 py-2">
                {card.suggestions!.map((s, i) => (
                  <span key={i} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                    {s.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RcsTemplatePreview({ content }: { content: RcsContent }) {
  const c = normalizeRcsContent(content);
  const format = c.format ?? 'rich_card';

  return (
    <div className="mx-auto w-full max-w-sm">
      {format === 'carousel' ? (
        <CarouselPreview content={c} />
      ) : format === 'text' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm text-slate-800">{c.description || 'Text message'}</p>
          {(c.suggestions?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {c.suggestions!.map((s, i) => (
                <span key={i} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                  {s.text}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <RichCardPreview content={c} />
      )}
      <p className="mt-2 text-center text-[10px] text-slate-400">Google Messages · RCS preview</p>
    </div>
  );
}
