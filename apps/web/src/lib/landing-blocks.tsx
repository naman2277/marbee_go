/**
 * Landing Studio — block registry (v2).
 *
 * Single source of truth for the *catalogue* of blocks the studio can insert:
 * label, category, icon, search keywords. Default props live in
 * `createLandingSection` (lib/landing-pages.ts) so there is exactly one factory;
 * rendering lives in components/landing-pages/LandingBlockRenderer.tsx.
 *
 * The legacy 7 block types (hero/text/features/cta/form/image/html) are included
 * here unchanged so the old list keeps working — nothing about their behaviour
 * changes.
 */
import {
  MonitorPlay,
  Type,
  LayoutGrid,
  MousePointerClick,
  ClipboardList,
  Image as ImageIcon,
  Code,
  PanelTop,
  PanelBottom,
  Quote,
  Building2,
  BadgeDollarSign,
  HelpCircle,
  BarChart3,
  Images,
  Video,
  Minus,
  MoveVertical,
  Timer,
  Columns3,
  type LucideIcon,
} from 'lucide-react';
import type { LandingSectionType } from './landing-pages';

export type LandingBlockCategory =
  | 'Layout'
  | 'Hero'
  | 'Content'
  | 'Social proof'
  | 'Conversion'
  | 'Media'
  | 'Advanced';

export type LandingBlockMeta = {
  type: LandingSectionType;
  label: string;
  description: string;
  category: LandingBlockCategory;
  icon: LucideIcon;
  keywords: string[];
  /** true for the original v1 block types */
  legacy?: boolean;
  /** can hold nested blocks */
  container?: boolean;
};

export const LANDING_BLOCKS: LandingBlockMeta[] = [
  // Layout
  { type: 'container', label: 'Columns', description: 'A row that holds other blocks in 1–4 columns', category: 'Layout', icon: Columns3, keywords: ['row', 'grid', 'column', 'layout', 'section', 'group'], container: true },
  { type: 'spacer', label: 'Spacer', description: 'Adjustable vertical space', category: 'Layout', icon: MoveVertical, keywords: ['gap', 'space', 'padding', 'whitespace'] },
  { type: 'divider', label: 'Divider', description: 'A horizontal rule', category: 'Layout', icon: Minus, keywords: ['line', 'hr', 'separator', 'rule'] },
  { type: 'navbar', label: 'Navbar', description: 'Top navigation with logo and links', category: 'Layout', icon: PanelTop, keywords: ['header', 'menu', 'navigation', 'top'] },
  { type: 'footer', label: 'Footer', description: 'Footer with link columns and legal text', category: 'Layout', icon: PanelBottom, keywords: ['bottom', 'links', 'legal', 'copyright'] },

  // Hero
  { type: 'hero', label: 'Hero', description: 'Headline, subtext and a call to action', category: 'Hero', icon: MonitorPlay, keywords: ['header', 'banner', 'headline', 'intro'], legacy: true },

  // Content
  { type: 'text', label: 'Text', description: 'A rich paragraph block', category: 'Content', icon: Type, keywords: ['paragraph', 'copy', 'body', 'rich text'], legacy: true },
  { type: 'features', label: 'Features', description: 'A grid of feature cards', category: 'Content', icon: LayoutGrid, keywords: ['grid', 'benefits', 'cards', 'icons'], legacy: true },
  { type: 'faq', label: 'FAQ', description: 'Expandable question / answer list', category: 'Content', icon: HelpCircle, keywords: ['questions', 'accordion', 'help', 'answers'] },
  { type: 'stats', label: 'Stats', description: 'Big-number metrics row', category: 'Content', icon: BarChart3, keywords: ['numbers', 'metrics', 'kpi', 'counter'] },

  // Social proof
  { type: 'testimonials', label: 'Testimonials', description: 'Customer quotes with attribution', category: 'Social proof', icon: Quote, keywords: ['reviews', 'quotes', 'customers', 'social proof'] },
  { type: 'logos', label: 'Logo cloud', description: 'A strip of customer / partner logos', category: 'Social proof', icon: Building2, keywords: ['brands', 'clients', 'partners', 'trusted by'] },

  // Conversion
  { type: 'cta', label: 'Call to action', description: 'A focused conversion prompt', category: 'Conversion', icon: MousePointerClick, keywords: ['button', 'convert', 'signup', 'banner'], legacy: true },
  { type: 'form', label: 'Form embed', description: 'Embed a published Marbee form', category: 'Conversion', icon: ClipboardList, keywords: ['lead', 'capture', 'signup', 'contact', 'form'], legacy: true },
  { type: 'pricing', label: 'Pricing', description: 'Pricing tiers with feature lists', category: 'Conversion', icon: BadgeDollarSign, keywords: ['plans', 'tiers', 'cost', 'subscribe'] },
  { type: 'countdown', label: 'Countdown', description: 'Urgency timer to a target date', category: 'Conversion', icon: Timer, keywords: ['timer', 'urgency', 'deadline', 'offer'] },

  // Media
  { type: 'image', label: 'Image', description: 'A single image with optional caption', category: 'Media', icon: ImageIcon, keywords: ['picture', 'photo', 'screenshot'], legacy: true },
  { type: 'gallery', label: 'Gallery', description: 'A grid of images', category: 'Media', icon: Images, keywords: ['photos', 'grid', 'screenshots', 'masonry'] },
  { type: 'video', label: 'Video', description: 'Embed a YouTube, Vimeo or MP4 video', category: 'Media', icon: Video, keywords: ['youtube', 'vimeo', 'embed', 'media', 'player'] },

  // Advanced
  { type: 'html', label: 'Custom HTML', description: 'Raw HTML / CSS block', category: 'Advanced', icon: Code, keywords: ['embed', 'code', 'script', 'custom'], legacy: true },
];

export const LANDING_BLOCK_CATEGORIES: LandingBlockCategory[] = [
  'Layout',
  'Hero',
  'Content',
  'Social proof',
  'Conversion',
  'Media',
  'Advanced',
];

const BY_TYPE = new Map(LANDING_BLOCKS.map((b) => [b.type, b]));

export function getBlockMeta(type: LandingSectionType): LandingBlockMeta {
  return (
    BY_TYPE.get(type) ?? {
      type,
      label: type,
      description: '',
      category: 'Advanced',
      icon: Code,
      keywords: [],
    }
  );
}

export function searchBlocks(query: string): LandingBlockMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return LANDING_BLOCKS;
  return LANDING_BLOCKS.filter(
    (b) =>
      b.label.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      b.keywords.some((k) => k.includes(q)),
  );
}

// ---------------------------------------------------------------------------
// Block-tree helpers (top level stays a flat array; `container` blocks nest)
// ---------------------------------------------------------------------------

import type { LandingSection } from './landing-pages';

/** Recursively replace the props of the block with `id`, searching into containers. */
export function updateBlockInTree(
  sections: LandingSection[],
  id: string,
  props: LandingSection['props'],
): LandingSection[] {
  return sections.map((s) => {
    if (s.id === id) return { ...s, props } as LandingSection;
    if (s.type === 'container') {
      return {
        ...s,
        props: { ...s.props, children: updateBlockInTree(s.props.children, id, props) },
      } as LandingSection;
    }
    return s;
  });
}

/** Recursively remove the block with `id`. */
export function removeBlockFromTree(sections: LandingSection[], id: string): LandingSection[] {
  return sections
    .filter((s) => s.id !== id)
    .map((s) =>
      s.type === 'container'
        ? ({ ...s, props: { ...s.props, children: removeBlockFromTree(s.props.children, id) } } as LandingSection)
        : s,
    );
}

/** Recursively find a block by id. */
export function findBlockInTree(sections: LandingSection[], id: string): LandingSection | null {
  for (const s of sections) {
    if (s.id === id) return s;
    if (s.type === 'container') {
      const hit = findBlockInTree(s.props.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Deep-clone a block subtree with fresh ids. */
export function cloneBlock(section: LandingSection): LandingSection {
  const id = crypto.randomUUID();
  if (section.type === 'container') {
    return {
      id,
      type: 'container',
      props: { ...section.props, children: section.props.children.map(cloneBlock) },
    };
  }
  return { ...section, id, props: JSON.parse(JSON.stringify(section.props)) } as LandingSection;
}

/** Count every block including nested ones. */
export function countBlocks(sections: LandingSection[]): number {
  return sections.reduce(
    (n, s) => n + 1 + (s.type === 'container' ? countBlocks(s.props.children) : 0),
    0,
  );
}
