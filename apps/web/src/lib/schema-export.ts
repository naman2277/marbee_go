import type { SchemaFilterField } from '@/lib/schema-filters';

export function getRawExportValue(row: Record<string, unknown>, field: SchemaFilterField): string {
  const val = field.getValue(row);
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(
  rows: Record<string, unknown>[],
  fields: SchemaFilterField[],
): string {
  const header = fields.map((f) => escapeCsvCell(f.label)).join(',');
  const lines = rows.map((row) =>
    fields.map((f) => escapeCsvCell(getRawExportValue(row, f))).join(','),
  );
  return [header, ...lines].join('\n');
}

export function rowsToText(
  rows: Record<string, unknown>[],
  fields: SchemaFilterField[],
): string {
  return rows
    .map((row, i) => {
      const lines = fields.map((f) => `${f.label}: ${getRawExportValue(row, f) || '—'}`);
      return [`Record ${i + 1}`, ...lines].join('\n');
    })
    .join('\n\n');
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
