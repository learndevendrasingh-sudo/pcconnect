import { CONFIG } from '@securedesk/shared';

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

export class RateLimiter {
  private attempts = new Map<string, AttemptRecord>();

  recordAttempt(ip: string) {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record || now - record.firstAttempt > CONFIG.AUTH_WINDOW_MS) {
      // Start new window
      this.attempts.set(ip, { count: 1, firstAttempt: now });
    } else {
      record.count++;
    }
  }

  isBlocked(ip: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record) return false;

    // Reset if window expired
    if (now - record.firstAttempt > CONFIG.AUTH_WINDOW_MS) {
      this.attempts.delete(ip);
      return false;
    }

    return record.count >= CONFIG.MAX_AUTH_ATTEMPTS;
  }

  // Periodic cleanup of expired records
  cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.attempts) {
      if (now - record.firstAttempt > CONFIG.AUTH_WINDOW_MS) {
        this.attempts.delete(ip);
      }
    }
  }
}
