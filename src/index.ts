import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { metrics } from './metrics.js';
import { createStore } from './state.js';
import { handleMessage } from './tutor.js';
import { parseTwilio, twiml, validTwilioSignature } from './twilio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', here.includes(`${path.sep}dist${path.sep}`) ? '..' : '', 'public');

async function main() {
  if (!config.gemini.apiKey && !config.mockLlm) {
    console.warn('[config] GEMINI_API_KEY is not set. Set it, or run with MOCK_LLM=true for testing.');
  }
  const store = await createStore();
  const app = express();
  app.set('trust proxy', true);
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, model: config.gemini.model, mock: config.mockLlm }));
  app.get('/stats', async (_req, res) => res.json({ ...metrics.snapshot(), activeSessions: await store.count() }));

  /** Twilio WhatsApp webhook: receives the message, answers with TwiML. */
  app.post('/webhook', async (req, res) => {
    const params = req.body as Record<string, string>;
    if (config.twilio.validateSignature) {
      const url = (config.twilio.publicUrl || `${req.protocol}://${req.get('host')}`) + req.originalUrl;
      if (!validTwilioSignature(req.get('X-Twilio-Signature'), url, params)) return res.status(403).send('bad signature');
    }
    try {
      const msg = await parseTwilio(params);
      const reply = await handleMessage(store, msg);
      res.type('text/xml').send(twiml(reply));
    } catch (e) {
      console.error('[webhook]', e);
      res.type('text/xml').send(twiml('Sorry, something went wrong. Please try again.'));
    }
  });

  /** JSON endpoint used by the web demo page and the load test (same pipeline, no WhatsApp needed). */
  app.post('/api/chat', async (req, res) => {
    const { userId, text, image } = req.body as { userId?: string; text?: string; image?: { mimeType: string; base64: string } };
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const reply = await handleMessage(store, {
      from: `web:${userId}`,
      text: text ?? '',
      media: image,
      mediaKind: image ? 'image' : undefined,
    });
    res.json({ reply });
  });

  app.use(express.static(publicDir));

  app.listen(config.port, () => console.log(`VidyaMitra listening on :${config.port} (model ${config.gemini.model}${config.mockLlm ? ', MOCK' : ''})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
