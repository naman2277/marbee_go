import type { RcsContent, RcsCarouselCard, RcsSuggestion } from './content-templates';

export type RcsTemplateFormat = 'rich_card' | 'carousel' | 'text';

export const RCS_FORMAT_OPTIONS: Array<{ id: RcsTemplateFormat; label: string; description: string }> = [
  { id: 'rich_card', label: 'Rich card', description: 'Single card with media, title, and action chips' },
  { id: 'carousel', label: 'Carousel', description: '2–10 scrollable cards with media and suggestions' },
  { id: 'text', label: 'Text', description: 'Plain text message with optional suggestions' },
];

export function normalizeRcsContent(raw: RcsContent): RcsContent {
  let format: RcsTemplateFormat =
    raw.format === 'carousel' || raw.format === 'text' ? raw.format : 'rich_card';
  if (raw.carousel_cards?.length) format = 'carousel';

  const suggestions = (raw.suggestions ?? []).map((s) => ({
    type: s.type || 'open_url',
    text: s.text ?? '',
    url: s.url,
  }));

  const carousel_cards: RcsCarouselCard[] =
    raw.carousel_cards?.map((card) => ({
      id: card.id || crypto.randomUUID(),
      title: card.title ?? '',
      description: card.description ?? '',
      media: card.media,
      suggestions: (card.suggestions ?? []).map((s) => ({
        type: s.type || 'open_url',
        text: s.text ?? '',
        url: s.url,
      })),
    })) ??
    (format === 'carousel'
      ? [
          { id: crypto.randomUUID(), title: raw.title ?? '', description: raw.description ?? '', media: raw.media, suggestions: [] },
          { id: crypto.randomUUID(), title: '', description: '', suggestions: [] },
        ]
      : []);

  return {
    format,
    title: raw.title ?? '',
    description: raw.description ?? '',
    orientation: raw.orientation ?? 'VERTICAL',
    media: raw.media,
    suggestions,
    fallback: raw.fallback,
    carousel_cards: format === 'carousel' ? carousel_cards : [],
  };
}

export function emptyRcsContent(format: RcsTemplateFormat = 'rich_card'): RcsContent {
  const base: RcsContent = {
    format,
    title: '',
    description: '',
    orientation: 'VERTICAL',
    media: { height: 'MEDIUM' },
    suggestions: [],
    fallback: { channel: 'sms', text: '' },
    carousel_cards: [],
  };

  if (format === 'carousel') {
    base.carousel_cards = [
      { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
      { id: crypto.randomUUID(), title: '', description: '', media: { height: 'MEDIUM' }, suggestions: [] },
    ];
  }

  return base;
}

export function emptyRcsSuggestion(): RcsSuggestion {
  return { type: 'open_url', text: 'Learn more', url: 'https://' };
}
