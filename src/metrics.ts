/** Tiny in-process metrics for /stats: counts, latency percentiles and token use. */
class Metrics {
  private lat: number[] = [];
  private kinds: Record<string, number> = {};
  private tin = 0;
  private tout = 0;
  private started = Date.now();

  record(kind: string, ms: number) {
    this.kinds[kind] = (this.kinds[kind] ?? 0) + 1;
    if (!['command', 'rate_limited'].includes(kind)) {
      this.lat.push(ms);
      if (this.lat.length > 5000) this.lat.shift();
    }
  }
  tokens(i = 0, o = 0) {
    this.tin += i;
    this.tout += o;
  }
  snapshot() {
    const s = [...this.lat].sort((a, b) => a - b);
    const p = (q: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0);
    const tutorTurns = s.length || 1;
    return {
      uptimeSec: Math.round((Date.now() - this.started) / 1000),
      messages: this.kinds,
      latencyMs: { p50: p(0.5), p95: p(0.95), max: s.at(-1) ?? 0, samples: s.length },
      tokens: { in: this.tin, out: this.tout, avgPerTurn: Math.round((this.tin + this.tout) / tutorTurns) },
    };
  }
}
export const metrics = new Metrics();
