export type FormThemePreset = 'indigo' | 'teal' | 'rose' | 'violet' | 'slate' | 'amber';
export type FormThemeRadius = 'md' | 'lg' | 'xl';
export type FormThemeStyle = 'minimal' | 'card' | 'glass';

export type FormTheme = {
  preset: FormThemePreset;
  radius: FormThemeRadius;
  style: FormThemeStyle;
};

export type FormBanner = {
  enabled: boolean;
  image_url?: string;
  headline?: string;
  subheadline?: string;
  overlay_opacity?: number;
};

export const FORM_THEME_PRESETS: Record<
  FormThemePreset,
  { label: string; gradient: string; accent: string; ring: string; button: string }
> = {
  indigo: {
    label: 'Indigo',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
    accent: '#4f46e5',
    ring: 'ring-indigo-200',
    button: 'bg-indigo-600 hover:bg-indigo-700',
  },
  teal: {
    label: 'Teal',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #0891b2 50%, #0284c7 100%)',
    accent: '#0d9488',
    ring: 'ring-teal-200',
    button: 'bg-teal-600 hover:bg-teal-700',
  },
  rose: {
    label: 'Rose',
    gradient: 'linear-gradient(135deg, #e11d48 0%, #db2777 50%, #c026d3 100%)',
    accent: '#e11d48',
    ring: 'ring-rose-200',
    button: 'bg-rose-600 hover:bg-rose-700',
  },
  violet: {
    label: 'Violet',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #4f46e5 100%)',
    accent: '#7c3aed',
    ring: 'ring-violet-200',
    button: 'bg-violet-600 hover:bg-violet-700',
  },
  slate: {
    label: 'Slate',
    gradient: 'linear-gradient(135deg, #334155 0%, #475569 50%, #64748b 100%)',
    accent: '#475569',
    ring: 'ring-slate-200',
    button: 'bg-slate-700 hover:bg-slate-800',
  },
  amber: {
    label: 'Amber',
    gradient: 'linear-gradient(135deg, #d97706 0%, #ea580c 50%, #dc2626 100%)',
    accent: '#d97706',
    ring: 'ring-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
};

export const DEFAULT_FORM_THEME: FormTheme = {
  preset: 'indigo',
  radius: 'xl',
  style: 'card',
};

export function radiusClass(radius: FormThemeRadius): string {
  if (radius === 'md') return 'rounded-lg';
  if (radius === 'lg') return 'rounded-xl';
  return 'rounded-2xl';
}

export function generateBannerDataUrl(
  headline: string,
  subheadline: string,
  preset: FormThemePreset = 'indigo',
): string {
  const theme = FORM_THEME_PRESETS[preset];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${theme.accent}"/>
        <stop offset="100%" style="stop-color:#1e1b4b"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="360" fill="url(#g)"/>
    <circle cx="1050" cy="80" r="120" fill="white" opacity="0.08"/>
    <circle cx="150" cy="300" r="80" fill="white" opacity="0.06"/>
    <text x="60" y="160" fill="white" font-family="system-ui,sans-serif" font-size="48" font-weight="700">${escapeXml(headline.slice(0, 40))}</text>
    <text x="60" y="210" fill="white" opacity="0.9" font-family="system-ui,sans-serif" font-size="22">${escapeXml(subheadline.slice(0, 80))}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function uploadBannerDataUrl(
  dataUrl: string,
  tenantId: string,
  environment: string,
  fileName: string,
): Promise<string | null> {
  const { supabase } = await import('./supabase');
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${tenantId}/${environment}/form-banners/${Date.now()}-${fileName}.svg`;

  const { error } = await supabase.storage.from('cdn-public').upload(path, blob, {
    contentType: 'image/svg+xml',
    upsert: false,
  });
  if (error) return null;

  const { data } = supabase.storage.from('cdn-public').getPublicUrl(path);
  return data.publicUrl;
}
