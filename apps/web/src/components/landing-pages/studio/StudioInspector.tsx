/** Landing Studio — right-hand properties panel, one editor per block type. */
import { MousePointerClick } from 'lucide-react';
import type { LandingSection, LandingBlockLayout } from '@/lib/landing-pages';
import { getBlockMeta } from '@/lib/landing-blocks';
import { ImagePicker } from '../ImagePicker';
import {
  PanelSection,
  TextField,
  TextArea,
  NumberField,
  RangeField,
  SelectField,
  SegControl,
  ColorField,
  ToggleField,
  ListEditor,
  StringListField,
  Field,
} from './StudioFields';

type Props = {
  section: LandingSection | null;
  formOptions: Array<{ slug: string; name: string }>;
  onChange: (props: LandingSection['props']) => void;
};

export function StudioInspector({ section, formOptions, onChange }: Props) {
  if (!section) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400">
        <MousePointerClick className="mb-3 h-8 w-8 opacity-20" />
        <p className="text-sm">Select a block on the canvas to edit it.</p>
      </div>
    );
  }
  const meta = getBlockMeta(section.type);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = section.props;
  const set = (patch: Record<string, unknown>) => onChange({ ...p, ...patch });

  return (
    <div className="divide-y divide-slate-100">
      <div className="flex items-center gap-2 px-4 py-3">
        <meta.icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-900">{meta.label}</span>
      </div>

      <BlockEditor section={section} p={p} set={set} formOptions={formOptions} />

      {!meta.legacy && section.type !== 'spacer' && section.type !== 'divider' && (
        <LayoutSection p={p} set={set} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LayoutSection({
  p,
  set,
}: {
  p: LandingBlockLayout;
  set: (patch: Record<string, unknown>) => void;
}) {
  return (
    <PanelSection title="Layout" defaultOpen={false}>
      <SegControl
        label="Vertical padding"
        value={p.paddingY ?? 'default'}
        onChange={(v) => set({ paddingY: v === 'default' ? undefined : v })}
        options={[
          { value: 'default', label: 'Auto' },
          { value: 'sm', label: 'S' },
          { value: 'md', label: 'M' },
          { value: 'lg', label: 'L' },
          { value: 'xl', label: 'XL' },
        ]}
      />
      <SelectField
        label="Max width"
        value={p.maxWidth ?? 'default'}
        onChange={(v) => set({ maxWidth: v === 'default' ? undefined : v })}
        options={[
          { value: 'default', label: 'Theme default' },
          { value: 'sm', label: 'Narrow' },
          { value: 'md', label: 'Medium' },
          { value: 'lg', label: 'Wide' },
          { value: 'xl', label: 'Extra wide' },
          { value: 'full', label: 'Full bleed' },
        ]}
      />
      <ColorField label="Background" value={p.background} onChange={(v) => set({ background: v })} fallback="#ffffff" />
      {p.background && (
        <button type="button" className="text-[11px] text-slate-400 hover:text-red-600" onClick={() => set({ background: undefined })}>
          Clear background
        </button>
      )}
      <TextField
        label="Anchor ID"
        value={p.anchorId ?? ''}
        onChange={(v) => set({ anchorId: v.replace(/[^a-zA-Z0-9-_]/g, '') })}
        hint="Link to this block with #your-id"
      />
      <ToggleField label="Hide on mobile" value={Boolean(p.hideOnMobile)} onChange={(v) => set({ hideOnMobile: v })} />
      <ToggleField label="Hide on desktop" value={Boolean(p.hideOnDesktop)} onChange={(v) => set({ hideOnDesktop: v })} />
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------

function BlockEditor({
  section,
  p,
  set,
  formOptions,
}: {
  section: LandingSection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  p: any;
  set: (patch: Record<string, unknown>) => void;
  formOptions: Array<{ slug: string; name: string }>;
}) {
  switch (section.type) {
    // ---- legacy -----------------------------------------------------------
    case 'hero':
      return (
        <>
          <PanelSection title="Content">
            <TextField label="Headline" value={p.headline} onChange={(v) => set({ headline: v })} />
            <TextArea label="Subheadline" value={p.subheadline} onChange={(v) => set({ subheadline: v })} />
            <TextField label="Button label" value={p.ctaLabel} onChange={(v) => set({ ctaLabel: v })} />
            <TextField label="Button URL" value={p.ctaUrl} onChange={(v) => set({ ctaUrl: v })} />
            <ImagePicker label="Hero image" value={p.imageUrl ?? ''} onChange={(v) => set({ imageUrl: v })} />
          </PanelSection>
          <PanelSection title="Style" defaultOpen={false}>
            <SegControl
              label="Layout"
              value={p.layout ?? 'center'}
              onChange={(v) => set({ layout: v })}
              options={[
                { value: 'center', label: 'Centered' },
                { value: 'split', label: 'Split' },
              ]}
            />
            {p.layout === 'split' && (
              <SegControl
                label="Image position"
                value={p.imagePosition ?? 'right'}
                onChange={(v) => set({ imagePosition: v })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            )}
            <SelectField
              label="Background"
              value={p.backgroundGradient ?? 'none'}
              onChange={(v) => set({ backgroundGradient: v })}
              options={[
                { value: 'none', label: 'Solid' },
                { value: 'brand', label: 'Brand gradient' },
                { value: 'subtle', label: 'Subtle fade' },
              ]}
            />
            <ToggleField label="Animate in" value={Boolean(p.animateIn)} onChange={(v) => set({ animateIn: v })} />
          </PanelSection>
        </>
      );
    case 'text':
      return (
        <PanelSection title="Content">
          <SegControl
            label="Alignment"
            value={p.alignment ?? 'left'}
            onChange={(v) => set({ alignment: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
          <TextArea label="Body" value={p.body} onChange={(v) => set({ body: v })} rows={12} />
        </PanelSection>
      );
    case 'cta':
      return (
        <PanelSection title="Content">
          <SegControl
            label="Layout"
            value={p.layout ?? 'center'}
            onChange={(v) => set({ layout: v })}
            options={[
              { value: 'center', label: 'Centered' },
              { value: 'split', label: 'Split' },
            ]}
          />
          <SegControl
            label="Background"
            value={p.backgroundGradient ?? 'none'}
            onChange={(v) => set({ backgroundGradient: v })}
            options={[
              { value: 'none', label: 'Subtle' },
              { value: 'brand', label: 'Brand' },
            ]}
          />
          <TextField label="Headline" value={p.headline} onChange={(v) => set({ headline: v })} />
          <TextArea label="Subheadline" value={p.subheadline ?? ''} onChange={(v) => set({ subheadline: v })} />
          <TextField label="Button label" value={p.buttonLabel} onChange={(v) => set({ buttonLabel: v })} />
          <TextField label="Button URL" value={p.buttonUrl} onChange={(v) => set({ buttonUrl: v })} />
        </PanelSection>
      );
    case 'form':
      return (
        <PanelSection title="Content">
          <SegControl
            label="Layout"
            value={p.layout ?? 'center'}
            onChange={(v) => set({ layout: v })}
            options={[
              { value: 'center', label: 'Centered' },
              { value: 'split', label: 'Split' },
            ]}
          />
          <Field label="Form">
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={p.formSlug}
              onChange={(e) => set({ formSlug: e.target.value })}
            >
              <option value="">(No form selected)</option>
              {formOptions.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <TextField label="Headline" value={p.headline} onChange={(v) => set({ headline: v })} />
          {p.layout === 'split' && (
            <TextArea label="Side content" value={p.sideContent ?? ''} onChange={(v) => set({ sideContent: v })} />
          )}
        </PanelSection>
      );
    case 'image':
      return (
        <PanelSection title="Content">
          <ImagePicker label="Image" value={p.url} onChange={(v) => set({ url: v })} />
          <TextField label="Alt text" value={p.alt} onChange={(v) => set({ alt: v })} />
          <TextField label="Caption" value={p.caption ?? ''} onChange={(v) => set({ caption: v })} />
          <SelectField
            label="Corner radius"
            value={p.rounded ?? 'none'}
            onChange={(v) => set({ rounded: v })}
            options={[
              { value: 'none', label: 'Sharp' },
              { value: 'md', label: 'Rounded' },
              { value: 'xl', label: 'Extra rounded' },
              { value: 'full', label: 'Circle' },
            ]}
          />
        </PanelSection>
      );
    case 'features':
      return (
        <PanelSection title="Content">
          <TextField label="Section title" value={p.title} onChange={(v) => set({ title: v })} />
          <SegControl
            label="Columns"
            value={String(p.columns ?? 3)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
          <ListEditor
            label="Feature items"
            items={p.items}
            onChange={(items) => set({ items })}
            makeItem={() => ({ title: 'New feature', description: '' })}
            itemLabel={(it: { title: string }) => it.title || 'Feature'}
            renderItem={(it: { title: string; description: string; icon?: string }, update) => (
              <>
                <SelectField
                  label="Icon"
                  value={it.icon ?? 'none'}
                  onChange={(v) => update({ icon: v === 'none' ? undefined : v })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'check', label: 'Checkmark' },
                    { value: 'mail', label: 'Mail' },
                    { value: 'settings', label: 'Settings' },
                  ]}
                />
                <TextField label="Title" value={it.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={it.description} onChange={(v) => update({ description: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'html':
      return (
        <PanelSection title="Code">
          <TextArea
            label="HTML / CSS"
            value={p.htmlCode}
            onChange={(v) => set({ htmlCode: v })}
            rows={18}
            mono
            placeholder="<div>Hello</div>"
          />
        </PanelSection>
      );

    // ---- v2 -------------------------------------------------------------
    case 'container':
      return (
        <PanelSection title="Columns">
          <SegControl
            label="Column count"
            value={String(p.columns)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
          <RangeField label="Gap" value={p.gap ?? 24} onChange={(v) => set({ gap: v })} min={0} max={64} />
          <SegControl
            label="Vertical align"
            value={p.align ?? 'top'}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Center' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
          <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
            Drop blocks from the library onto a column, or add them here and they fill columns left-to-right.
          </p>
        </PanelSection>
      );
    case 'navbar':
      return (
        <PanelSection title="Content">
          <TextField label="Logo text" value={p.logoText} onChange={(v) => set({ logoText: v })} />
          <ImagePicker label="Logo image (optional)" value={p.logoUrl ?? ''} onChange={(v) => set({ logoUrl: v })} />
          <ListEditor
            label="Links"
            items={p.links}
            onChange={(links) => set({ links })}
            makeItem={() => ({ label: 'Link', url: '#' })}
            itemLabel={(l: { label: string }) => l.label}
            renderItem={(l: { label: string; url: string }, update) => (
              <>
                <TextField label="Label" value={l.label} onChange={(v) => update({ label: v })} />
                <TextField label="URL" value={l.url} onChange={(v) => update({ url: v })} />
              </>
            )}
          />
          <TextField label="CTA label" value={p.ctaLabel ?? ''} onChange={(v) => set({ ctaLabel: v })} />
          <TextField label="CTA URL" value={p.ctaUrl ?? ''} onChange={(v) => set({ ctaUrl: v })} />
          <ToggleField label="Sticky on scroll" value={Boolean(p.sticky)} onChange={(v) => set({ sticky: v })} />
        </PanelSection>
      );
    case 'footer':
      return (
        <>
          <PanelSection title="Content">
            <TextField label="Company name" value={p.companyName} onChange={(v) => set({ companyName: v })} />
            <TextArea label="Tagline" value={p.tagline ?? ''} onChange={(v) => set({ tagline: v })} rows={2} />
            <TextField label="Legal text" value={p.legalText ?? ''} onChange={(v) => set({ legalText: v })} />
          </PanelSection>
          <PanelSection title="Link columns" defaultOpen={false}>
            <ListEditor
              label="Columns"
              items={p.columns}
              onChange={(columns) => set({ columns })}
              makeItem={() => ({ title: 'Column', links: [{ label: 'Link', url: '#' }] })}
              itemLabel={(c: { title: string }) => c.title}
              renderItem={(c: { title: string; links: Array<{ label: string; url: string }> }, update) => (
                <>
                  <TextField label="Title" value={c.title} onChange={(v) => update({ title: v })} />
                  <StringListField
                    label="Links (label | url per line)"
                    values={c.links.map((l) => `${l.label} | ${l.url}`)}
                    onChange={(rows) =>
                      update({
                        links: rows.filter(Boolean).map((r) => {
                          const [label, url] = r.split('|').map((s) => s.trim());
                          return { label: label ?? r.trim(), url: url ?? '#' };
                        }),
                      })
                    }
                  />
                </>
              )}
            />
          </PanelSection>
          <PanelSection title="Social links" defaultOpen={false}>
            <StringListField
              label="label | url per line"
              values={(p.socialLinks ?? []).map((l: { label: string; url: string }) => `${l.label} | ${l.url}`)}
              onChange={(rows) =>
                set({
                  socialLinks: rows.filter(Boolean).map((r) => {
                    const [label, url] = r.split('|').map((s) => s.trim());
                    return { label: label ?? r.trim(), url: url ?? '#' };
                  }),
                })
              }
            />
          </PanelSection>
        </>
      );
    case 'testimonials':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <SegControl
            label="Layout"
            value={p.layout ?? 'grid'}
            onChange={(v) => set({ layout: v })}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'single', label: 'Single' },
            ]}
          />
          {p.layout !== 'single' && (
            <SegControl
              label="Columns"
              value={String(p.columns ?? 3)}
              onChange={(v) => set({ columns: Number(v) })}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ]}
            />
          )}
          <ListEditor
            label="Quotes"
            items={p.items}
            onChange={(items) => set({ items })}
            makeItem={() => ({ quote: '', author: '', role: '', rating: 5 })}
            itemLabel={(it: { author: string }) => it.author || 'Quote'}
            renderItem={(it: { quote: string; author: string; role?: string; rating?: number }, update) => (
              <>
                <TextArea label="Quote" value={it.quote} onChange={(v) => update({ quote: v })} />
                <TextField label="Author" value={it.author} onChange={(v) => update({ author: v })} />
                <TextField label="Role / company" value={it.role ?? ''} onChange={(v) => update({ role: v })} />
                <NumberField label="Rating (0–5)" value={it.rating ?? 5} onChange={(v) => update({ rating: Math.max(0, Math.min(5, v)) })} min={0} max={5} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'logos':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <ToggleField label="Grayscale" value={Boolean(p.grayscale)} onChange={(v) => set({ grayscale: v })} />
          <ListEditor
            label="Logos"
            items={p.items}
            onChange={(items) => set({ items })}
            makeItem={() => ({ name: 'Brand' })}
            itemLabel={(it: { name: string }) => it.name}
            renderItem={(it: { name: string; imageUrl?: string }, update) => (
              <>
                <TextField label="Name" value={it.name} onChange={(v) => update({ name: v })} />
                <ImagePicker label="Logo image" value={it.imageUrl ?? ''} onChange={(v) => update({ imageUrl: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'pricing':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <TextField label="Subtitle" value={p.subtitle ?? ''} onChange={(v) => set({ subtitle: v })} />
          <SegControl
            label="Columns"
            value={String(p.columns ?? 3)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
          <ListEditor
            label="Tiers"
            items={p.tiers}
            onChange={(tiers) => set({ tiers })}
            makeItem={() => ({ name: 'Plan', price: '$0', period: '/mo', description: '', features: ['Feature'], ctaLabel: 'Choose', ctaUrl: '#' })}
            itemLabel={(t: { name: string }) => t.name}
            renderItem={(t: { name: string; price: string; period?: string; description?: string; features: string[]; ctaLabel: string; ctaUrl: string; highlighted?: boolean }, update) => (
              <>
                <TextField label="Name" value={t.name} onChange={(v) => update({ name: v })} />
                <TextField label="Price" value={t.price} onChange={(v) => update({ price: v })} />
                <TextField label="Period" value={t.period ?? ''} onChange={(v) => update({ period: v })} />
                <TextField label="Description" value={t.description ?? ''} onChange={(v) => update({ description: v })} />
                <StringListField label="Features" values={t.features} onChange={(features) => update({ features })} />
                <TextField label="CTA label" value={t.ctaLabel} onChange={(v) => update({ ctaLabel: v })} />
                <TextField label="CTA URL" value={t.ctaUrl} onChange={(v) => update({ ctaUrl: v })} />
                <ToggleField label="Highlight this tier" value={Boolean(t.highlighted)} onChange={(v) => update({ highlighted: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'faq':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <SegControl
            label="Layout"
            value={p.layout ?? 'accordion'}
            onChange={(v) => set({ layout: v })}
            options={[
              { value: 'accordion', label: 'Accordion' },
              { value: 'grid', label: 'Grid' },
            ]}
          />
          <ListEditor
            label="Questions"
            items={p.items}
            onChange={(items) => set({ items })}
            makeItem={() => ({ question: '', answer: '' })}
            itemLabel={(it: { question: string }) => it.question || 'Question'}
            renderItem={(it: { question: string; answer: string }, update) => (
              <>
                <TextField label="Question" value={it.question} onChange={(v) => update({ question: v })} />
                <TextArea label="Answer" value={it.answer} onChange={(v) => update({ answer: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'stats':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <SegControl
            label="Columns"
            value={String(p.columns ?? 3)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
          <ListEditor
            label="Metrics"
            items={p.items}
            onChange={(items) => set({ items })}
            makeItem={() => ({ value: '0', label: 'Metric' })}
            itemLabel={(it: { label: string }) => it.label}
            renderItem={(it: { value: string; label: string; description?: string }, update) => (
              <>
                <TextField label="Value" value={it.value} onChange={(v) => update({ value: v })} />
                <TextField label="Label" value={it.label} onChange={(v) => update({ label: v })} />
                <TextField label="Description" value={it.description ?? ''} onChange={(v) => update({ description: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'gallery':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <SegControl
            label="Columns"
            value={String(p.columns ?? 3)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
          <SelectField
            label="Corner radius"
            value={p.rounded ?? 'md'}
            onChange={(v) => set({ rounded: v })}
            options={[
              { value: 'none', label: 'Sharp' },
              { value: 'md', label: 'Rounded' },
              { value: 'xl', label: 'Extra rounded' },
            ]}
          />
          <ListEditor
            label="Images"
            items={p.images}
            onChange={(images) => set({ images })}
            makeItem={() => ({ url: '', alt: '' })}
            itemLabel={(_: unknown, i: number) => `Image ${i + 1}`}
            renderItem={(it: { url: string; alt: string; caption?: string }, update) => (
              <>
                <ImagePicker label="Image" value={it.url} onChange={(v) => update({ url: v })} />
                <TextField label="Alt text" value={it.alt} onChange={(v) => update({ alt: v })} />
                <TextField label="Caption" value={it.caption ?? ''} onChange={(v) => update({ caption: v })} />
              </>
            )}
          />
        </PanelSection>
      );
    case 'video':
      return (
        <PanelSection title="Content">
          <TextField label="Video URL" value={p.url} onChange={(v) => set({ url: v })} hint="YouTube, Vimeo or a direct .mp4 link" />
          <SelectField
            label="Provider"
            value={p.provider ?? 'auto'}
            onChange={(v) => set({ provider: v })}
            options={[
              { value: 'auto', label: 'Auto-detect' },
              { value: 'youtube', label: 'YouTube' },
              { value: 'vimeo', label: 'Vimeo' },
              { value: 'mp4', label: 'MP4 file' },
            ]}
          />
          <SegControl
            label="Aspect ratio"
            value={p.aspectRatio ?? '16:9'}
            onChange={(v) => set({ aspectRatio: v })}
            options={[
              { value: '16:9', label: '16:9' },
              { value: '4:3', label: '4:3' },
              { value: '1:1', label: '1:1' },
            ]}
          />
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <TextField label="Caption" value={p.caption ?? ''} onChange={(v) => set({ caption: v })} />
        </PanelSection>
      );
    case 'divider':
      return (
        <PanelSection title="Style">
          <SegControl
            label="Style"
            value={p.style ?? 'solid'}
            onChange={(v) => set({ style: v })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
          <RangeField label="Thickness" value={p.thickness ?? 1} onChange={(v) => set({ thickness: v })} min={1} max={8} />
          <ColorField label="Color" value={p.color} onChange={(v) => set({ color: v })} fallback="#e2e8f0" />
          <SegControl
            label="Width"
            value={p.width ?? 'full'}
            onChange={(v) => set({ width: v })}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'narrow', label: 'Narrow' },
            ]}
          />
        </PanelSection>
      );
    case 'spacer':
      return (
        <PanelSection title="Style">
          <RangeField label="Height" value={p.height ?? 48} onChange={(v) => set({ height: v })} min={0} max={240} />
        </PanelSection>
      );
    case 'countdown':
      return (
        <PanelSection title="Content">
          <TextField label="Title" value={p.title ?? ''} onChange={(v) => set({ title: v })} />
          <Field label="Target date & time">
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={toLocalInput(p.targetDate)}
              onChange={(e) => set({ targetDate: fromLocalInput(e.target.value) })}
            />
          </Field>
          <TextField label="Expired message" value={p.expiredText ?? ''} onChange={(v) => set({ expiredText: v })} />
          <SegControl
            label="Layout"
            value={p.layout ?? 'boxes'}
            onChange={(v) => set({ layout: v })}
            options={[
              { value: 'boxes', label: 'Boxes' },
              { value: 'inline', label: 'Inline' },
            ]}
          />
        </PanelSection>
      );
    default:
      return null;
  }
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
