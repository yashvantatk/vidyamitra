# VidyaMitra 📚 — a Tamil-first AI tutor on WhatsApp

VidyaMitra is a WhatsApp chatbot that tutors rural Tamil Nadu state-board students (Classes 6–12) in
Tamil and English. Students type a doubt, send a **photo of their homework** or a **voice note**, and get a
step-by-step, Socratic explanation in seconds. No app to install, no new interface to learn.

Built for the **SEVA FIRST Innovation Challenge 2026** (Education & Skill Development) by Yashvant A T K,
IIITDM Kancheepuram.

## How it works

```
Student's WhatsApp
      │  text / photo / voice note
      ▼
Twilio WhatsApp API ──HTTPS POST──▶  /webhook  (Express, TypeScript)
                                       │ 1. verify Twilio signature
                                       │ 2. sanitise input, mask phone numbers / emails
                                       │ 3. hash the sender number (no raw PII stored)
                                       │ 4. load session (class, language, last turns) — MongoDB or memory
                                       │ 5. detect language (Tamil script / Tanglish / English)
                                       │ 6. commands: class N · tamil · english · reset · help
                                       │ 7. trim history to a token budget (context injection)
                                       │ 8. global RPM limiter (stays inside the free tier)
                                       ▼
                               Gemini 2.5 Flash  (one multimodal call:
                               reads the photo / audio + Socratic system prompt)
                                       │
                                       ▼
                       format for WhatsApp (split >1,500 chars) → TwiML reply → student
```

Gemini is multimodal, so the photo (OCR) and voice note (speech-to-text) go into the same request as the
question. There is no separate OCR or STT service to pay for or maintain.

## Features

- Socratic tutoring: one step at a time, ends each reply with a question for the student
- Tamil, English and Tanglish detection; `tamil` / `english` to lock a language
- Class-aware answers (`class 8`, `வகுப்பு 8`), pitched at the Samacheer Kalvi level
- Homework photos and WhatsApp voice notes (audio/ogg) understood natively by Gemini
- Conversation memory with a token budget, so long sessions never overflow the context
- Per-student lock: two quick messages from one student never corrupt each other's history
- Child safety: strict Gemini safety thresholds, education-only scope, Childline 1098 guidance
- Privacy: sender numbers stored only as salted SHA-256 hashes; phone numbers/emails masked before the LLM
- Free-tier friendly: global requests-per-minute limiter plus per-student rate limit, polite "busy" reply
- `/stats` endpoint: latency p50/p95, token use, active sessions
- Web demo page at `/` (same pipeline, handy for the pitch video)

## Run it locally

```bash
git clone https://github.com/yashvantatk/vidyamitra.git
cd vidyamitra
npm install
cp .env.example .env        # add your GEMINI_API_KEY (free at https://aistudio.google.com/apikey)
npm run dev                 # http://localhost:3000 opens the web demo
```

No key handy? `MOCK_LLM=true npm run dev` runs the whole pipeline with a fake tutor.

## Connect WhatsApp (Twilio sandbox, free)

1. Create a free account at twilio.com, then open **Messaging → Try it out → Send a WhatsApp message**.
2. From your phone, send the `join <two-words>` code shown there to the sandbox number.
3. Deploy (below) or expose your laptop with `npx localtunnel --port 3000`.
4. In the sandbox settings, set **When a message comes in** to `https://<your-host>/webhook` (POST).
5. Put `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env` (needed to download photos and voice notes).
6. Send `hi` to the sandbox number.

## Deploy (Render free tier)

The repo includes `render.yaml`. On render.com choose **New → Blueprint**, pick this repo, and fill in
`GEMINI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and (optionally) `MONGODB_URI` from a free
MongoDB Atlas M0 cluster. A `Dockerfile` is included for any other host.

## Load test

```bash
MOCK_LLM=true GEMINI_RPM=100000 PER_USER_PER_MINUTE=100 npm start
npm run loadtest -- http://localhost:3000 120 3
```

Latest result (120 parallel students, 360 tutor requests): **0 dropped, 0 state leaks**, p95 1.94 s with
a simulated 1–2 s LLM, ~60 requests/s on one process. See [docs/loadtest-results.md](docs/loadtest-results.md).

## Project layout

| Path | What it does |
|---|---|
| `src/index.ts` | Express server: `/webhook`, `/api/chat`, `/health`, `/stats`, web demo |
| `src/tutor.ts` | Message pipeline: commands, language, context trimming, LLM call, memory |
| `src/gemini.ts` | Gemini REST client (multimodal, safety settings) + mock tutor |
| `src/prompts.ts` | Socratic system prompt and Tamil/English bot messages |
| `src/twilio.ts` | Signature check, media download, TwiML and message splitting |
| `src/state.ts` | Session store (memory or MongoDB with TTL) and per-user locks |
| `src/limiter.ts` | Token-bucket limiter for the LLM's requests-per-minute quota |
| `src/safety.ts` | Input sanitising, PII masking, number hashing, per-student rate limit |
| `scripts/loadtest.ts` | Webhook stress test |

## Roadmap

- Meta WhatsApp Cloud API adapter (direct, no Twilio) for production
- Voice replies (Tamil text-to-speech) for students who prefer listening
- Teacher mode: generate worksheets and quick quizzes in Tamil
- Answer-checking pass for maths (recompute the final answer before sending)

## License

MIT
