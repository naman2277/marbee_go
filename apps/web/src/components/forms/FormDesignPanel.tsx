import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImageIcon, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  DEFAULT_FORM_THEME,
  FORM_THEME_PRESETS,
  generateBannerDataUrl,
  uploadBannerDataUrl,
  type FormBanner,
  type FormTheme,
  type FormThemePreset,
} from '@/lib/form-design';
import { updateForm, type FormSettings } from '@/lib/forms';
import { uploadFormAsset } from '@/lib/assets';
import { useTenantScope } from '@/contexts/AuthContext';

type Props = {
  formId: string;
  formName: string;
  settings: FormSettings;
  onSaved?: () => void;
};

export function FormDesignPanel({ formId, formName, settings, onSaved }: Props) {
  const { tenantId, environment } = useTenantScope();
  const theme = settings.theme ?? DEFAULT_FORM_THEME;
  const banner = settings.banner ?? { enabled: false };

  const [localTheme, setLocalTheme] = useState<FormTheme>(theme);
  const [localBanner, setLocalBanner] = useState<FormBanner>(banner);
  const [message, setMessage] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = await updateForm(formId, {
        settings: { ...settings, theme: localTheme, banner: localBanner },
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Design saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  const generateBanner = async () => {
    const dataUrl = generateBannerDataUrl(
      localBanner.headline ?? formName,
      localBanner.subheadline ?? settings.description ?? '',
      localTheme.preset,
    );
    const uploaded = await uploadBannerDataUrl(
      dataUrl,
      tenantId,
      environment,
      formName.replace(/\s+/g, '-').toLowerCase(),
    );
    setLocalBanner({
      ...localBanner,
      enabled: true,
      image_url: uploaded ?? dataUrl,
    });
  };

  return (
    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Theme</h4>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORM_THEME_PRESETS) as FormThemePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLocalTheme({ ...localTheme, preset })}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  localTheme.preset === preset
                    ? 'border-slate-900 bg-white shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: FORM_THEME_PRESETS[preset].gradient }}
                />
                {FORM_THEME_PRESETS[preset].label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {(['minimal', 'card', 'glass'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setLocalTheme({ ...localTheme, style })}
                className={`rounded-lg px-3 py-1.5 text-xs capitalize ${
                  localTheme.style === style ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ImageIcon className="h-4 w-4" /> Banner
          </h4>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={localBanner.enabled}
              onChange={(e) => setLocalBanner({ ...localBanner, enabled: e.target.checked })}
            />
            Show header banner
          </label>
          <input
            value={localBanner.headline ?? ''}
            onChange={(e) => setLocalBanner({ ...localBanner, headline: e.target.value })}
            placeholder="Banner headline"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={localBanner.subheadline ?? ''}
            onChange={(e) => setLocalBanner({ ...localBanner, subheadline: e.target.value })}
            placeholder="Banner subheadline"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={generateBanner}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              AI generate banner
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" />
              Upload image to /Forms
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const res = await uploadFormAsset(tenantId, environment, file);
                  if (res.publicUrl) {
                    setLocalBanner({ ...localBanner, enabled: true, image_url: res.publicUrl });
                  }
                }}
              />
            </label>
          </div>
          {localBanner.image_url && (
            <img
              src={localBanner.image_url}
              alt=""
              className="mt-3 h-24 w-full rounded-lg object-cover"
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          Save design
        </Button>
        {message && <span className="text-sm text-emerald-600">{message}</span>}
      </div>
    </div>
  );
}
