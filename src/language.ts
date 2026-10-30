import type { Lang } from './types.js';

const TAMIL = /[\u0B80-\u0BFF]/g;
// Common Tanglish (Tamil typed in English letters) words.
const TANGLISH = /\b(enna|epdi|eppadi|sollu|sollunga|puriyala|theriyala|venum|illa|irukku|pannu|kanakku|vanakkam|anna|akka|seri|romba|konjam)\b/i;

/** Detects the language a student is writing in. Tanglish counts as Tamil. */
export function detectLang(text: string): Lang | undefined {
  if (!text.trim()) return undefined;
  const tamilChars = text.match(TAMIL)?.length ?? 0;
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '').length || 1;
  if (tamilChars / letters > 0.3) return 'ta';
  if (TANGLISH.test(text)) return 'ta';
  return 'en';
}

/** Very rough token estimate. Tamil script costs more tokens per character. */
export function estimateTokens(text: string): number {
  const tamil = text.match(TAMIL)?.length ?? 0;
  return Math.ceil((text.length - tamil) / 4 + tamil / 1.5);
}
