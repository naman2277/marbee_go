import type { FormBanner as FormBannerType } from '@/lib/form-design';
import { FORM_THEME_PRESETS } from '@/lib/form-design';

type Props = {
  banner?: FormBannerType;
  formName: string;
  preset?: keyof typeof FORM_THEME_PRESETS;
};

export function FormBanner({ banner, formName, preset = 'indigo' }: Props) {
  if (!banner?.enabled) return null;

  const theme = FORM_THEME_PRESETS[preset];
  const headline = banner.headline ?? formName;
  const sub = banner.subheadline ?? '';

  if (banner.image_url) {
    return (
      <div className="relative overflow-hidden rounded-t-2xl">
        <img src={banner.image_url} alt="" className="h-40 w-full object-cover" />
        <div
          className="absolute inset-0 flex flex-col justify-end p-6 text-white"
          style={{ background: `linear-gradient(to top, rgba(0,0,0,${banner.overlay_opacity ?? 0.45}), transparent)` }}
        >
          <h2 className="text-2xl font-bold">{headline}</h2>
          {sub && <p className="mt-1 text-sm text-white/90">{sub}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-t-2xl px-6 py-10 text-white" style={{ background: theme.gradient }}>
      <h2 className="text-2xl font-bold">{headline}</h2>
      {sub && <p className="mt-2 text-sm text-white/90">{sub}</p>}
    </div>
  );
}
