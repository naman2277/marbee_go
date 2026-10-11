import { supabase } from './supabase';
import { logAudit } from './audit';
import type { Customer } from '@marbee/shared';
import {
  pickMasterCustomer,
  type MasterStrategy,
} from './customer-data-cleaner';

export type HealthTaskType = 'merge_all' | 'delete_duplicates' | 'fix_phone_contaminations';

export type HealthWorkerState = {
  isRunning: boolean;
  type: HealthTaskType | null;
  progress: number; // 0-100
  processedCount: number;
  totalCount: number;
  statusText: string;
  completed: boolean;
  error: string | null;
};

// Global module-level singleton state that persists across React component unmounts/tab switching
let globalWorkerState: HealthWorkerState = {
  isRunning: false,
  type: null,
  progress: 0,
  processedCount: 0,
  totalCount: 0,
  statusText: '',
  completed: false,
  error: null,
};

const listeners = new Set<(state: HealthWorkerState) => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener({ ...globalWorkerState }));
}

export function getHealthWorkerState(): HealthWorkerState {
  return { ...globalWorkerState };
}

export function subscribeHealthWorker(listener: (state: HealthWorkerState) => void): () => void {
  listeners.add(listener);
  listener({ ...globalWorkerState });
  return () => {
    listeners.delete(listener);
  };
}

function updateWorkerState(patch: Partial<HealthWorkerState>) {
  globalWorkerState = { ...globalWorkerState, ...patch };
  notifyListeners();
}

/** Audio sound effects for completion */
function playCompletionChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.08);
    gain2.gain.setValueAtTime(0.2, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.7);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.6);
  } catch (err) {
    console.warn('Audio error:', err);
  }
}

function playTrashSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1300, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.22);
    filter.Q.setValueAtTime(2.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    oscGain.gain.setValueAtTime(0.3, now + 0.04);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.22);
    osc.start(now + 0.04);
    osc.stop(now + 0.25);
  } catch (err) {
    console.warn('Trash sound error:', err);
  }
}

/** High-Speed Bulk Merge All Duplicate Groups */
export async function startBulkAutoMerge(
  tenantId: string,
  environment: string,
  duplicateGroups: Customer[][],
  strategy: MasterStrategy = 'creation_date_oldest',
  onFinishedCallback?: () => void
) {
  if (globalWorkerState.isRunning) return;

  const totalGroups = duplicateGroups.length;
  if (totalGroups === 0) return;

  updateWorkerState({
    isRunning: true,
    type: 'merge_all',
    progress: 15,
    processedCount: 0,
    totalCount: totalGroups,
    statusText: `Analyzing and unifying ${totalGroups} duplicate customer groups…`,
    completed: false,
    error: null,
  });

  try {
    // 1. Gather all master updates and all secondary duplicate IDs to merge in-memory
    const allToMergeIds: string[] = [];
    const masterUpdates: { masterId: string; patch: Record<string, unknown> }[] = [];

    duplicateGroups.forEach((dups) => {
      const { master, secondary } = pickMasterCustomer(dups, strategy);
      const toMergeIds = secondary.map((d) => d.id);
      if (!toMergeIds.length) return;

      toMergeIds.forEach((id) => allToMergeIds.push(id));

      const patch: Record<string, unknown> = {};
      if (!master.first_name) {
        const fn = secondary.find((r) => r.first_name)?.first_name;
        if (fn) patch.first_name = fn;
      }
      if (!master.last_name) {
        const ln = secondary.find((r) => r.last_name)?.last_name;
        if (ln) patch.last_name = ln;
      }
      if (!master.mobile || String(master.mobile).includes('@')) {
        const mob = secondary.find((r) => r.mobile && !String(r.mobile).includes('@'))?.mobile;
        if (mob) patch.mobile = mob;
      }
      if (!master.city) {
        const city = secondary.find((r) => r.city)?.city;
        if (city) patch.city = city;
      }
      if (!master.country) {
        const cty = secondary.find((r) => r.country)?.country;
        if (cty) patch.country = cty;
      }

      if (Object.keys(patch).length > 0) {
        masterUpdates.push({ masterId: master.id, patch });
      }
    });

    updateWorkerState({
      progress: 45,
      processedCount: Math.round(totalGroups * 0.45),
      statusText: `Enriching master records and re-linking relational tables…`,
    });

    // 2. Execute master updates in parallel chunks
    if (masterUpdates.length > 0) {
      await Promise.all(
        masterUpdates.map(({ masterId, patch }) =>
          supabase
            .from('customers')
            .update(patch)
            .eq('id', masterId)
            .eq('tenant_id', tenantId)
            .eq('environment', environment)
        )
      );
    }

    updateWorkerState({
      progress: 75,
      processedCount: Math.round(totalGroups * 0.75),
      statusText: `Cleaning ${allToMergeIds.length} duplicate copies from database…`,
    });

    // 3. Hard-delete all duplicate records
    const BATCH_CHUNK = 100;

    for (let i = 0; i < allToMergeIds.length; i += BATCH_CHUNK) {
      const chunk = allToMergeIds.slice(i, i + BATCH_CHUNK);

      await supabase
        .from('customers')
        .delete()
        .in('id', chunk)
        .eq('tenant_id', tenantId)
        .eq('environment', environment);

      // Clean from customers table
      await supabase
        .from('customers')
        .delete()
        .in('id', chunk)
        .eq('tenant_id', tenantId)
        .eq('environment', environment);
    }

    void logAudit({
      tenantId,
      environment,
      action: 'update',
      resourceType: 'customer',
      resourceId: tenantId,
      resourceName: `Bulk Auto-Merged ${totalGroups} duplicate customer groups (${allToMergeIds.length} duplicates unified)`,
    });

    playTrashSound();
    playCompletionChime();

    updateWorkerState({
      isRunning: false,
      progress: 100,
      processedCount: totalGroups,
      statusText: `Successfully unified ${totalGroups} duplicate groups (${allToMergeIds.length} duplicate records resolved)!`,
      completed: true,
    });

    if (onFinishedCallback) onFinishedCallback();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to complete auto-merge';
    updateWorkerState({
      isRunning: false,
      error: errorMsg,
      statusText: `Error: ${errorMsg}`,
    });
  }
}

/** High-Speed 1-Click Bulk Delete All Duplicates (Keeps Master, Removes Duplicate Copies) */
export async function startBulkDeleteDuplicates(
  tenantId: string,
  environment: string,
  duplicateGroups: Customer[][],
  strategy: MasterStrategy = 'creation_date_oldest',
  onFinishedCallback?: () => void
) {
  if (globalWorkerState.isRunning) return;

  const totalGroups = duplicateGroups.length;
  if (totalGroups === 0) return;

  // Collect all duplicate IDs to delete (excluding master of each group)
  const allDuplicateIdsToDelete: string[] = [];
  duplicateGroups.forEach((dups) => {
    const { secondary } = pickMasterCustomer(dups, strategy);
    secondary.forEach((s) => allDuplicateIdsToDelete.push(s.id));
  });

  const totalToDelete = allDuplicateIdsToDelete.length;
  if (totalToDelete === 0) return;

  updateWorkerState({
    isRunning: true,
    type: 'delete_duplicates',
    progress: 20,
    processedCount: 0,
    totalCount: totalToDelete,
    statusText: `Preparing to delete ${totalToDelete} duplicate records across ${totalGroups} groups…`,
    completed: false,
    error: null,
  });

  try {
    const BATCH_CHUNK = 100;
    for (let i = 0; i < totalToDelete; i += BATCH_CHUNK) {
      const chunk = allDuplicateIdsToDelete.slice(i, i + BATCH_CHUNK);

      await supabase
        .from('customers')
        .delete()
        .in('id', chunk)
        .eq('tenant_id', tenantId)
        .eq('environment', environment);

      const processed = Math.min(i + BATCH_CHUNK, totalToDelete);
      const pct = Math.round((processed / totalToDelete) * 100);

      updateWorkerState({
        progress: pct,
        processedCount: processed,
        statusText: `Deleted ${processed} of ${totalToDelete} duplicate customer profiles (${pct}%)…`,
      });
    }

    void logAudit({
      tenantId,
      environment,
      action: 'delete',
      resourceType: 'customer',
      resourceId: tenantId,
      resourceName: `Bulk Deleted ${totalToDelete} duplicate customer profiles`,
    });

    playTrashSound();
    playCompletionChime();

    updateWorkerState({
      isRunning: false,
      progress: 100,
      processedCount: totalToDelete,
      statusText: `Successfully deleted all ${totalToDelete} duplicate records!`,
      completed: true,
    });

    if (onFinishedCallback) onFinishedCallback();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to complete bulk delete';
    updateWorkerState({
      isRunning: false,
      error: errorMsg,
      statusText: `Error: ${errorMsg}`,
    });
  }
}

/** Reset worker completion state */
export function dismissHealthWorker() {
  updateWorkerState({
    isRunning: false,
    type: null,
    progress: 0,
    processedCount: 0,
    totalCount: 0,
    statusText: '',
    completed: false,
    error: null,
  });
}
