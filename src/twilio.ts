import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import type { IncomingMessage, Media } from './types.js';

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Verifies the X-Twilio-Signature header (HMAC-SHA1 of URL + sorted POST params). */
export function validTwilioSignature(signature: string | undefined, url: string, params: Record<string, string>): boolean {
  if (!signature || !config.twilio.authToken) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', config.twilio.authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Downloads a WhatsApp photo / voice note from Twilio (media URLs need the account's basic auth). */
async function downloadMedia(url: string, mimeType: string): Promise<Media | undefined> {
  const headers: Record<string, string> = {};
  if (config.twilio.accountSid && config.twilio.authToken) {
    headers.Authorization = 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
  }
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`media download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) return undefined;
  // WhatsApp voice notes arrive as audio/ogg (opus), which Gemini accepts directly.
  return { mimeType: (res.headers.get('content-type') ?? mimeType).split(';')[0], base64: buf.toString('base64') };
}

export async function parseTwilio(body: Record<string, string>): Promise<IncomingMessage> {
  const msg: IncomingMessage = { from: body.From ?? body.WaId ?? 'unknown', text: body.Body ?? '' };
  if (Number(body.NumMedia ?? 0) > 0 && body.MediaUrl0) {
    const type = body.MediaContentType0 ?? 'application/octet-stream';
    msg.mediaKind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'other';
    if (msg.mediaKind !== 'other') msg.media = await downloadMedia(body.MediaUrl0, type);
  }
  return msg;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** WhatsApp caps a message at 1,600 characters, so long answers are split on line breaks. */
export function splitForWhatsApp(text: string, limit = 1500): string[] {
  const out: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > limit && cur) {
      out.push(cur);
      cur = line;
    } else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) out.push(cur);
  return out.flatMap((c) => (c.length > limit ? c.match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g'))! : [c]));
}

export function twiml(text: string): string {
  const messages = splitForWhatsApp(text).map((m) => `<Message>${esc(m)}</Message>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${messages}</Response>`;
}
