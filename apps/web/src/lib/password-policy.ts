export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
  score: number;
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'welcome123',
  'letmein123',
  'marbee123',
]);

export const PASSWORD_REQUIREMENTS = [
  'At least 12 characters',
  'One uppercase letter (A–Z)',
  'One lowercase letter (a–z)',
  'One number (0–9)',
  'One special character (!@#$%^&* etc.)',
  'Must not match or contain your email',
] as const;

export function validatePassword(password: string, email?: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  if (password.length >= 12) score += 1;
  else errors.push('Password must be at least 12 characters');

  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  else errors.push('Include at least one uppercase letter');

  if (/[a-z]/.test(password)) score += 1;
  else errors.push('Include at least one lowercase letter');

  if (/[0-9]/.test(password)) score += 1;
  else errors.push('Include at least one number');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else errors.push('Include at least one special character');

  if (password.length > 128) {
    errors.push('Password must be 128 characters or fewer');
  }

  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    errors.push('This password is too common — choose a stronger one');
    score = Math.max(0, score - 2);
  }

  if (email) {
    const emailLocal = email.split('@')[0]?.toLowerCase() ?? '';
    if (emailLocal.length >= 3 && normalized.includes(emailLocal)) {
      errors.push('Password must not contain your email');
    }
    if (normalized === email.toLowerCase()) {
      errors.push('Password must not be your email address');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    score: Math.min(score, 6),
  };
}

export function passwordStrengthLabel(score: number): { label: string; color: string } {
  if (score <= 2) return { label: 'Weak', color: 'text-red-600' };
  if (score <= 4) return { label: 'Fair', color: 'text-amber-600' };
  if (score <= 5) return { label: 'Strong', color: 'text-emerald-600' };
  return { label: 'Very strong', color: 'text-emerald-700' };
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return password.length > 0 && password === confirm;
}
