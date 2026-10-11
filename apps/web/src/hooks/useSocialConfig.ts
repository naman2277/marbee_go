import { useCallback, useEffect, useState } from 'react';
import {
  defaultSocialConfig,
  loadSocialConfig,
  saveSocialConfig,
  type SocialConfig,
} from '@/lib/social-config';

/**
 * Reactive access to the Social Studio configuration for a tenant/environment.
 * Reads from the local store, keeps in sync across tabs / other hook instances
 * via the `marbee:social-config` + native `storage` events, and persists on
 * every `update`.
 */
export function useSocialConfig(tenantId: string, environment: string) {
  const [config, setConfig] = useState<SocialConfig>(() =>
    typeof window === 'undefined' ? defaultSocialConfig() : loadSocialConfig(tenantId, environment),
  );

  useEffect(() => {
    setConfig(loadSocialConfig(tenantId, environment));
    const reload = () => setConfig(loadSocialConfig(tenantId, environment));
    window.addEventListener('marbee:social-config', reload as EventListener);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('marbee:social-config', reload as EventListener);
      window.removeEventListener('storage', reload);
    };
  }, [tenantId, environment]);

  const update = useCallback(
    (recipe: (draft: SocialConfig) => SocialConfig | void) => {
      setConfig((prev) => {
        const clone: SocialConfig = JSON.parse(JSON.stringify(prev));
        const next = recipe(clone) ?? clone;
        saveSocialConfig(tenantId, environment, next);
        return next;
      });
    },
    [tenantId, environment],
  );

  const reset = useCallback(() => {
    const fresh = defaultSocialConfig();
    saveSocialConfig(tenantId, environment, fresh);
    setConfig(fresh);
  }, [tenantId, environment]);

  return { config, update, reset };
}
