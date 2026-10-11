import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchAudiences,
  refreshAudience,
  isRefreshDue,
  refreshPollIntervalMs,
  type Audience,
} from '@/lib/audiences';

const DEFAULT_TICK_MS = 60_000;

/** While Audience pages are mounted, run due scheduled refreshes every minute */
export function useAudienceScheduler(tenantId: string, environment: string, enabled = true) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const tick = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const audiences = await fetchAudiences(tenantId, environment);
        const due = audiences.filter((a) => a.auto_refresh && isRefreshDue(a));
        for (const audience of due) {
          await refreshAudience(audience, tenantId, environment, 'scheduled');
        }
        if (due.length) {
          queryClient.invalidateQueries({ queryKey: ['audiences'] });
          queryClient.invalidateQueries({ queryKey: ['audience'] });
        }
      } catch {
        // tables may not exist until migration runs
      } finally {
        runningRef.current = false;
      }
    };

    tick();
    const id = window.setInterval(tick, DEFAULT_TICK_MS);
    return () => window.clearInterval(id);
  }, [tenantId, environment, enabled, queryClient]);
}

export function useAudienceLiveRefresh(
  audience: Audience | null | undefined,
  tenantId: string,
  environment: string,
  onRefreshed?: () => void,
) {
  const queryClient = useQueryClient();
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  useEffect(() => {
    if (!audience?.auto_refresh || !tenantId) return;

    const intervalMs = Math.min(refreshPollIntervalMs(audience), DEFAULT_TICK_MS);

    const id = window.setInterval(async () => {
      if (!isRefreshDue(audience)) return;
      await refreshAudience(audience, tenantId, environment, 'auto');
      queryClient.invalidateQueries({ queryKey: ['audience', audience.id] });
      queryClient.invalidateQueries({ queryKey: ['audience-members'] });
      queryClient.invalidateQueries({ queryKey: ['audience-refresh-logs'] });
      onRefreshedRef.current?.();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [audience, tenantId, environment, queryClient]);
}
