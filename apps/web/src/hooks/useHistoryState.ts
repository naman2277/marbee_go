import { useCallback, useMemo, useRef, useState } from 'react';

type HistoryOptions = {
  /** ms window in which consecutive `set` calls are coalesced into one undo step */
  coalesceMs?: number;
  /** max snapshots kept */
  limit?: number;
};

/**
 * Undo/redo state container. `set` pushes a new present value; rapid successive
 * edits (typing, dragging a slider) within `coalesceMs` replace the last entry
 * instead of stacking, so one Ctrl+Z reverts a whole edit gesture. Pass
 * `{ commit: true }` to force a discrete history step.
 *
 * Refs are the source of truth; the useState mirrors exist only to trigger
 * re-renders. All mutation happens in the `set`/`undo`/`redo` callbacks (event
 * context), never inside a state updater — safe under React StrictMode.
 */
export function useHistoryState<T>(initial: T, options: HistoryOptions = {}) {
  const { coalesceMs = 400, limit = 100 } = options;

  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const presentRef = useRef<T>(initial);
  const lastPushRef = useRef<number>(0);

  const [snapshot, setSnapshot] = useState({
    present: initial,
    canUndo: false,
    canRedo: false,
  });

  const sync = useCallback(() => {
    setSnapshot({
      present: presentRef.current,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { commit?: boolean }) => {
      const prev = presentRef.current;
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (Object.is(value, prev)) return;

      const now = Date.now();
      const coalesce = !opts?.commit && now - lastPushRef.current < coalesceMs;
      lastPushRef.current = now;

      if (!coalesce) {
        const nextPast = [...pastRef.current, prev];
        pastRef.current = nextPast.length > limit ? nextPast.slice(nextPast.length - limit) : nextPast;
      }
      futureRef.current = [];
      presentRef.current = value;
      sync();
    },
    [coalesceMs, limit, sync],
  );

  /** Replace present without touching history (e.g. external reload of the same doc). */
  const reset = useCallback(
    (value: T) => {
      pastRef.current = [];
      futureRef.current = [];
      presentRef.current = value;
      lastPushRef.current = 0;
      sync();
    },
    [sync],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    futureRef.current = [presentRef.current, ...futureRef.current];
    pastRef.current = pastRef.current.slice(0, -1);
    presentRef.current = previous;
    lastPushRef.current = 0;
    sync();
  }, [sync]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const [nextVal, ...rest] = futureRef.current;
    pastRef.current = [...pastRef.current, presentRef.current];
    futureRef.current = rest;
    presentRef.current = nextVal;
    lastPushRef.current = 0;
    sync();
  }, [sync]);

  return useMemo(
    () => ({
      state: snapshot.present,
      set,
      reset,
      undo,
      redo,
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
    }),
    [snapshot, set, reset, undo, redo],
  );
}
