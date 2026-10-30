import { createHash } from 'node:crypto';
import { config } from './config.js';

/** Removes control characters, collapses whitespace and caps length. */
export function sanitize(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, config.maxInputChars);
}

/** Masks phone numbers and emails before anything is stored or sent to the model. */
export function redactPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, '[number]');
}

/** We never store the raw WhatsApp number: sessions are keyed by a salted hash. */
export function hashUser(from: string): string {
  const salt = process.env.USER_HASH_SALT ?? 'vidyamitra';
  return createHash('sha256').update(salt + from).digest('hex').slice(0, 32);
}

const recent = new Map<string, number[]>();
/** Sliding-window per-student rate limit (protects the shared free-tier quota). */
export function allowUser(userId: string, now = Date.now()): boolean {
  const windowMs = 60_000;
  const list = (recent.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= config.perUserPerMinute) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}
