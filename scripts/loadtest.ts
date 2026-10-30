/**
 * Webhook stress test (Point 4 simulation).
 *
 * Fires N virtual students at the Twilio webhook in parallel. Each student first sets a different
 * class, then asks questions. We check that:
 *   1. no request is dropped (every call returns 200 + a TwiML <Message>),
 *   2. state never leaks between students (with MOCK_LLM=true the reply echoes the class held in
 *      that student's session, so a wrong class means corrupted / mixed state),
 * and we report p50 / p95 / max latency.
 *
 * Usage:  npx tsx scripts/loadtest.ts [baseUrl] [students] [questionsEach]
 * Example: MOCK_LLM=true GEMINI_RPM=100000 PER_USER_PER_MINUTE=100 npm start   (server)
 *          npx tsx scripts/loadtest.ts http://localhost:3000 100 3              (test)
 */
const base = process.argv[2] ?? 'http://localhost:3000';
const students = Number(process.argv[3] ?? 100);
const perStudent = Number(process.argv[4] ?? 3);

async function post(from: string, body: string) {
  const t = performance.now();
  const res = await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, Body: body, NumMedia: '0' }),
  });
  const xml = await res.text();
  return { ok: res.ok && xml.includes('<Message>'), ms: performance.now() - t, xml };
}

const questions = ['2x + 5 = 15 எப்படி?', 'What is photosynthesis?', 'பின்னம் என்றால் என்ன?', 'Explain Newton first law', 'LCM of 12 and 18'];

async function student(i: number) {
  const from = `whatsapp:+9190000${String(i).padStart(5, '0')}`;
  const grade = 6 + (i % 7);
  const results: { ok: boolean; ms: number; leak: boolean }[] = [];
  await post(from, `class ${grade}`);
  for (let q = 0; q < perStudent; q++) {
    const r = await post(from, questions[(i + q) % questions.length]);
    const m = r.xml.match(/grade=(\w+)/);
    results.push({ ok: r.ok, ms: r.ms, leak: m ? m[1] !== String(grade) : false });
  }
  return results;
}

const t0 = performance.now();
const all = (await Promise.all(Array.from({ length: students }, (_, i) => student(i)))).flat();
const wall = (performance.now() - t0) / 1000;
const lat = all.map((r) => r.ms).sort((a, b) => a - b);
const pct = (q: number) => Math.round(lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]);

const report = {
  when: new Date().toISOString(),
  target: base,
  students,
  questionsEach: perStudent,
  tutorRequests: all.length,
  dropped: all.filter((r) => !r.ok).length,
  stateLeaks: all.filter((r) => r.leak).length,
  latencyMs: { p50: pct(0.5), p95: pct(0.95), max: Math.round(lat.at(-1) ?? 0) },
  wallClockSec: Number(wall.toFixed(2)),
  throughputPerSec: Number((all.length / wall).toFixed(1)),
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.dropped || report.stateLeaks ? 1 : 0);
