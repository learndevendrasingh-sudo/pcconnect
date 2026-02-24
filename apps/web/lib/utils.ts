import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':');
}

export function generateConnectionId(): string {
  const id = Math.floor(100_000_000 + Math.random() * 900_000_000);
  return id.toString();
}

export function maskPassword(password: string): string {
  return password.slice(0, 2) + '*'.repeat(password.length - 4) + password.slice(-2);
}
