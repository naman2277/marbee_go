import { ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { PanelSection } from '@/components/landing-pages/studio/StudioFields';
import {
  FORM_THEME_PRESETS,
  generateBannerDataUrl,
  uploadBannerDataUrl,
  type FormBanner,
  type FormThemePreset,
  type FormThemeRadius,
  type FormThemeStyle,
} from '@/lib/form-design';
import { uploadFormAsset } from '@/lib/assets';

type Props = {
  preset: FormThemePreset;
  radius: FormThemeRadius;
  style: FormThemeStyle;
  banner: FormBanner;
  captchaEnabled: boolean;
  captchaType: 'smart_math' | 'turnstile';
  onPresetChange: (p: FormThemePreset) => void;
  onRadiusChange: (r: FormThemeRadius) => void;
  onStyleChange: (s: FormThemeStyle) => void;
  onBannerChange: (b: FormBanner) => void;
  onCaptchaToggle: (enabled: boolean) => void;
  onCaptchaTypeChange: (t: 'smart_math' | 'turnstile') => void;
  formName: string;
  description?: string;
  tenantId: string;
  environment: string;
};

export function StudioThemePanel({
  preset,
  radius,
  style,
  banner,
  captchaEnabled,
  captchaType,
  onPresetChange,
  onRadiusChange,
  onStyleChange,
  onBannerChange,
  onCaptchaToggle,
  onCaptchaTypeChange,
  formName,
  description,
  tenantId,
  environment,
}: Props) {
  const genBanner = async () => {
    const dataUrl = generateBannerDataUrl(
      banner.headline ?? formName,
      banner.subheadline ?? description ?? '',
      preset,
    );
    const uploaded = await uploadBannerDataUrl(dataUrl, tenantId, environment, formName.replace(/\s+/g, '-').toLowerCase());
    onBannerChange({ ...banner, enabled: true, image_url: uploaded ?? dataUrl });
  };

  return (
    <div className="space-y-0">
      <PanelSection title="Color preset">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(FORM_THEME_PRESETS) as FormThemePreset[]).map((key) => {
            const p = FORM_THEME_PRESETS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPresetChange(key)}
                className={`flex items-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition ${
                  preset === key ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.accent }} />
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="Corner radius">
        <div className="grid grid-cols-3 gap-2">
          {(['md', 'lg', 'xl'] as FormThemeRadius[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRadiusChange(r)}
              className={`py-1.5 text-center text-xs font-semibold rounded-lg border transition ${
                radius === r ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Surface style">
        <div className="grid grid-cols-3 gap-2">
          {(['minimal', 'card', 'glass'] as FormThemeStyle[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onStyleChange(st)}
              className={`py-1.5 text-center text-xs font-semibold rounded-lg border capitalize transition ${
                style === st ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Banner" defaultOpen={banner.enabled}>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={banner.enabled}
            onChange={(e) => onBannerChange({ ...banner, enabled: e.target.checked })}
            className="rounded text-brand-600 focus:ring-brand-500"
          />
          Show header banner
        </label>
        {banner.enabled && (
          <div className="space-y-2">
            <input
              value={banner.headline ?? ''}
              onChange={(e) => onBannerChange({ ...banner, headline: e.target.value })}
              placeholder="Banner headline"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            />
            <input
              value={banner.subheadline ?? ''}
              onChange={(e) => onBannerChange({ ...banner, subheadline: e.target.value })}
              placeholder="Banner subheadline"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={genBanner} className="text-[11px]">
                <Sparkles className="mr-1 h-3 w-3" /> AI generate
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                <Upload className="h-3 w-3" /> Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const res = await uploadFormAsset(tenantId, environment, file);
                    if (res.publicUrl) onBannerChange({ ...banner, enabled: true, image_url: res.publicUrl });
                  }}
                />
              </label>
            </div>
            {banner.image_url && (
              <img src={banner.image_url} alt="" className="h-20 w-full rounded-lg object-cover" />
            )}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Anti-Spam CAPTCHA" defaultOpen={captchaEnabled}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <ShieldCheck className={`h-4 w-4 ${captchaEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
            Enable CAPTCHA
          </span>
          <input
            type="checkbox"
            checked={captchaEnabled}
            onChange={(e) => onCaptchaToggle(e.target.checked)}
            className="rounded text-brand-600 focus:ring-brand-500"
          />
        </div>
        {captchaEnabled && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">Challenge Mode</label>
            <select
              value={captchaType}
              onChange={(e) => onCaptchaTypeChange(e.target.value as 'smart_math' | 'turnstile')}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="smart_math">Interactive Math Challenge</option>
              <option value="turnstile">Smart Human Verification</option>
            </select>
          </div>
        )}
      </PanelSection>
    </div>
  );
}
