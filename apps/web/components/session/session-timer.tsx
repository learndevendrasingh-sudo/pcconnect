'use client';

import { useSessionTimer } from '@/lib/hooks/use-session-timer';
import { Clock } from 'lucide-react';

export function SessionTimer() {
  const { formatted } = useSessionTimer();

  return (
    <div className="flex items-center gap-1.5 text-white/60">
      <Clock className="h-3.5 w-3.5" />
      <span className="font-mono text-sm">{formatted}</span>
    </div>
  );
}
