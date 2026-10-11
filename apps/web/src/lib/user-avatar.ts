const PALETTE = [
  'from-violet-500 to-purple-600',
  'from-brand-500 to-indigo-600',
  'from-cyan-500 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-green-600',
] as const;

export function getUserInitials(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export function getUserAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % PALETTE.length;
  return PALETTE[hash];
}

function svgAvatarDataUrl(bg: string, fg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><circle cx="32" cy="26" r="12" fill="${fg}" opacity="0.9"/><ellipse cx="32" cy="54" rx="18" ry="14" fill="${fg}" opacity="0.9"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type PredefinedAvatar = {
  id: string;
  label: string;
  url: string;
};

export const PREDEFINED_AVATARS: PredefinedAvatar[] = [
  { id: 'violet', label: 'Violet', url: svgAvatarDataUrl('#7c3aed', '#ede9fe') },
  { id: 'indigo', label: 'Indigo', url: svgAvatarDataUrl('#4f46e5', '#e0e7ff') },
  { id: 'sky', label: 'Sky', url: svgAvatarDataUrl('#0284c7', '#e0f2fe') },
  { id: 'teal', label: 'Teal', url: svgAvatarDataUrl('#0d9488', '#ccfbf1') },
  { id: 'emerald', label: 'Emerald', url: svgAvatarDataUrl('#059669', '#d1fae5') },
  { id: 'amber', label: 'Amber', url: svgAvatarDataUrl('#d97706', '#fef3c7') },
  { id: 'orange', label: 'Orange', url: svgAvatarDataUrl('#ea580c', '#ffedd5') },
  { id: 'rose', label: 'Rose', url: svgAvatarDataUrl('#e11d48', '#ffe4e6') },
  { id: 'fuchsia', label: 'Fuchsia', url: svgAvatarDataUrl('#c026d3', '#fae8ff') },
  { id: 'slate', label: 'Slate', url: svgAvatarDataUrl('#475569', '#f1f5f9') },
  { id: 'brand', label: 'Marbee', url: svgAvatarDataUrl('#6d28d9', '#f5f3ff') },
  { id: 'night', label: 'Night', url: svgAvatarDataUrl('#1e293b', '#cbd5e1') },
];

export function getTimeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getDisplayName(
  name?: string | null,
  email?: string | null,
  fallback = 'there',
): string {
  if (name?.trim()) return name.trim();
  if (email) {
    const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return fallback;
}
