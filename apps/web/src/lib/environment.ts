export type Environment = 'development' | 'staging' | 'production';

export const ENV_STORAGE_KEY = 'marbee_environment';

export const ENV_SHORT_LABEL: Record<Environment, string> = {
  development: 'Dev',
  staging: 'Stage',
  production: 'Prod',
};

export const ENV_FULL_LABEL: Record<Environment, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

export const ENV_BADGE_CLASS: Record<Environment, string> = {
  development: 'bg-amber-100 text-amber-800 ring-amber-200',
  staging: 'bg-sky-100 text-sky-800 ring-sky-200',
  production: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

export function readStoredEnvironment(): Environment | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(ENV_STORAGE_KEY);
  if (value === 'development' || value === 'staging' || value === 'production') {
    return value;
  }
  return null;
}

export function storeEnvironment(env: Environment): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ENV_STORAGE_KEY, env);
}
