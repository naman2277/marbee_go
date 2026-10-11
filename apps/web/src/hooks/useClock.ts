import { useEffect, useState } from 'react';

export function useClock(intervalMs = 30_000): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function useFormattedDate(): string {
  const [label, setLabel] = useState(() =>
    new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
  );

  useEffect(() => {
    const tick = () =>
      setLabel(
        new Date().toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
      );
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return label;
}
