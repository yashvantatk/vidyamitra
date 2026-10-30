import { config } from './config.js';
import type { Media, Session, Turn } from './types.js';
import { systemInstruction } from './prompts.js';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface TutorReply {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  ms: number;
}

/**
 * One Gemini call does the whole "understand + explain" step: Gemini is multimodal, so a homework
 * photo (OCR) or a voice note (speech-to-text) goes in as inline data with the text, and no separate
 * OCR or STT service is needed.
 */
export async function askGemini(session: Session, history: Turn[], userText: string, media?: Media): Promise<TutorReply> {
  const started = Date.now();
  if (config.mockLlm) return mockReply(session, userText, media, started);

  const contents: Content[] = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  const parts: Part[] = [];
  if (media) parts.push({ inlineData: { mimeType: media.mimeType, data: media.base64 } });
  parts.push({ text: userText || (media ? 'Please help me with this.' : '') });
  contents.push({ role: 'user', parts });

  const data = await callWithFallback(session, contents);
  const cand = data.candidates?.[0];
  const text: string =
    cand?.content?.parts?.map((p: any) => p.text ?? '').join('').trim() ||
    (cand?.finishReason === 'SAFETY' || data.promptFeedback?.blockReason
      ? session.lang === 'ta'
        ? 'மன்னிக்கவும், அதற்கு என்னால் உதவ முடியாது. படிப்பு சந்தேகம் ஏதாவது கேளுங்கள் 🙂'
        : "Sorry, I can't help with that. Ask me a study doubt instead 🙂"
      : '');
  return {
    text,
    tokensIn: data.usageMetadata?.promptTokenCount,
    tokensOut: data.usageMetadata?.candidatesTokenCount,
    ms: Date.now() - started,
  };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tries the primary model, then each fallback (GEMINI_FALLBACK_MODELS). A busy model (429/5xx)
 * gets one quick retry before we move on, all inside one overall deadline so Twilio's 15 s
 * webhook window is never exceeded.
 */
async function callWithFallback(session: Session, contents: Content[]): Promise<any> {
  const models = [config.gemini.model, ...config.gemini.fallbackModels.filter((m) => m !== config.gemini.model)];
  const deadline = Date.now() + config.gemini.timeoutMs;
  let lastErr: (Error & { status?: number }) | undefined;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
          body: JSON.stringify(requestBody(session, contents, model)),
          // Don't let one slow model eat the whole budget: leave time for a fallback.
          signal: AbortSignal.timeout(Math.min(remaining, config.gemini.attemptTimeoutMs)),
        });
        if (res.ok) {
          if (model !== config.gemini.model) console.warn(`[gemini] answered by fallback model ${model}`);
          return await res.json();
        }
        const detail = await res.text();
        lastErr = Object.assign(new Error(`Gemini ${res.status} (${model}): ${detail.slice(0, 300)}`), { status: res.status });
        if (!RETRYABLE.has(res.status)) throw lastErr; // bad key / bad request: retrying won't help
        console.warn(`[gemini] ${model} busy (${res.status}), ${attempt === 0 ? 'retrying' : 'trying next model'}`);
      } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status && !RETRYABLE.has(e.status)) throw e;
        lastErr = e; // timeout or network error
      }
      if (attempt === 0) await sleep(600 + Math.random() * 600);
    }
  }
  throw lastErr ?? new Error('Gemini: no model answered in time');
}

function thinkingFor(model: string) {
  if (model.includes('2.5')) return { thinkingBudget: 0 };
  // 3.8 Flash and Pro-class models support low/medium/high; most other 3.x models also support minimal.
  if (/3\.8|pro|argon/.test(model)) return { thinkingLevel: 'low' };
  return { thinkingLevel: 'minimal' };
}

function requestBody(session: Session, contents: Content[], model: string) {
  return {
    systemInstruction: { parts: [{ text: systemInstruction(session) }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: config.gemini.maxOutputTokens,
      // Tutoring answers are short: keep thinking as low as each model allows, for speed
      // (maxOutputTokens also counts thinking tokens, so heavy thinking can leave an empty answer).
      thinkingConfig: thinkingFor(model),
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' })),
  };
}

/** Deterministic fake tutor for load tests: echoes the grade from session state so tests can check isolation. */
async function mockReply(session: Session, userText: string, media: Media | undefined, started: number): Promise<TutorReply> {
  const delay = Number(process.env.MOCK_LATENCY_MS ?? 1200);
  await new Promise((r) => setTimeout(r, delay * (0.7 + Math.random() * 0.6)));
  const what = media ? `${media.mimeType} attachment` : `"${userText.slice(0, 40)}"`;
  return {
    text: `[mock grade=${session.grade ?? 'none'} lang=${session.lang}] Step 1 for ${what}. What do you think comes next?`,
    tokensIn: 300,
    tokensOut: 60,
    ms: Date.now() - started,
  };
}
