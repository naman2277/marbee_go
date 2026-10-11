/** Landing Studio — theme tokens + quick presets. */
import type { LandingTheme } from '@/lib/landing-pages';
import { PanelSection, ColorField, SelectField, SegControl, TextArea } from './StudioFields';

type Props = {
  theme: LandingTheme;
  onChange: (next: LandingTheme) => void;
};

type Preset = { id: string; label: string; theme: LandingTheme };

export const THEME_PRESETS: Preset[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    theme: { preset: 'indigo', primaryColor: '#4f46e5', accentColor: '#4f46e5', background: '#ffffff', textColor: '#0f172a', radius: 'md', headingFont: 'sans', sectionSpacing: 'normal' },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    theme: { preset: 'emerald', primaryColor: '#059669', accentColor: '#10b981', background: '#ffffff', textColor: '#0f172a', radius: 'lg', headingFont: 'sans', sectionSpacing: 'normal' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    theme: { preset: 'midnight', primaryColor: '#6366f1', accentColor: '#818cf8', background: '#0b1120', textColor: '#e2e8f0', radius: 'lg', headingFont: 'sans', sectionSpacing: 'spacious' },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    theme: { preset: 'editorial', primaryColor: '#111827', accentColor: '#b45309', background: '#fdfcf9', textColor: '#1f2937', radius: 'none', headingFont: 'serif', fontFamily: 'serif', sectionSpacing: 'spacious' },
  },
  {
    id: 'rose',
    label: 'Rose',
    theme: { preset: 'rose', primaryColor: '#e11d48', accentColor: '#f43f5e', background: '#fff1f2', textColor: '#1f2937', radius: 'xl', headingFont: 'sans', sectionSpacing: 'normal' },
  },
  {
    id: 'slate',
    label: 'Slate',
    theme: { preset: 'slate', primaryColor: '#334155', accentColor: '#0ea5e9', background: '#ffffff', textColor: '#0f172a', radius: 'sm', headingFont: 'sans', sectionSpacing: 'compact' },
  },
];

export function StudioThemePanel({ theme, onChange }: Props) {
  const set = (patch: Partial<LandingTheme>) => onChange({ ...theme, ...patch });

  return (
    <div className="divide-y divide-slate-100">
      <PanelSection title="Presets">
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ ...theme, ...p.theme })}
              className={`rounded-lg border p-2 text-center transition-colors ${
                theme.preset === p.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span
                className="mx-auto mb-1 block h-6 w-full rounded"
                style={{ background: p.theme.background, border: '1px solid #e2e8f0' }}
              >
                <span className="block h-full w-1/3 rounded-l" style={{ background: p.theme.primaryColor }} />
              </span>
              <span className="text-[10px] font-medium text-slate-600">{p.label}</span>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Colors">
        <ColorField label="Primary" value={theme.primaryColor} onChange={(v) => set({ primaryColor: v })} fallback="#4f46e5" />
        <ColorField label="Accent" value={theme.accentColor} onChange={(v) => set({ accentColor: v })} fallback={theme.primaryColor ?? '#4f46e5'} />
        <ColorField label="Page background" value={theme.background} onChange={(v) => set({ background: v })} fallback="#ffffff" />
        <ColorField label="Body text" value={theme.textColor} onChange={(v) => set({ textColor: v })} fallback="#0f172a" />
      </PanelSection>

      <PanelSection title="Typography">
        <SelectField
          label="Body font"
          value={theme.fontFamily ?? 'sans'}
          onChange={(v) => set({ fontFamily: v as LandingTheme['fontFamily'] })}
          options={[
            { value: 'sans', label: 'Sans-serif (modern)' },
            { value: 'serif', label: 'Serif (elegant)' },
            { value: 'mono', label: 'Monospace (technical)' },
          ]}
        />
        <SelectField
          label="Heading font"
          value={theme.headingFont ?? theme.fontFamily ?? 'sans'}
          onChange={(v) => set({ headingFont: v as LandingTheme['headingFont'] })}
          options={[
            { value: 'sans', label: 'Sans-serif' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Monospace' },
            { value: 'display', label: 'Display' },
          ]}
        />
      </PanelSection>

      <PanelSection title="Shape & rhythm">
        <SelectField
          label="Corner radius"
          value={theme.radius ?? 'md'}
          onChange={(v) => set({ radius: v as LandingTheme['radius'] })}
          options={[
            { value: 'none', label: 'Sharp' },
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
            { value: 'xl', label: 'Extra large' },
          ]}
        />
        <SegControl
          label="Button radius"
          value={theme.buttonRadius ?? 'md'}
          onChange={(v) => set({ buttonRadius: v as LandingTheme['buttonRadius'] })}
          options={[
            { value: 'none', label: 'Sharp' },
            { value: 'md', label: 'Rounded' },
            { value: 'full', label: 'Pill' },
          ]}
        />
        <SelectField
          label="Content width"
          value={theme.contentWidth ?? 'normal'}
          onChange={(v) => set({ contentWidth: v as LandingTheme['contentWidth'] })}
          options={[
            { value: 'narrow', label: 'Narrow' },
            { value: 'normal', label: 'Normal' },
            { value: 'wide', label: 'Wide' },
            { value: 'full', label: 'Full bleed' },
          ]}
        />
        <SegControl
          label="Section spacing"
          value={theme.sectionSpacing ?? 'normal'}
          onChange={(v) => set({ sectionSpacing: v as LandingTheme['sectionSpacing'] })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'normal', label: 'Normal' },
            { value: 'spacious', label: 'Spacious' },
          ]}
        />
      </PanelSection>

      <PanelSection title="Custom CSS" defaultOpen={false}>
        <TextArea
          label="Applied globally to this page"
          value={theme.customCss ?? ''}
          onChange={(v) => set({ customCss: v })}
          rows={8}
          mono
          placeholder={'body { background: #fafafa; }'}
        />
      </PanelSection>
    </div>
  );
}
