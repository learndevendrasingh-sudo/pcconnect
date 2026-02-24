'use client';

import { useState } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';
import type { QualityPreset } from '@securedesk/shared';
import { Settings2 } from 'lucide-react';

const QUALITY_OPTIONS: { value: QualityPreset; label: string; detail: string }[] = [
  { value: 'auto', label: 'Auto', detail: 'Adapts to network' },
  { value: 'low', label: 'Low', detail: '720p / 15fps' },
  { value: 'medium', label: 'Medium', detail: '1080p / 24fps' },
  { value: 'high', label: 'High', detail: '1080p / 30fps' },
];

export function QualitySelector() {
  const { quality, setQuality } = useSessionStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Quality"
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[#90acd0] hover:bg-[#1c3860] hover:text-[#edf2fc] transition-colors"
      >
        <Settings2 className="h-4 w-4" />
        <span className="text-xs capitalize">{quality}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-48 rounded-lg border border-[#1e3f68] bg-[#162f50] p-1 shadow-xl">
            {QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setQuality(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                  quality === opt.value
                    ? 'bg-[#2b5ddb]/20 text-[#5b87f7]'
                    : 'text-[#b0c4e8] hover:bg-[#1c3860]'
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-xs text-[#5e80a8]">{opt.detail}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
