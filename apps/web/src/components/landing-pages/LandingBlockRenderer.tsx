/**
 * Landing Studio — block renderer (v2).
 *
 * Renders both the legacy 7 block types (ported verbatim from the original
 * LandingPageRenderer so existing published pages are byte-for-byte unchanged)
 * and the new v2 blocks. `BlockList` is shared by the public renderer, the
 * studio canvas, and — recursively — the `container` block.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Mail,
  Settings2,
  Layout,
  Image as ImageIcon,
  Code,
  Star,
  ChevronDown,
} from 'lucide-react';
import { getFormPublicUrl } from '@/lib/forms';
import type {
  LandingSection,
  LandingTheme,
  LandingSectionType,
} from '@/lib/landing-pages';

// ---------------------------------------------------------------------------
// Theme resolution — every v2 token is optional and falls back to the v1 look
// ---------------------------------------------------------------------------

export type ResolvedTheme = {
  primary: string;
  accent: string;
  text: string;
  background: string;
  buttonRadius: 'none' | 'md' | 'full';
  radiusClass: string;
  headingFontClass: string;
  bodyFontClass: string;
  contentMaxW: string;
  sectionPadY: string;
};

const FONT_CLASS: Record<string, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
  display: 'font-sans',
};

export function resolveTheme(theme?: LandingTheme): ResolvedTheme {
  const primary = theme?.primaryColor ?? '#4f46e5';
  const radius = theme?.radius;
  const radiusClass =
    radius === 'none'
      ? 'rounded-none'
      : radius === 'sm'
        ? 'rounded-md'
        : radius === 'lg'
          ? 'rounded-2xl'
          : radius === 'xl'
            ? 'rounded-3xl'
            : 'rounded-xl';
  const width = theme?.contentWidth;
  const contentMaxW =
    width === 'narrow'
      ? 'max-w-3xl'
      : width === 'wide'
        ? 'max-w-7xl'
        : width === 'full'
          ? 'max-w-none'
          : 'max-w-6xl';
  const spacing = theme?.sectionSpacing;
  const sectionPadY = spacing === 'compact' ? 'py-12' : spacing === 'spacious' ? 'py-28' : 'py-20';
  return {
    primary,
    accent: theme?.accentColor ?? primary,
    text: theme?.textColor ?? '#0f172a',
    background: theme?.background ?? '#ffffff',
    buttonRadius: theme?.buttonRadius ?? 'md',
    radiusClass,
    headingFontClass: FONT_CLASS[theme?.headingFont ?? theme?.fontFamily ?? 'sans'] ?? 'font-sans',
    bodyFontClass: FONT_CLASS[theme?.fontFamily ?? 'sans'] ?? 'font-sans',
    contentMaxW,
    sectionPadY,
  };
}

// ---------------------------------------------------------------------------
// Render context
// ---------------------------------------------------------------------------

export type BlockRenderCtx = {
  theme: ResolvedTheme;
  tenantId: string;
  environment: string;
  interactive?: boolean;
  /** when true, canvas text is directly editable in place */
  editable?: boolean;
  /** thumbnail mode — render raw HTML blocks as a placeholder (no style leak) */
  isolate?: boolean;
  selectedId?: string | null;
  onSelectSection?: (id: string) => void;
  /** commit an inline text edit — `patch` is a partial of the block's props */
  onInlineEdit?: (id: string, patch: Record<string, unknown>) => void;
  /** id of the block currently being rendered (set per-block by BlockBody) */
  blockId?: string;
};

/**
 * Text that renders as a plain string in the public/preview renderer, and as an
 * uncontrolled contentEditable span in the studio canvas (write DOM once, commit
 * on blur — the same approach the email studio settled on to keep the caret).
 */
type InlineTag = 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3';

export function InlineText({
  value,
  editable,
  onCommit,
  as = 'span',
  className,
}: {
  value: string;
  editable?: boolean;
  onCommit?: (next: string) => void;
  as?: InlineTag;
  className?: string;
}) {
  const Tag = as as React.ElementType;
  if (!editable) {
    return <Tag className={className}>{value}</Tag>;
  }
  return (
    <Tag
      className={`${className ?? ''} outline-none focus:ring-2 focus:ring-brand-400/60 focus:ring-offset-2`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.textContent ?? '';
        if (next !== value) onCommit?.(next);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && as !== 'div' && as !== 'p') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      dangerouslySetInnerHTML={{ __html: escapeHtml(value) }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const LEGACY_TYPES: LandingSectionType[] = ['hero', 'text', 'cta', 'form', 'image', 'features', 'html'];

// ---------------------------------------------------------------------------
// BlockList — maps sections, wraps each in a selectable shell, renders body
// ---------------------------------------------------------------------------

export function BlockList({
  sections,
  ctx,
  nested,
}: {
  sections: LandingSection[];
  ctx: BlockRenderCtx;
  nested?: boolean;
}) {
  if (sections.length === 0 && ctx.interactive) {
    return (
      <div
        className={`flex flex-col items-center justify-center border-2 border-dashed border-slate-200 text-slate-400 ${
          nested ? 'm-2 rounded-xl py-12' : 'm-8 rounded-2xl py-32'
        }`}
      >
        <Layout className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm font-medium text-slate-500">
          {nested ? 'Empty column' : 'Your page is empty'}
        </p>
        <p className="mt-1 text-xs">Add blocks from the left panel</p>
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <SelectableBlock key={section.id} section={section} ctx={ctx} />
      ))}
    </>
  );
}

function SelectableBlock({ section, ctx }: { section: LandingSection; ctx: BlockRenderCtx }) {
  const { interactive, selectedId, onSelectSection } = ctx;
  const selected = selectedId === section.id;
  return (
    <div
      data-block-id={section.id}
      className={`relative transition-all duration-150 ${interactive ? 'cursor-pointer group/blk' : ''} ${
        selected
          ? 'z-10 ring-2 ring-inset ring-brand-500'
          : interactive
            ? 'hover:ring-2 hover:ring-inset hover:ring-brand-200'
            : ''
      }`}
      onClick={(e) => {
        if (interactive && onSelectSection) {
          e.stopPropagation();
          onSelectSection(section.id);
        }
      }}
    >
      {interactive && selected && (
        <div className="absolute left-0 top-0 z-20 flex items-center gap-1 rounded-br-lg bg-brand-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
          {section.type}
        </div>
      )}
      <BlockBody section={section} ctx={ctx} />
    </div>
  );
}

function BlockBody({ section, ctx }: { section: LandingSection; ctx: BlockRenderCtx }) {
  if (LEGACY_TYPES.includes(section.type)) {
    return (
      <LegacySectionBlock
        section={section}
        primary={ctx.theme.primary}
        tenantId={ctx.tenantId}
        environment={ctx.environment}
        radius={ctx.theme.buttonRadius}
        editable={ctx.editable}
        isolate={ctx.isolate}
        onEdit={(patch) => ctx.onInlineEdit?.(section.id, patch)}
      />
    );
  }
  const bctx: BlockRenderCtx = { ...ctx, blockId: section.id };
  switch (section.type) {
    case 'container':
      return <ContainerBlock section={section} ctx={ctx} />;
    case 'navbar':
      return <NavbarBlock props={section.props} ctx={bctx} />;
    case 'footer':
      return <FooterBlock props={section.props} ctx={bctx} />;
    case 'testimonials':
      return <TestimonialsBlock props={section.props} ctx={bctx} />;
    case 'logos':
      return <LogosBlock props={section.props} ctx={bctx} />;
    case 'pricing':
      return <PricingBlock props={section.props} ctx={bctx} />;
    case 'faq':
      return <FaqBlock props={section.props} ctx={bctx} />;
    case 'stats':
      return <StatsBlock props={section.props} ctx={bctx} />;
    case 'gallery':
      return <GalleryBlock props={section.props} ctx={bctx} />;
    case 'video':
      return <VideoBlock props={section.props} ctx={bctx} />;
    case 'divider':
      return <DividerBlock props={section.props} />;
    case 'spacer':
      return <SpacerBlock props={section.props} />;
    case 'countdown':
      return <CountdownBlock props={section.props} ctx={bctx} />;
    default:
      return (
        <div className="border-y border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
          Unknown block: {(section as { type: string }).type}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers for v2 blocks
// ---------------------------------------------------------------------------

function padYClass(p?: string): string {
  switch (p) {
    case 'none':
      return 'py-0';
    case 'sm':
      return 'py-8';
    case 'md':
      return 'py-14';
    case 'lg':
      return 'py-24';
    case 'xl':
      return 'py-32';
    default:
      return '';
  }
}

function btnRadiusClass(r: 'none' | 'md' | 'full'): string {
  return r === 'none' ? 'rounded-none' : r === 'full' ? 'rounded-full' : 'rounded-lg';
}

function Section({
  ctx,
  layout,
  className = '',
  children,
}: {
  ctx: BlockRenderCtx;
  layout?: { paddingY?: string; background?: string; maxWidth?: string };
  className?: string;
  children: React.ReactNode;
}) {
  const pad = padYClass(layout?.paddingY) || ctx.theme.sectionPadY;
  return (
    <section className={`px-6 ${pad} ${className}`} style={layout?.background ? { background: layout.background } : undefined}>
      <div className={`mx-auto ${ctx.theme.contentMaxW}`}>{children}</div>
    </section>
  );
}

function Heading({
  ctx,
  children,
  field = 'title',
}: {
  ctx: BlockRenderCtx;
  children?: React.ReactNode;
  field?: string;
}) {
  const value = typeof children === 'string' ? children : '';
  if (!value && !ctx.editable) return null;
  return (
    <InlineText
      as="h2"
      editable={ctx.editable}
      value={value}
      onCommit={(v) => ctx.blockId && ctx.onInlineEdit?.(ctx.blockId, { [field]: v })}
      className={`block text-center text-3xl font-bold tracking-tight text-slate-900 ${ctx.theme.headingFontClass}`}
    />
  );
}

// ---------------------------------------------------------------------------
// v2 blocks
// ---------------------------------------------------------------------------

function ContainerBlock({
  section,
  ctx,
}: {
  section: Extract<LandingSection, { type: 'container' }>;
  ctx: BlockRenderCtx;
}) {
  const { children, columns, gap = 24, align = 'top', paddingY, background, maxWidth } = section.props;
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : columns === 3
          ? 'grid-cols-1 md:grid-cols-3'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  const alignClass = align === 'center' ? 'items-center' : align === 'bottom' ? 'items-end' : 'items-start';
  const mw =
    maxWidth === 'sm'
      ? 'max-w-3xl'
      : maxWidth === 'md'
        ? 'max-w-5xl'
        : maxWidth === 'lg'
          ? 'max-w-6xl'
          : maxWidth === 'full'
            ? 'max-w-none'
            : ctx.theme.contentMaxW;

  // Split flat children into `columns` buckets round-robin so a column block is
  // still usable before drag-into-column lands.
  const buckets: LandingSection[][] = Array.from({ length: columns }, () => []);
  children.forEach((c, i) => buckets[i % columns].push(c));

  return (
    <section
      className={`px-6 ${padYClass(paddingY) || 'py-10'}`}
      style={background ? { background } : undefined}
    >
      <div className={`mx-auto grid ${mw} ${colClass} ${alignClass}`} style={{ gap }}>
        {buckets.map((bucket, i) => (
          <div
            key={i}
            className="min-w-0"
            data-container-id={ctx.interactive ? section.id : undefined}
            data-col-index={ctx.interactive ? i : undefined}
          >
            <BlockList sections={bucket} ctx={ctx} nested />
          </div>
        ))}
      </div>
    </section>
  );
}

function NavbarBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'navbar' }>['props'];
  ctx: BlockRenderCtx;
}) {
  return (
    <header
      className={`${props.sticky ? 'sticky top-0 z-30' : ''} border-b border-slate-100 bg-white/90 backdrop-blur`}
    >
      <div className={`mx-auto flex ${ctx.theme.contentMaxW} items-center justify-between px-6 py-4`}>
        <div className="flex items-center gap-2 font-bold text-slate-900">
          {props.logoUrl ? (
            <img src={props.logoUrl} alt={props.logoText} className="h-7 w-auto" />
          ) : (
            <span className="text-lg">{props.logoText}</span>
          )}
        </div>
        <nav className="hidden items-center gap-7 md:flex">
          {props.links.map((l, i) => (
            <a key={i} href={l.url || '#'} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              {l.label}
            </a>
          ))}
        </nav>
        {props.ctaLabel && (
          <a
            href={props.ctaUrl || '#'}
            className={`${btnRadiusClass(ctx.theme.buttonRadius)} px-4 py-2 text-sm font-semibold text-white shadow-sm`}
            style={{ background: ctx.theme.primary }}
          >
            {props.ctaLabel}
          </a>
        )}
      </div>
    </header>
  );
}

function FooterBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'footer' }>['props'];
  ctx: BlockRenderCtx;
}) {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-6 py-16">
      <div className={`mx-auto ${ctx.theme.contentMaxW} grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]`}>
        <div>
          <p className="text-lg font-bold text-slate-900">{props.companyName}</p>
          {props.tagline && <p className="mt-2 max-w-xs text-sm text-slate-500">{props.tagline}</p>}
          {props.socialLinks && props.socialLinks.length > 0 && (
            <div className="mt-4 flex gap-4">
              {props.socialLinks.map((s, i) => (
                <a key={i} href={s.url || '#'} className="text-sm text-slate-500 hover:text-slate-900">
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
        {props.columns.map((col, i) => (
          <div key={i}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l, j) => (
                <li key={j}>
                  <a href={l.url || '#'} className="text-sm text-slate-600 hover:text-slate-900">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {props.legalText && (
        <div className={`mx-auto ${ctx.theme.contentMaxW} mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400`}>
          {props.legalText}
        </div>
      )}
    </footer>
  );
}

function TestimonialsBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'testimonials' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const single = props.layout === 'single';
  const cols = props.columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
  const items = single ? props.items.slice(0, 1) : props.items;
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      <div className={`mt-12 grid gap-6 ${single ? 'mx-auto max-w-2xl' : cols}`}>
        {items.map((t, i) => (
          <figure key={i} className={`rounded-2xl border border-slate-100 bg-white p-6 shadow-sm ${single ? 'text-center' : ''}`}>
            {typeof t.rating === 'number' && (
              <div className={`mb-3 flex gap-0.5 ${single ? 'justify-center' : ''}`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    className="h-4 w-4"
                    style={{ color: s < (t.rating ?? 0) ? ctx.theme.accent : '#e2e8f0' }}
                    fill={s < (t.rating ?? 0) ? ctx.theme.accent : 'none'}
                  />
                ))}
              </div>
            )}
            <blockquote className={`text-slate-700 ${single ? 'text-xl leading-relaxed' : 'text-[15px] leading-relaxed'}`}>
              “{t.quote}”
            </blockquote>
            <figcaption className={`mt-4 flex items-center gap-3 ${single ? 'justify-center' : ''}`}>
              {t.avatarUrl ? (
                <img src={t.avatarUrl} alt={t.author} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: ctx.theme.primary }}
                >
                  {t.author.slice(0, 1)}
                </span>
              )}
              <span className="text-sm">
                <span className="font-semibold text-slate-900">{t.author}</span>
                {t.role && <span className="block text-slate-500">{t.role}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function LogosBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'logos' }>['props'];
  ctx: BlockRenderCtx;
}) {
  return (
    <Section ctx={ctx} layout={props} className="!py-14">
      {props.title && (
        <p className="text-center text-sm font-semibold uppercase tracking-wider text-slate-400">{props.title}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
        {props.items.map((l, i) =>
          l.imageUrl ? (
            <img
              key={i}
              src={l.imageUrl}
              alt={l.name}
              className={`h-8 w-auto ${props.grayscale ? 'opacity-60 grayscale' : ''}`}
            />
          ) : (
            <span key={i} className="text-xl font-bold text-slate-300">
              {l.name}
            </span>
          ),
        )}
      </div>
    </Section>
  );
}

function PricingBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'pricing' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const cols =
    props.columns === 2
      ? 'md:grid-cols-2'
      : props.columns === 4
        ? 'md:grid-cols-2 lg:grid-cols-4'
        : 'md:grid-cols-3';
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      {props.subtitle && <p className="mt-3 text-center text-lg text-slate-500">{props.subtitle}</p>}
      <div className={`mt-14 grid gap-6 ${cols}`}>
        {props.tiers.map((tier, i) => (
          <div
            key={i}
            className={`flex flex-col rounded-2xl border bg-white p-7 ${
              tier.highlighted ? 'border-transparent shadow-xl ring-2' : 'border-slate-200 shadow-sm'
            }`}
            style={tier.highlighted ? { ['--tw-ring-color' as string]: ctx.theme.primary } : undefined}
          >
            <p className="text-sm font-semibold text-slate-900">{tier.name}</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-slate-900">{tier.price}</span>
              {tier.period && <span className="text-sm text-slate-500">{tier.period}</span>}
            </div>
            {tier.description && <p className="mt-2 text-sm text-slate-500">{tier.description}</p>}
            <ul className="mt-6 flex-1 space-y-3">
              {tier.features.map((f, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ctx.theme.accent }} />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={tier.ctaUrl || '#'}
              className={`mt-7 ${btnRadiusClass(ctx.theme.buttonRadius)} px-5 py-3 text-center text-sm font-semibold transition-opacity hover:opacity-90`}
              style={
                tier.highlighted
                  ? { background: ctx.theme.primary, color: '#fff' }
                  : { background: `${ctx.theme.primary}14`, color: ctx.theme.primary }
              }
            >
              {tier.ctaLabel}
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FaqBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'faq' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const [open, setOpen] = useState<number | null>(0);
  if (props.layout === 'grid') {
    return (
      <Section ctx={ctx} layout={props}>
        {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {props.items.map((it, i) => (
            <div key={i}>
              <p className="font-semibold text-slate-900">{it.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.answer}</p>
            </div>
          ))}
        </div>
      </Section>
    );
  }
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
        {props.items.map((it, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span className="font-medium text-slate-900">{it.question}</span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open === i ? 'rotate-180' : ''}`}
              />
            </button>
            {open === i && <p className="pb-5 text-sm leading-relaxed text-slate-600">{it.answer}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function StatsBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'stats' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const cols =
    props.columns === 2 ? 'sm:grid-cols-2' : props.columns === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3';
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      <div className={`mt-12 grid gap-8 text-center ${cols}`}>
        {props.items.map((s, i) => (
          <div key={i}>
            <p className="text-4xl font-bold tracking-tight md:text-5xl" style={{ color: ctx.theme.primary }}>
              {s.value}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">{s.label}</p>
            {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function GalleryBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'gallery' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const cols =
    props.columns === 2 ? 'sm:grid-cols-2' : props.columns === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3';
  const rounded = props.rounded === 'none' ? 'rounded-none' : props.rounded === 'xl' ? 'rounded-2xl' : 'rounded-lg';
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      <div className={`mt-12 grid gap-4 ${cols}`}>
        {props.images.map((img, i) => (
          <figure key={i}>
            {img.url ? (
              <img src={img.url} alt={img.alt} className={`h-full w-full object-cover ${rounded}`} />
            ) : (
              <div className={`flex aspect-[4/3] items-center justify-center bg-slate-100 text-slate-300 ${rounded}`}>
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            {img.caption && <figcaption className="mt-2 text-xs text-slate-500">{img.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </Section>
  );
}

function toEmbedUrl(raw: string, provider?: string): { kind: 'iframe' | 'video'; src: string } | null {
  if (!raw) return null;
  const url = raw.trim();
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if ((provider === 'youtube' || provider === 'auto' || !provider) && yt) {
    return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if ((provider === 'vimeo' || provider === 'auto' || !provider) && vm) {
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${vm[1]}` };
  }
  if (provider === 'mp4' || /\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return { kind: 'video', src: url };
  }
  if (/^https?:\/\//.test(url)) return { kind: 'iframe', src: url };
  return null;
}

function VideoBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'video' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const embed = toEmbedUrl(props.url, props.provider);
  const ratio = props.aspectRatio === '4:3' ? 'aspect-[4/3]' : props.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-video';
  return (
    <Section ctx={ctx} layout={props}>
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      <div className={`mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl bg-slate-900 shadow-xl ${ratio}`}>
        {!embed ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Paste a YouTube, Vimeo or MP4 URL
          </div>
        ) : embed.kind === 'iframe' ? (
          <iframe
            src={embed.src}
            title={props.title || 'Video'}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={embed.src} controls className="h-full w-full" />
        )}
      </div>
      {props.caption && <p className="mt-3 text-center text-sm text-slate-500">{props.caption}</p>}
    </Section>
  );
}

function DividerBlock({ props }: { props: Extract<LandingSection, { type: 'divider' }>['props'] }) {
  return (
    <div className="px-6 py-6">
      <div
        className={props.width === 'narrow' ? 'mx-auto max-w-3xl' : 'mx-auto max-w-6xl'}
        style={{
          borderTopWidth: props.thickness ?? 1,
          borderTopStyle: props.style ?? 'solid',
          borderTopColor: props.color ?? '#e2e8f0',
        }}
      />
    </div>
  );
}

function SpacerBlock({ props }: { props: Extract<LandingSection, { type: 'spacer' }>['props'] }) {
  return <div style={{ height: Math.max(0, props.height ?? 0) }} aria-hidden />;
}

function useCountdown(target: string) {
  const targetMs = useMemo(() => new Date(target).getTime(), [target]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, targetMs - now);
  return {
    expired: !Number.isFinite(targetMs) || diff <= 0,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function CountdownBlock({
  props,
  ctx,
}: {
  props: Extract<LandingSection, { type: 'countdown' }>['props'];
  ctx: BlockRenderCtx;
}) {
  const c = useCountdown(props.targetDate);
  const parts = [
    { v: c.days, l: 'days' },
    { v: c.hours, l: 'hrs' },
    { v: c.minutes, l: 'min' },
    { v: c.seconds, l: 'sec' },
  ];
  return (
    <Section ctx={ctx} layout={props} className="text-center">
      {(props.title || ctx.editable) && <Heading ctx={ctx}>{props.title ?? ''}</Heading>}
      {c.expired ? (
        <p className="mt-6 text-lg font-medium text-slate-500">{props.expiredText || 'This offer has ended.'}</p>
      ) : props.layout === 'inline' ? (
        <p className="mt-6 text-2xl font-bold tabular-nums text-slate-900">
          {parts.map((p) => `${p.v}${p.l[0]}`).join(' : ')}
        </p>
      ) : (
        <div className="mt-8 flex justify-center gap-3 sm:gap-5">
          {parts.map((p) => (
            <div
              key={p.l}
              className="min-w-[64px] rounded-xl border border-slate-200 bg-white px-3 py-4 shadow-sm sm:min-w-[84px]"
            >
              <div className="text-3xl font-bold tabular-nums text-slate-900 sm:text-4xl" style={{ color: ctx.theme.primary }}>
                {String(p.v).padStart(2, '0')}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{p.l}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ===========================================================================
// LEGACY renderer — ported verbatim from the original LandingPageRenderer.
// Do not "improve" this: existing published pages depend on it byte-for-byte.
// ===========================================================================

function LegacySectionBlock({
  section,
  primary,
  tenantId,
  environment,
  radius = 'md',
  editable,
  isolate,
  onEdit,
}: {
  section: LandingSection;
  primary: string;
  tenantId: string;
  environment: string;
  radius?: 'none' | 'md' | 'full';
  editable?: boolean;
  isolate?: boolean;
  onEdit?: (patch: Record<string, unknown>) => void;
}) {
  const getRadiusClass = () => {
    if (radius === 'none') return 'rounded-none';
    if (radius === 'full') return 'rounded-full';
    return 'rounded-lg';
  };

  const buttonClass = `inline-flex px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 ${getRadiusClass()}`;

  const animateClass =
    section.type === 'hero' && section.props.animateIn
      ? 'animate-in fade-in slide-in-from-bottom-4 duration-700'
      : '';

  switch (section.type) {
    case 'hero': {
      const {
        headline,
        subheadline,
        ctaLabel,
        ctaUrl,
        imageUrl,
        layout = 'center',
        imagePosition = 'right',
        backgroundGradient = 'none',
      } = section.props;

      let bgStyle = {};
      if (backgroundGradient === 'brand') {
        bgStyle = { background: `linear-gradient(135deg, ${primary}15 0%, transparent 100%)` };
      } else if (backgroundGradient === 'subtle') {
        bgStyle = { background: `linear-gradient(180deg, #f8fafc 0%, transparent 100%)` };
      }

      if (layout === 'split') {
        return (
          <section className="px-6 py-20 lg:py-32" style={bgStyle}>
            <div className={`mx-auto max-w-6xl grid gap-12 lg:grid-cols-2 items-center ${animateClass}`}>
              <div className={`${imagePosition === 'left' ? 'lg:order-2' : ''}`}>
                <InlineText
                  as="h1"
                  editable={editable}
                  value={headline}
                  onCommit={(v) => onEdit?.({ headline: v })}
                  className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-slate-900"
                />
                <InlineText
                  as="p"
                  editable={editable}
                  value={subheadline}
                  onCommit={(v) => onEdit?.({ subheadline: v })}
                  className="mt-6 text-lg leading-relaxed text-slate-600"
                />
                {ctaLabel && (
                  <div className="mt-8">
                    <a href={ctaUrl || '#'} className={buttonClass} style={{ background: primary }}>
                      {ctaLabel}
                    </a>
                  </div>
                )}
              </div>
              <div className={`${imagePosition === 'left' ? 'lg:order-1' : ''}`}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className={`w-full object-cover shadow-2xl ${getRadiusClass() === 'rounded-full' ? 'rounded-2xl' : getRadiusClass()}`}
                  />
                ) : (
                  <div
                    className={`w-full aspect-video bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 ${getRadiusClass() === 'rounded-full' ? 'rounded-2xl' : getRadiusClass()}`}
                  >
                    <ImageIcon className="h-12 w-12 opacity-20" />
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      }

      return (
        <section className="px-6 py-24 text-center" style={bgStyle}>
          <div className={`mx-auto max-w-3xl ${animateClass}`}>
            <InlineText
              as="h1"
              editable={editable}
              value={headline}
              onCommit={(v) => onEdit?.({ headline: v })}
              className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-slate-900"
            />
            <InlineText
              as="p"
              editable={editable}
              value={subheadline}
              onCommit={(v) => onEdit?.({ subheadline: v })}
              className="mt-6 text-lg leading-relaxed text-slate-600 max-w-2xl mx-auto"
            />
            {ctaLabel && (
              <div className="mt-10">
                <a href={ctaUrl || '#'} className={buttonClass} style={{ background: primary }}>
                  {ctaLabel}
                </a>
              </div>
            )}
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className={`mx-auto mt-16 max-h-[500px] w-full object-cover shadow-2xl ${getRadiusClass() === 'rounded-full' ? 'rounded-2xl' : getRadiusClass()}`}
              />
            )}
          </div>
        </section>
      );
    }

    case 'text': {
      const alignment =
        section.props.alignment === 'center'
          ? 'text-center mx-auto'
          : section.props.alignment === 'right'
            ? 'text-right ml-auto'
            : 'text-left mr-auto';
      return (
        <section className="px-6 py-16">
          {editable ? (
            <InlineText
              as="div"
              editable
              value={section.props.body}
              onCommit={(v) => onEdit?.({ body: v })}
              className={`max-w-3xl whitespace-pre-wrap text-base md:text-lg leading-relaxed text-slate-700 ${alignment}`}
            />
          ) : (
            <div className={`max-w-3xl whitespace-pre-wrap text-base md:text-lg leading-relaxed text-slate-700 ${alignment}`}>
              {section.props.body || <span className="text-slate-400 italic">Empty text block</span>}
            </div>
          )}
        </section>
      );
    }

    case 'features': {
      const cols =
        section.props.columns === 2
          ? 'sm:grid-cols-2'
          : section.props.columns === 4
            ? 'sm:grid-cols-2 lg:grid-cols-4'
            : 'sm:grid-cols-2 lg:grid-cols-3';
      return (
        <section className="bg-slate-50/50 border-y border-slate-100 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            {(section.props.title || editable) && (
              <InlineText
                as="h2"
                editable={editable}
                value={section.props.title}
                onCommit={(v) => onEdit?.({ title: v })}
                className="text-center text-3xl font-bold text-slate-900"
              />
            )}
            <div className={`mt-16 grid gap-8 ${cols}`}>
              {section.props.items.map((item, i) => (
                <div key={i} className={`bg-white border border-slate-100 p-8 shadow-sm ${getRadiusClass()}`}>
                  {item.icon === 'check' && <CheckCircle2 className="h-8 w-8 mb-4" style={{ color: primary }} />}
                  {item.icon === 'mail' && <Mail className="h-8 w-8 mb-4" style={{ color: primary }} />}
                  {item.icon === 'settings' && <Settings2 className="h-8 w-8 mb-4" style={{ color: primary }} />}
                  <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case 'cta': {
      let bgStyle = { background: `${primary}08` };
      if (section.props.backgroundGradient === 'brand') {
        bgStyle = { background: primary };
      }

      const isDarkBg = section.props.backgroundGradient === 'brand';
      const textColor = isDarkBg ? 'text-white' : 'text-slate-900';
      const subtextColor = isDarkBg ? 'text-white/80' : 'text-slate-600';

      if (section.props.layout === 'split') {
        return (
          <section className="px-6 py-16" style={bgStyle}>
            <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="flex-1">
                <InlineText
                  as="h2"
                  editable={editable}
                  value={section.props.headline}
                  onCommit={(v) => onEdit?.({ headline: v })}
                  className={`text-3xl font-bold ${textColor}`}
                />
                {(section.props.subheadline || editable) && (
                  <InlineText
                    as="p"
                    editable={editable}
                    value={section.props.subheadline ?? ''}
                    onCommit={(v) => onEdit?.({ subheadline: v })}
                    className={`mt-2 text-lg ${subtextColor}`}
                  />
                )}
              </div>
              <div>
                <a
                  href={section.props.buttonUrl || '#'}
                  className={`inline-flex px-8 py-4 text-base font-semibold shadow-md transition-opacity hover:opacity-90 ${getRadiusClass()}`}
                  style={isDarkBg ? { background: 'white', color: primary } : { background: primary, color: 'white' }}
                >
                  {section.props.buttonLabel}
                </a>
              </div>
            </div>
          </section>
        );
      }

      return (
        <section className="px-6 py-24 text-center" style={bgStyle}>
          <div className="mx-auto max-w-3xl">
            <InlineText
              as="h2"
              editable={editable}
              value={section.props.headline}
              onCommit={(v) => onEdit?.({ headline: v })}
              className={`text-3xl md:text-4xl font-bold ${textColor}`}
            />
            {(section.props.subheadline || editable) && (
              <InlineText
                as="p"
                editable={editable}
                value={section.props.subheadline ?? ''}
                onCommit={(v) => onEdit?.({ subheadline: v })}
                className={`mt-4 text-lg ${subtextColor}`}
              />
            )}
            <div className="mt-10">
              <a
                href={section.props.buttonUrl || '#'}
                className={`inline-flex px-8 py-4 text-base font-semibold shadow-md transition-opacity hover:opacity-90 ${getRadiusClass()}`}
                style={isDarkBg ? { background: 'white', color: primary } : { background: primary, color: 'white' }}
              >
                {section.props.buttonLabel}
              </a>
            </div>
          </div>
        </section>
      );
    }

    case 'image': {
      if (!section.props.url) {
        return (
          <section className="px-6 py-12">
            <div
              className={`mx-auto max-w-4xl aspect-video bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 ${getRadiusClass()}`}
            >
              <ImageIcon className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-medium">Image placeholder</p>
            </div>
          </section>
        );
      }

      const imgRadius =
        section.props.rounded === 'full'
          ? 'rounded-full'
          : section.props.rounded === 'xl'
            ? 'rounded-2xl'
            : section.props.rounded === 'md'
              ? 'rounded-lg'
              : 'rounded-none';

      return (
        <section className="px-6 py-16">
          <figure className="mx-auto max-w-5xl">
            <img src={section.props.url} alt={section.props.alt} className={`w-full shadow-xl object-cover ${imgRadius}`} />
            {section.props.caption && (
              <figcaption className="mt-4 text-center text-sm text-slate-500">{section.props.caption}</figcaption>
            )}
          </figure>
        </section>
      );
    }

    case 'form': {
      const formSlug = section.props.formSlug;
      const formHeadline = section.props.headline;
      const formLayout = section.props.layout || 'center';

      if (formLayout === 'split') {
        return (
          <section className="bg-slate-50/50 border-y border-slate-100 px-6 py-20">
            <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-12 items-start">
              <div className="pt-8">
                <h2 className="text-3xl font-bold text-slate-900 mb-6">{formHeadline}</h2>
                <div className="text-slate-600 whitespace-pre-wrap leading-relaxed text-lg">
                  {section.props.sideContent || 'Please fill out the form to continue.'}
                </div>
              </div>
              <div
                className={`bg-white shadow-xl border border-slate-100 ${getRadiusClass() === 'rounded-full' ? 'rounded-2xl' : getRadiusClass()} overflow-hidden`}
              >
                {!formSlug ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    <Layout className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    Select a published form for this section in the properties panel.
                  </div>
                ) : (
                  <iframe
                    src={getFormPublicUrl(formSlug, tenantId, environment)}
                    title={formHeadline}
                    className="w-full"
                    style={{ minHeight: 600, border: 0 }}
                  />
                )}
              </div>
            </div>
          </section>
        );
      }

      return (
        <section className="bg-slate-50 px-6 py-24">
          <div className="mx-auto max-w-2xl">
            {formHeadline && <h2 className="mb-10 text-center text-3xl font-bold text-slate-900">{formHeadline}</h2>}
            <div
              className={`bg-white shadow-xl border border-slate-100 ${getRadiusClass() === 'rounded-full' ? 'rounded-2xl' : getRadiusClass()} overflow-hidden`}
            >
              {!formSlug ? (
                <div className="p-16 text-center text-sm text-slate-500">
                  <Layout className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  Select a published form for this section in the properties panel.
                </div>
              ) : (
                <iframe
                  src={getFormPublicUrl(formSlug, tenantId, environment)}
                  title={formHeadline}
                  className="w-full"
                  style={{ minHeight: 600, border: 0 }}
                />
              )}
            </div>
          </div>
        </section>
      );
    }

    case 'html':
      return (
        <section className="w-full">
          {isolate && section.props.htmlCode ? (
            <div className="flex min-h-[80px] items-center justify-center bg-slate-50 py-8 text-xs text-slate-400">
              Custom HTML block
            </div>
          ) : section.props.htmlCode ? (
            <div dangerouslySetInnerHTML={{ __html: section.props.htmlCode }} />
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-slate-50 border-y border-slate-200">
              <Code className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm font-medium">Empty HTML Block</p>
              <p className="text-xs">Select this block and edit code in properties</p>
            </div>
          )}
        </section>
      );

    default:
      return null;
  }
}
