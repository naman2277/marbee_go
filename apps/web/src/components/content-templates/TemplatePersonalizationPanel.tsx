import { useMemo, useState } from 'react';
import { Sparkles, Users } from 'lucide-react';
import {
  DEFAULT_POPULATION_FIELDS,
  SAMPLE_POPULATION_CONTEXT,
  contextFromPopulationSample,
  extractMergeTagsFromContent,
  mergeTag,
  type PopulationFieldDef,
  type PersonalizationContext,
} from '@/lib/template-personalization';
import type { ContentChannel, TemplateContent } from '@/lib/content-templates';

type Props = {
  channel: ContentChannel;
  content: TemplateContent;
  fields?: PopulationFieldDef[];
  sampleRow?: Record<string, unknown> | null;
  onInsertField: (fieldKey: string) => void;
  dark?: boolean;
  /** Hide chip buttons — use inline ✦ pickers on each field instead */
  compact?: boolean;
};

export function TemplatePersonalizationPanel({
  channel,
  content,
  fields = DEFAULT_POPULATION_FIELDS,
  sampleRow,
  onInsertField,
  dark,
  compact,
}: Props) {
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const detectedTags = useMemo(
    () => extractMergeTagsFromContent(channel, content),
    [channel, content],
  );

  const previewContext = useMemo(
    () => contextFromPopulationSample(sampleRow ?? undefined, fields),
    [sampleRow, fields],
  );

  const profileFields = fields.filter((f) => f.group !== 'query');
  const queryFields = fields.filter((f) => f.group === 'query');

  return (
    <div
      className={`rounded-xl border p-4 ${
        dark ? 'border-emerald-900/40 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50/70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              dark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className={`text-sm font-semibold ${dark ? 'text-emerald-100' : 'text-emerald-900'}`}>
              Personalisation using population data
            </p>
            <p className={`mt-0.5 text-xs leading-relaxed ${dark ? 'text-emerald-200/70' : 'text-emerald-800/80'}`}>
              {compact
                ? 'Click the ✦ icon on any field below to insert attributes from the upstream query work table or customer profile.'
                : 'Insert fields from the workflow work table and customer profile. Tags like '}
              {!compact && (
                <>
                  <code className="text-[10px]">{mergeTag('first_name')}</code> are replaced with each
                  recipient&apos;s data at send time.
                </>
              )}
            </p>
          </div>
        </div>
        <label className={`flex shrink-0 items-center gap-2 text-xs ${dark ? 'text-emerald-200' : 'text-emerald-800'}`}>
          <input
            type="checkbox"
            checked={previewEnabled}
            onChange={(e) => setPreviewEnabled(e.target.checked)}
            className="rounded border-emerald-400"
          />
          Preview sample
        </label>
      </div>

      {sampleRow && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] ${
            dark ? 'bg-slate-900/60 text-slate-300' : 'bg-white/80 text-slate-600'
          }`}
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            Upstream population data
            {sampleRow._pk ? ` · PK ${String(sampleRow._pk)}` : ''}
          </span>
        </div>
      )}

      {!compact && (
        <>
          <FieldGroup title="Profile fields" fields={profileFields} onInsert={onInsertField} dark={dark} />
          {queryFields.length > 0 && (
            <FieldGroup title="Population / query fields" fields={queryFields} onInsert={onInsertField} dark={dark} />
          )}
        </>
      )}

      {detectedTags.length > 0 && (
        <div className={`mt-3 text-[11px] ${dark ? 'text-emerald-200/80' : 'text-emerald-800/90'}`}>
          <span className="font-medium">Tags in template:</span>{' '}
          {detectedTags.map((tag) => mergeTag(tag)).join(', ')}
        </div>
      )}

      {previewEnabled && detectedTags.length > 0 && (
        <PreviewSnippet context={previewContext} tags={detectedTags} dark={dark} />
      )}
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  onInsert,
  dark,
}: {
  title: string;
  fields: PopulationFieldDef[];
  onInsert: (key: string) => void;
  dark?: boolean;
}) {
  return (
    <div className="mt-3">
      <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-emerald-300/80' : 'text-emerald-700/80'}`}>
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <button
            key={field.key}
            type="button"
            onClick={() => onInsert(field.key)}
            title={field.sample ? `Sample: ${field.sample}` : field.key}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              dark
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'bg-white text-slate-700 shadow-sm hover:bg-emerald-100'
            }`}
          >
            + {mergeTag(field.key)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewSnippet({
  context,
  tags,
  dark,
}: {
  context: PersonalizationContext;
  tags: string[];
  dark?: boolean;
}) {
  const preview = tags
    .slice(0, 4)
    .map((tag) => `${tag}: ${context[tag] ?? SAMPLE_POPULATION_CONTEXT[tag] ?? '—'}`)
    .join(' · ');

  return (
    <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${dark ? 'bg-slate-900/50 text-slate-400' : 'bg-white/90 text-slate-600'}`}>
      Preview values — {preview}
    </p>
  );
}
