import type { FormField, FormSchemaMapping } from './forms';
import { isFieldMapped } from './form-mapping';

export const MARBBEE_FIELDS_PLACEHOLDER = '{MARBBEE_FIELDS}';

export type FormFieldsPreviewOptions = {
  submitLabel?: string;
  mappingMode?: boolean;
  mapping?: FormSchemaMapping;
  /** Interactive canvas — click fields to select */
  canvasMode?: boolean;
  selectedFieldName?: string;
};

export function isFullHtmlDocument(html: string): boolean {
  const t = html.trim();
  return /<!doctype/i.test(t) || /<html[\s>]/i.test(t);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hasMarbeeFieldsPlaceholder(html: string): boolean {
  return html.includes(MARBBEE_FIELDS_PLACEHOLDER);
}

/** Static HTML block for form fields (preview / iframe injection). */
export function buildFormFieldsPreviewHtml(
  fields: FormField[],
  submitLabelOrOptions: string | FormFieldsPreviewOptions = 'Submit',
): string {
  const options: FormFieldsPreviewOptions =
    typeof submitLabelOrOptions === 'string'
      ? { submitLabel: submitLabelOrOptions }
      : submitLabelOrOptions;
  const submitLabel = options.submitLabel ?? 'Submit';
  const mappingMode = options.mappingMode ?? false;
  const canvasMode = options.canvasMode ?? false;
  const mapping = options.mapping;
  const selectedFieldName = options.selectedFieldName;

  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
  const inputStyle =
    'width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px;font-family:inherit;background:#fff;color:#334155';
  const labelStyle = 'display:block;font-weight:500;margin-bottom:6px;font-size:14px;color:#334155';

  const fieldsHtml = sorted
    .map((field) => {
      const req = field.required ? ' required' : '';
      const ph = escapeHtml(field.placeholder ?? '');
      const mapped = mapping ? isFieldMapped(mapping, field.name) : false;
      const selected = selectedFieldName === field.name;
      const wrapStyle = canvasMode
        ? `position:relative;margin-bottom:16px;padding:12px;border-radius:8px;cursor:pointer;${
            selected
              ? 'border:2px solid #3b82f6;background:rgba(59,130,246,.06)'
              : mapped
                ? 'border:1px solid #86efac;background:rgba(236,253,245,.5)'
                : 'border:1px solid transparent'
          }`
        : 'position:relative;margin-bottom:16px';
      let control = '';

      switch (field.field_type) {
        case 'textarea':
          control = `<textarea placeholder="${ph}" rows="3" style="${inputStyle}"${req} disabled></textarea>`;
          break;
        case 'select':
          control = `<select style="${inputStyle}" disabled><option>Select…</option>${(field.options ?? [])
            .map((o) => `<option>${escapeHtml(o)}</option>`)
            .join('')}</select>`;
          break;
        case 'checkbox':
          return `<div class="marbee-field-wrap" data-field="${escapeHtml(field.name)}" style="${wrapStyle.replace('margin-bottom:16px', 'margin-bottom:12px')}"><label style="display:flex;align-items:center;gap:8px;font-size:14px;color:#334155"><input type="checkbox" disabled${req} /> ${escapeHtml(field.placeholder || field.label)}</label></div>`;
        default:
          control = `<input type="${field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'phone' ? 'tel' : 'text'}" placeholder="${ph}" style="${inputStyle}"${req} disabled />`;
      }

      // (checkbox fields returned above, so every field reaching here gets a label)
      const label = `<label style="${labelStyle}">${escapeHtml(field.label)}${field.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>`;

      const help = field.help_text
        ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(field.help_text)}</p>`
        : '';

      return `<div class="marbee-field-wrap" data-field="${escapeHtml(field.name)}" style="${wrapStyle}">${label}${control}${help}</div>`;
    })
    .join('\n');

  const canvasScript = canvasMode
    ? `<script>
document.querySelectorAll('.marbee-field-wrap').forEach(function(wrap) {
  wrap.addEventListener('click', function(e) {
    e.preventDefault();
  e.stopPropagation();
    var field = wrap.getAttribute('data-field');
    var rect = wrap.getBoundingClientRect();
    parent.postMessage({ type: 'marbee-select-field', field: field, x: rect.left, y: rect.bottom + 8 }, '*');
  });
});
</script>`
    : mappingMode
      ? `<script>
document.querySelectorAll('.marbee-field-wrap').forEach(function(wrap) {
  wrap.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({ type: 'marbee-map-field', field: wrap.getAttribute('data-field'), x: e.clientX, y: e.clientY }, '*');
  });
});
</script>`
      : '';

  return `<div class="marbee-fields-block" data-marbee-fields="true">
${fieldsHtml}
<button type="button" disabled style="width:100%;margin-top:8px;padding:10px 16px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:not-allowed">${escapeHtml(submitLabel)}</button>
${canvasScript}
</div>`;
}

export function applyFormHtmlTokens(
  html: string,
  tokens: { formTitle: string; formDescription: string },
): string {
  return html
    .replace(/\{\{form_title\}\}/g, tokens.formTitle)
    .replace(/\{\{form_description\}\}/g, tokens.formDescription);
}

export function injectFormFieldsIntoHtml(
  html: string,
  fieldsHtml: string,
): string {
  if (html.includes(MARBBEE_FIELDS_PLACEHOLDER)) {
    return html.replaceAll(MARBBEE_FIELDS_PLACEHOLDER, fieldsHtml);
  }
  if (isFullHtmlDocument(html)) {
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${fieldsHtml}\n</body>`);
    }
    return `${html}\n${fieldsHtml}`;
  }
  return `${html}\n${fieldsHtml}`;
}

export function buildFormPreviewDocument(
  html: string,
  fields: FormField[],
  tokens: { formTitle: string; formDescription: string },
  submitLabelOrOptions?: string | FormFieldsPreviewOptions,
): string {
  const fieldOptions: FormFieldsPreviewOptions =
    typeof submitLabelOrOptions === 'string'
      ? { submitLabel: submitLabelOrOptions }
      : submitLabelOrOptions ?? {};
  const fieldsHtml = buildFormFieldsPreviewHtml(fields, fieldOptions);
  let doc = applyFormHtmlTokens(html, tokens);
  doc = injectFormFieldsIntoHtml(doc, fieldsHtml);

  if (!isFullHtmlDocument(doc)) {
    doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body{margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc}</style>
</head>
<body>
${doc}
</body>
</html>`;
  }

  return doc;
}
