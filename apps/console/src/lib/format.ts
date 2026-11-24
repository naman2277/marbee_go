const intFmt = new Intl.NumberFormat('en-IN');
const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const n = (v: unknown) => intFmt.format(Number(v ?? 0));
export const credits = (v: unknown) => moneyFmt.format(Number(v ?? 0));
export const inr = (v: unknown) => `₹${moneyFmt.format(Number(v ?? 0))}`;

export function bytes(v: unknown): string {
  let b = Number(v ?? 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i += 1;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function date(v: string | null | undefined, withTime = false): string {
  if (!v) return '—';
  const d = new Date(v);
  return withTime
    ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const REGION_LABEL: Record<string, string> = {
  in: 'India', mena: 'MENA', apac: 'APAC', emea: 'EMEA', na: 'North America',
};

export function newKey(): string {
  return crypto.randomUUID();
}
