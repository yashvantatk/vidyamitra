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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction(session) }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: config.gemini.maxOutputTokens,
      // Tutoring answers are short; skip "thinking" tokens to keep latency low on 2.5 models.
      ...(config.gemini.model.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.gemini.timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as any;
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
