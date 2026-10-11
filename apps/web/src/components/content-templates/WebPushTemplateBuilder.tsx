import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import { PersonalizedInput, PersonalizedTextarea } from '@/components/content-templates/PersonalizedField';
import type { WebPushContent } from '@/lib/content-templates';

type Props = {
  content: WebPushContent;
  onChange: (content: WebPushContent) => void;
};

export function WebPushTemplateBuilder({ content, onChange }: Props) {
  const patch = (next: Partial<WebPushContent>) => onChange({ ...content, ...next });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
        <p className="text-sm font-semibold text-violet-900">Web push template</p>
        <p className="mt-1 text-xs text-violet-700/80">Browser notification with title, body, icon, image, and action URL.</p>
      </div>

      <TemplateBuilderSection title="Notification" required>
        <div className="space-y-3">
          <PersonalizedInput
            label="Title"
            value={content.title}
            onChange={(title) => patch({ title })}
            maxLength={60}
          />
          <PersonalizedTextarea
            label="Body"
            value={content.body}
            onChange={(body) => patch({ body })}
            rows={3}
            maxLength={180}
          />
        </div>
      </TemplateBuilderSection>

      <TemplateBuilderSection title="Media & action">
        <div className="grid gap-3 sm:grid-cols-2">
          <PersonalizedInput
            label="Icon URL (256×256)"
            value={content.icon_url ?? ''}
            onChange={(icon_url) => patch({ icon_url })}
            placeholder="https://…/icon.png"
          />
          <PersonalizedInput
            label="Large image URL"
            value={content.image_url ?? ''}
            onChange={(image_url) => patch({ image_url })}
            placeholder="https://…/hero.jpg"
          />
          <PersonalizedInput
            label="Click action URL"
            value={content.action_url ?? ''}
            onChange={(action_url) => patch({ action_url })}
            placeholder="https://app.example.com/…"
            className="sm:col-span-2"
          />
        </div>
      </TemplateBuilderSection>
    </div>
  );
}

export function WebPushTemplatePreview({ content }: { content: WebPushContent }) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-100">
            {content.icon_url ? (
              <img src={content.icon_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-brand-600">M</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">marbee.io · now</p>
            <p className="font-semibold text-slate-900">{content.title || 'Notification title'}</p>
            <p className="mt-0.5 text-sm text-slate-600">{content.body || 'Notification body text'}</p>
          </div>
        </div>
        {content.image_url && (
          <img src={content.image_url} alt="" className="h-32 w-full object-cover" />
        )}
        {content.action_url && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-brand-600 truncate">{content.action_url}</div>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400">Chrome · Windows notification preview</p>
    </div>
  );
}
