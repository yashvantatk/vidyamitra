# Webhook stress test — results

Run: 2026-10-31, `scripts/loadtest.ts`, server in `MOCK_LLM=true` mode (Gemini replaced by a fake tutor
with 1.05–1.95 s random latency, so the test measures our backend, not Google's quota).

| Metric | Result |
|---|---|
| Virtual students (parallel) | 120 |
| Tutor requests | 360 (3 per student, after a `class N` command) |
| Dropped requests | **0** |
| State leaks between students | **0** (each reply echoed the right class) |
| Latency p50 / p95 / max | 1,565 / 1,944 / 2,050 ms |
| Throughput | 59.8 requests/s on one Node.js process |

Backend overhead over the simulated LLM time is under ~100 ms at p95. Real end-to-end latency =
Twilio transit + this overhead + Gemini generation time (measure with `/stats` once live).

Reproduce:

```bash
MOCK_LLM=true GEMINI_RPM=100000 PER_USER_PER_MINUTE=100 npm start
npx tsx scripts/loadtest.ts http://localhost:3000 120 3
```
