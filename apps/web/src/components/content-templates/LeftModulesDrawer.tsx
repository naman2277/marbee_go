import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  FileText,
  Grid,
  Image,
  Layers,
  LayoutGrid,
  List,
  Minus,
  Move,
  PanelBottom,
  Plus,
  Quote,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Table,
  Ticket,
  Type,
  Video,
  X,
  Zap,
} from 'lucide-react';
import type { EmailBlock } from '@/lib/email-builder-types';
import {
  EMAIL_MODULE_LIBRARY,
  EMAIL_MODULE_CATEGORY_MAP,
  searchEmailModules,
  type EmailModuleDef,
} from './email-module-library';

type Props = {
  open: boolean;
  onClose: () => void;
  onInsertModule: (moduleBlock: EmailBlock) => void;
  /** Preferred: insert every block of a multi-part module in one canvas update. */
  onInsertModules?: (blocks: EmailBlock[]) => void;
  onInsertRowStructure?: (cols: number[], layoutType?: string) => void;
};


const CONTENT_TILES = [
  { id: 'TITLE', label: 'Heading', desc: 'Section title', icon: Type, group: 'Text' },
  { id: 'PARAGRAPH', label: 'Text', desc: 'Body copy', icon: FileText, group: 'Text' },
  { id: 'LIST', label: 'List', desc: 'Bulleted / numbered', icon: List, group: 'Text' },
  { id: 'BUTTON', label: 'Button', desc: 'Call to action', icon: Zap, group: 'Text' },
  { id: 'IMAGE', label: 'Image', desc: 'Photo or graphic', icon: Image, group: 'Media' },
  { id: 'VIDEO', label: 'Video', desc: 'Thumbnail + link', icon: Video, group: 'Media' },
  { id: 'ICONS', label: 'Icons', desc: 'Icon + label row', icon: Star, group: 'Media' },
  { id: 'DIVIDER', label: 'Divider', desc: 'Horizontal rule', icon: Minus, group: 'Layout' },
  { id: 'SPACER', label: 'Spacer', desc: 'Vertical gap', icon: Move, group: 'Layout' },
  { id: 'TABLE', label: 'Table', desc: 'Rows & columns', icon: Table, group: 'Layout' },
  { id: 'SOCIAL', label: 'Social', desc: 'Follow links', icon: Plus, group: 'Advanced' },
  { id: 'HTML', label: 'HTML', desc: 'Custom markup', icon: Code, group: 'Advanced' },
  { id: 'COUPON', label: 'Coupon', desc: 'Promo code voucher', icon: Ticket, group: 'Commerce' },
  { id: 'COUNTDOWN', label: 'Countdown', desc: 'Deadline timer', icon: Clock, group: 'Commerce' },
  { id: 'PRODUCT_CARD', label: 'Product card', desc: 'Image, price & CTA', icon: ShoppingBag, group: 'Commerce' },
  { id: 'TESTIMONIAL', label: 'Testimonial', desc: 'Quote + author', icon: Quote, group: 'Commerce' },
  { id: 'FOOTER', label: 'Footer', desc: 'Address & unsubscribe', icon: PanelBottom, group: 'Layout' },
];
const CONTENT_GROUPS = ['Text', 'Media', 'Layout', 'Commerce', 'Advanced'] as const;

export const createBlockForTile = (tileId: string): EmailBlock => {
  const ts = Date.now().toString(36);
  switch (tileId) {
    case 'TITLE':
      return {
        id: `title-${ts}`,
        type: 'title',
        content: { text: 'Catchy Headline Goes Here', heading_level: 'h1' },
        styles: {
          font_size: 28,
          font_weight: '800',
          line_height: 1.2,
          text_color: '#0f172a',
          alignment: 'left',
          padding_top: 20,
          padding_bottom: 8,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'PARAGRAPH':
      return {
        id: `para-${ts}`,
        type: 'paragraph',
        content: {
          text: 'Write your story, announcement, or campaign message here. Engage your audience with clear, compelling copy that highlights value and drives conversions.',
        },
        styles: {
          font_size: 15,
          font_weight: 'normal',
          line_height: 1.6,
          text_color: '#475569',
          alignment: 'left',
          padding_top: 8,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'LIST':
      return {
        id: `list-${ts}`,
        type: 'list',
        content: {
          list_type: 'bullet',
          items: [
            'Exclusive early access to new collections',
            'Free expedited shipping on orders over $50',
            '24/7 dedicated VIP member priority support',
          ],
        },
        styles: {
          font_size: 14,
          line_height: 1.6,
          text_color: '#334155',
          padding_top: 12,
          padding_bottom: 12,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'BUTTON':
      return {
        id: `btn-${ts}`,
        type: 'button',
        content: { text: 'Claim Your Special Offer →', url: 'https://' },
        styles: {
          bg_color: '#6366f1',
          text_color: '#ffffff',
          border_radius: 8,
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'IMAGE':
      return {
        id: `img-${ts}`,
        type: 'image',
        content: {
          url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80',
          alt: 'Promotional Banner Image',
          link_url: 'https://',
        },
        styles: {
          border_radius: 12,
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'TABLE':
      return {
        id: `tbl-${ts}`,
        type: 'table',
        content: {
          headers: ['Product / Service', 'Qty', 'Price'],
          rows: [
            ['Marbee Enterprise Cloud', '1', '$149.00'],
            ['Dedicated IP Warmup', '1', '$29.00'],
            ['Total Amount', '', '$178.00'],
          ],
        },
        styles: {
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
          border_color: '#e2e8f0',
        },
      };
    case 'DIVIDER':
      return {
        id: `div-${ts}`,
        type: 'divider',
        content: {},
        styles: {
          border_color: '#e2e8f0',
          border_width: 1,
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'SPACER':
      return {
        id: `spc-${ts}`,
        type: 'spacer',
        content: { height: 28 },
        styles: { padding_top: 0, padding_bottom: 0 },
      };
    case 'SOCIAL':
      return {
        id: `soc-${ts}`,
        type: 'social',
        content: {
          links: [
            { platform: 'Twitter / X', url: 'https://twitter.com' },
            { platform: 'LinkedIn', url: 'https://linkedin.com' },
            { platform: 'Instagram', url: 'https://instagram.com' },
          ],
        },
        styles: {
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'HTML':
      return {
        id: `html-${ts}`,
        type: 'html',
        content: {
          code: '<div style="padding: 16px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; color: #475569; font-size: 13px;"><strong>Custom HTML Block</strong><br><span style="font-size: 11px; color: #94a3b8;">Click to edit HTML code in the right panel</span></div>',
        },
        styles: { padding_top: 12, padding_bottom: 12, padding_left: 24, padding_right: 24 },
      };
    case 'VIDEO':
      return {
        id: `vid-${ts}`,
        type: 'video',
        content: {
          video_url: 'https://youtube.com',
          thumbnail_url: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&auto=format&fit=crop&q=80',
          title: 'Watch Product Demo Video',
        },
        styles: {
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'ICONS':
      return {
        id: `ico-${ts}`,
        type: 'icons',
        content: {
          items: [
            { icon: '⭐', label: 'Top Rated' },
            { icon: '🚀', label: 'Fast Delivery' },
            { icon: '🛡️', label: '100% Secure' },
          ],
        },
        styles: {
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 24,
          padding_right: 24,
        },
      };
    case 'COUPON':
      return {
        id: `coupon-${ts}`,
        type: 'coupon',
        content: {
          code: 'WELCOME20',
          discount_label: '20% OFF',
          expiry_text: 'Expires in 48 hours',
        },
        styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24 },
      };
    case 'COUNTDOWN':
      return {
        id: `countdown-${ts}`,
        type: 'countdown',
        content: {
          label: '⏳ FLASH SALE ENDS SOON',
          subtext: 'Prices revert to normal once the timer expires',
          deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        },
        styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24 },
      };
    case 'PRODUCT_CARD':
      return {
        id: `product-${ts}`,
        type: 'product_card',
        content: {
          title: 'Marbee Pro Subscription',
          description: 'Access all enterprise marketing features.',
          price: '$49/mo',
          original_price: '$99/mo',
          badge: 'POPULAR',
          image_url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80',
          button_text: 'Claim Offer',
          button_url: 'https://',
        },
        styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24 },
      };
    case 'TESTIMONIAL':
      return {
        id: `quote-${ts}`,
        type: 'testimonial',
        content: {
          quote: '"Marbee increased our campaign open rates by 34% in the first week alone!"',
          author: 'Sarah Jenkins',
          role: 'VP of Marketing, TechFlow',
        },
        styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24 },
      };
    case 'FOOTER':
      return {
        id: `footer-${ts}`,
        type: 'footer',
        content: {
          company: 'Marbee Technologies Inc.',
          address: '100 Innovation Blvd, Suite 400, San Francisco, CA 94105',
          unsubscribe_url: 'https://marbee.io/unsubscribe?contact={{email}}',
        },
        styles: { padding_top: 20, padding_bottom: 20, padding_left: 24, padding_right: 24 },
      };
    default:
      return {
        id: `${tileId.toLowerCase()}-${ts}`,
        type: 'text',
        content: { text: `New ${tileId} Block` },
        styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24 },
      };
  }
};

export function LeftModulesDrawer({
  open,
  onClose,
  onInsertModule,
  onInsertModules,
  onInsertRowStructure,
}: Props) {
  const [activeSegment, setActiveSegment] = useState<'structure' | 'modules' | 'content'>('modules');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [scope, setScope] = useState('General modules');
  const [search, setSearch] = useState('');

  const searchResults = useMemo(() => searchEmailModules(search), [search]);
  const activeCategory = activeCategoryId ? EMAIL_MODULE_CATEGORY_MAP[activeCategoryId] : null;

  if (!open) return null;

  const insertModule = (mod: EmailModuleDef) => {
    const built = mod.build();
    if (onInsertModules) {
      onInsertModules(built);
    } else {
      built.forEach((b) => onInsertModule(b));
    }
  };

  const handleSelectStructure = (cols: number[]) => {
    if (onInsertRowStructure) {
      onInsertRowStructure(cols);
    } else {
      onInsertModule({
        id: `row-${Date.now().toString(36)}`,
        type: 'columns',
        content: { columns: cols.map((w, i) => ({ id: `col-${i}`, width: w, content: null })) },
        styles: { padding_top: 20, padding_bottom: 20 },
      });
    }
  };

  const ModuleCard = ({ mod }: { mod: EmailModuleDef }) => (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => insertModule(mod)}
        className="group relative block w-full cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-left shadow-2xs transition hover:border-violet-500 hover:bg-white hover:shadow-md hover:ring-1 hover:ring-violet-300"
        title={`Insert “${mod.name}”`}
      >
        <div className="pointer-events-none flex min-h-[52px] items-center justify-center">
          {mod.preview}
        </div>
        <span className="absolute right-2 top-2 rounded-md bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 shadow-xs transition group-hover:opacity-100">
          + Add
        </span>
      </button>
      <div className="flex items-center justify-between px-0.5">
        <span className="truncate text-[11px] font-semibold text-slate-700">{mod.name}</span>
        {mod.tags[0] && (
          <span className="shrink-0 text-[9px] font-medium text-slate-400">#{mod.tags[0]}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="z-20 flex h-full w-80 shrink-0 select-none flex-col overflow-hidden border-r border-slate-200 bg-white shadow-xs animate-in slide-in-from-left-4 duration-200">
      {/* ============ CATEGORY DETAIL VIEW (any category) ============ */}
      {activeCategory ? (
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveCategoryId(null)}
                className="cursor-pointer rounded-lg p-1 text-slate-500 transition hover:bg-slate-100"
                title="Back to categories"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-slate-900">{activeCategory.name}</div>
                <div className="truncate text-[10px] text-slate-400">{activeCategory.blurb}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
              title="Fold Modules Drawer"
            >
              <span>Fold</span>
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
            <p className="px-0.5 text-[10px] font-medium text-slate-400">
              {activeCategory.modules.length} modules · click to add to canvas
            </p>
            {activeCategory.modules.map((mod) => (
              <ModuleCard key={mod.id} mod={mod} />
            ))}
          </div>
        </div>
      ) : (
        /* ================= STANDARD DRAWER TABS ================= */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-white p-2.5">
            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-slate-500">
              <button
                type="button"
                onClick={() => setActiveSegment('structure')}
                className={`cursor-pointer rounded-lg p-1.5 px-3 transition ${
                  activeSegment === 'structure'
                    ? 'bg-white font-bold text-slate-900 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-900'
                }`}
                title="Structure / Column Layouts"
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveSegment('modules')}
                className={`cursor-pointer rounded-lg p-1.5 px-3 transition ${
                  activeSegment === 'modules'
                    ? 'bg-white font-bold text-slate-900 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-900'
                }`}
                title="Prebuilt Modules"
              >
                <Layers className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveSegment('content')}
                className={`cursor-pointer rounded-lg p-1.5 px-3 transition ${
                  activeSegment === 'content'
                    ? 'bg-white font-bold text-slate-900 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-900'
                }`}
                title="Content Elements"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:bg-slate-100 hover:text-slate-800"
              title="Fold Drawer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>

          {/* TAB 1: STRUCTURE */}
          {activeSegment === 'structure' && (
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs [scrollbar-width:thin]">
              {/* Quick equal columns */}
              <div className="space-y-1.5">
                <div className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Equal columns
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleSelectStructure(Array.from({ length: n }, () => Math.round(100 / n)))}
                      title={`${n} equal column${n > 1 ? 's' : ''}`}
                      className="group flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white transition hover:border-violet-400 hover:bg-violet-50"
                    >
                      <span className="flex h-4 w-6 items-center gap-[2px]">
                        {Array.from({ length: n }).map((_, i) => (
                          <span key={i} className="h-full flex-1 rounded-[2px] bg-slate-300 group-hover:bg-violet-400" />
                        ))}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 group-hover:text-violet-700">{n}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ratio layouts */}
              <div className="space-y-1.5">
                <div className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ratio layouts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [50, 50],
                    [70, 30],
                    [30, 70],
                    [60, 20, 20],
                    [20, 60, 20],
                    [40, 40, 20],
                  ].map((cols) => (
                    <button
                      key={cols.join('-')}
                      type="button"
                      onClick={() => handleSelectStructure(cols)}
                      title={`Add ${cols.join(' / ')} layout`}
                      className="group flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-violet-400 hover:shadow-md"
                    >
                      <span className="flex h-6 w-full items-center gap-1">
                        {cols.map((width, idx) => (
                          <span
                            key={idx}
                            style={{ width: `${width}%` }}
                            className="h-full rounded-[3px] bg-slate-200 group-hover:bg-violet-300"
                          />
                        ))}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-700">
                        {cols.join(' / ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREBUILT MODULES */}
          {activeSegment === 'modules' && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="px-3 pt-3">
                <div className="relative">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-xs font-semibold text-slate-800 shadow-2xs focus:border-violet-500 focus:outline-hidden"
                  >
                    <option value="General modules">🗂️ General modules</option>
                    <option value="My saved modules">⭐ My saved modules</option>
                    <option value="Brand kit modules">🎨 Brand kit modules</option>
                    <option value="E-commerce modules">🛍️ E-commerce modules</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div className="px-3 pb-2 pt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search modules by name or #tag"
                    className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-8 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:outline-hidden"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-2 cursor-pointer rounded p-0.5 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <SlidersHorizontal className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* SEARCH RESULTS */}
              {search ? (
                <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
                  <p className="px-0.5 text-[10px] font-medium text-slate-400">
                    {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search}”
                  </p>
                  {searchResults.map(({ category, module }) => (
                    <div key={`${category.id}-${module.id}`}>
                      <div className="mb-1 px-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {category.name}
                      </div>
                      <ModuleCard mod={module} />
                    </div>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-400">
                      No modules match that search.
                    </div>
                  )}
                </div>
              ) : (
                /* CATEGORY LIST */
                <div className="flex-1 divide-y divide-slate-50 overflow-y-auto px-3 py-1 text-xs [scrollbar-width:thin]">
                  {EMAIL_MODULE_LIBRARY.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div key={cat.id} className="pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveCategoryId(cat.id)}
                          className="group flex w-full cursor-pointer items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-violet-100 group-hover:text-violet-600">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs font-medium leading-snug text-slate-700 group-hover:text-slate-900">
                              {cat.name}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 group-hover:bg-slate-200">
                              {cat.modules.length}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-violet-600" />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONTENT TILES */}
          {activeSegment === 'content' && (
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs [scrollbar-width:thin]">
              {CONTENT_GROUPS.map((group) => (
                <div key={group} className="space-y-1.5">
                  <div className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTENT_TILES.filter((t) => t.group === group).map((tile) => {
                      const Icon = tile.icon;
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          onClick={() => onInsertModule(createBlockForTile(tile.id))}
                          className="group flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-violet-400 hover:shadow-md"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-violet-100 group-hover:text-violet-600">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold text-slate-800 group-hover:text-violet-700">
                              {tile.label}
                            </span>
                            <span className="block truncate text-[10px] text-slate-400">{tile.desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
