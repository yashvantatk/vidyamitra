/**
 * Global token bucket that keeps us inside the LLM's requests-per-minute quota.
 * A request waits up to `maxWaitMs` for a slot; otherwise the caller sends a polite "busy" reply
 * instead of letting the API return 429 errors.
 */
export class RpmLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(private rpm: number) {
    this.tokens = rpm;
  }
  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.rpm, this.tokens + ((now - this.last) / 60_000) * this.rpm);
    this.last = now;
  }
  async acquire(maxWaitMs = 8000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
      const waitMs = ((1 - this.tokens) / this.rpm) * 60_000;
      if (Date.now() + waitMs > deadline) return false;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 500)));
    }
  }
}
