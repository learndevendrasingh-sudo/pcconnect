'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';

export function useSessionTimer() {
  const { startedAt, elapsedSeconds, tick, startTimer } = useSessionStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt && !intervalRef.current) {
      intervalRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startedAt, tick]);

  const formatted = formatTime(elapsedSeconds);

  return { elapsedSeconds, formatted, startTimer };
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':');
}
