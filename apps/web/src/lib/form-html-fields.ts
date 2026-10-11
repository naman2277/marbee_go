import type { FormField, FormFieldType, FormSchemaMapping } from './forms';

export function applyFormHtmlTokens(
  html: string,
  tokens: { formTitle: string; formDescription: string },
): string {
  return html
    .replace(/\{\{form_title\}\}/g, tokens.formTitle)
    .replace(/\{\{form_description\}\}/g, tokens.formDescription);
}

export function isFullHtmlDocument(html: string): boolean {
  const t = html.trim();
  return /<!doctype/i.test(t) || /<html[\s>]/i.test(t);
}

const SKIP_INPUT_TYPES = new Set(['submit', 'button', 'reset', 'hidden', 'image', 'file']);

function humanizeFieldName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function findLabelFor(el: Element, doc: Document): string | null {
  const id = el.getAttribute('id');
  if (id) {
    const label = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
    const text = label?.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, '').trim();
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select').forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, '').trim();
  }
  const prev = el.previousElementSibling;
  if (prev?.tagName === 'LABEL') {
    const text = prev.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, '').trim();
  }
  return null;
}

function inferFieldType(el: Element, label: string): FormFieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';
  if (type === 'number' || type === 'range') return 'number';
  if (type === 'checkbox' || type === 'radio') return 'checkbox';
  if (type === 'date') return 'date';

  const name = (el.getAttribute('name') || el.getAttribute('id') || '').toLowerCase();
  const hint = `${name} ${label.toLowerCase()}`;
  if (/\bmobile\b|\bphone\b|\btel\b/.test(hint)) return 'phone';
  if (/\bemail\b|\be-mail\b/.test(hint)) return 'email';

  return 'text';
}

function isFormControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return !SKIP_INPUT_TYPES.has(type);
}

/** Detect input/textarea/select fields from pasted HTML (requires `name` or `id`). */
export function parseHtmlFormFields(html: string): FormField[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = doc.querySelectorAll('input, textarea, select');
  const fields: FormField[] = [];
  const seen = new Set<string>();

  elements.forEach((el) => {
    if (!isFormControl(el)) return;

    const name = el.getAttribute('name')?.trim() || el.getAttribute('id')?.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);

    const label = findLabelFor(el, doc) || humanizeFieldName(name);
    const fieldType = inferFieldType(el, label);
    const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';

    let options: string[] | undefined;
    if (fieldType === 'select') {
      options = Array.from(el.querySelectorAll('option'))
        .map((o) => o.textContent?.trim() || '')
        .filter(Boolean);
    }

    fields.push({
      id: crypto.randomUUID(),
      name,
      label,
      field_type: fieldType,
      required,
      placeholder: el.getAttribute('placeholder') ?? undefined,
      options,
      sort_order: fields.length,
      width: 'full',
    });
  });

  return fields;
}

/** Re-parse HTML fields while preserving ids for unchanged names (keeps mappings stable). */
export function syncFieldsFromHtml(html: string, existing: FormField[]): FormField[] {
  const parsed = parseHtmlFormFields(html);
  return parsed.map((field, index) => {
    const prev = existing.find((f) => f.name === field.name);
    if (prev) {
      return {
        ...prev,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        placeholder: field.placeholder,
        options: field.options,
        sort_order: index,
      };
    }
    return { ...field, sort_order: index };
  });
}

export type HtmlFormDocumentOptions = {
  formTitle?: string;
  formDescription?: string;
  canvasMode?: boolean;
  submitMode?: boolean;
  selectedFieldName?: string;
  mapping?: FormSchemaMapping;
};

function wrapHtmlFragment(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
    .marbee-field-highlight { outline: 2px solid #3b82f6 !important; outline-offset: 2px; background: rgba(59,130,246,.06) !important; }
    .marbee-field-mapped { box-shadow: inset 0 0 0 1px #86efac; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function injectBeforeBodyEnd(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  return `${html}\n${snippet}`;
}

const CANVAS_INTERACTION_SCRIPT = `
(function() {
  function controls() {
    return Array.from(document.querySelectorAll('input, textarea, select')).filter(function(el) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'select') return true;
      if (tag !== 'input') return false;
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      return !['submit','button','reset','hidden','image','file'].includes(type);
    });
  }
  function fieldName(el) {
    return el.getAttribute('name') || el.getAttribute('id');
  }
  window.__marbeeApplyFieldStyles = function(selected, mapped) {
    controls().forEach(function(el) {
      el.classList.remove('marbee-field-highlight', 'marbee-field-mapped');
      var name = fieldName(el);
      if (!name) return;
      if (selected && name === selected) el.classList.add('marbee-field-highlight');
      else if (mapped && mapped.indexOf(name) >= 0) el.classList.add('marbee-field-mapped');
      el.style.cursor = 'pointer';
    });
  };
  controls().forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var name = fieldName(el);
      if (!name) return;
      var rect = el.getBoundingClientRect();
      parent.postMessage({ type: 'marbee-select-field', field: name, x: rect.left, y: rect.bottom + 8 }, '*');
    });
  });
})();
`;

const RESIZE_SCRIPT = `
(function() {
  function postHeight() {
    var root = document.documentElement;
    var body = document.body;
    var h = Math.max(
      root.scrollHeight,
      body ? body.scrollHeight : 0,
      root.offsetHeight,
      body ? body.offsetHeight : 0
    );
    parent.postMessage({ type: 'marbee-form-resize', height: h }, '*');
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(postHeight).observe(document.body);
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(postHeight).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }
  postHeight();
})();
`;

const SUBMIT_CAPTURE_SCRIPT = `
(function() {
  function collectFormData(root) {
    var data = {};
    var elements = root.querySelectorAll('input, textarea, select');
    elements.forEach(function(el) {
      var tag = el.tagName.toLowerCase();
      var name = el.getAttribute('name');
      if (!name) return;
      if (tag === 'input') {
        var type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') { if (el.checked) data[name] = el.value || true; return; }
        if (type === 'radio') { if (el.checked) data[name] = el.value; return; }
        if (['submit','button','reset','hidden','file','image'].includes(type)) return;
      }
      if (tag === 'select' && el.multiple) {
        data[name] = Array.from(el.selectedOptions).map(function(o) { return o.value; });
        return;
      }
      data[name] = el.value;
    });
    return data;
  }
  function attach(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      parent.postMessage({ type: 'marbee-form-submit', data: collectFormData(form) }, '*');
    });
  }
  document.querySelectorAll('form').forEach(attach);
  document.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function(btn) {
    if (btn.closest('form')) return;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      parent.postMessage({ type: 'marbee-form-submit', data: collectFormData(document) }, '*');
    });
  });
})();
`;

/** Render pasted HTML as-is — no injected Marbee field blocks. */
export function buildHtmlFormDocument(html: string, options: HtmlFormDocumentOptions = {}): string {
  const tokenized = applyFormHtmlTokens(html, {
    formTitle: options.formTitle ?? '',
    formDescription: options.formDescription ?? '',
  });

  let doc = isFullHtmlDocument(tokenized) ? tokenized : wrapHtmlFragment(tokenized);

  const scripts: string[] = [RESIZE_SCRIPT];
  if (options.canvasMode) scripts.push(CANVAS_INTERACTION_SCRIPT);
  if (options.submitMode) scripts.push(SUBMIT_CAPTURE_SCRIPT);

  if (scripts.length) {
    const mappedNames =
      options.mapping?.field_mappings
        ?.filter((m) => m.form_field && m.schema_field)
        .map((m) => m.form_field) ?? [];

    const boot = `
<script>
${scripts.join('\n')}
${options.canvasMode ? `window.__marbeeApplyFieldStyles(${JSON.stringify(options.selectedFieldName ?? null)}, ${JSON.stringify(mappedNames)});` : ''}
</script>`;
    doc = injectBeforeBodyEnd(doc, boot);
  }

  return doc;
}

export function countDetectedHtmlFields(html: string): number {
  return parseHtmlFormFields(html).length;
}
