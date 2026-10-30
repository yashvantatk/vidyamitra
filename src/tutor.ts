import { config } from './config.js';
import { askGemini } from './gemini.js';
import { detectLang, estimateTokens } from './language.js';
import { RpmLimiter } from './limiter.js';
import { HELP, T, WELCOME } from './prompts.js';
import { allowUser, hashUser, redactPII, sanitize } from './safety.js';
import { newSession, withUserLock, type SessionStore } from './state.js';
import type { IncomingMessage, Session, Turn } from './types.js';
import { metrics } from './metrics.js';

const limiter = new RpmLimiter(config.gemini.rpm);

/** Picks the most recent turns that fit the token budget (the "context injection" step). */
export function trimHistory(history: Turn[], maxTurns: number, budget: number): Turn[] {
  const picked: Turn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && picked.length < maxTurns; i--) {
    const cost = estimateTokens(history[i].text);
    if (used + cost > budget) break;
    used += cost;
    picked.unshift(history[i]);
  }
  // Gemini expects the conversation to start with a user turn.
  while (picked.length && picked[0].role !== 'user') picked.shift();
  return picked;
}

const GRADE_RE = /^(?:class|std|grade|standard|வகுப்பு)\s*(\d{1,2})(?:\s*(?:th|ஆம்|-ஆம்))?\s*(?:வகுப்பு)?$/i;
const GRADE_ONLY_RE = /^(\d{1,2})(?:th|ஆம்)?\s*(?:class|std|வகுப்பு)$/i;

/** Handles one incoming message end to end and returns the reply text. */
export async function handleMessage(store: SessionStore, msg: IncomingMessage): Promise<string> {
  const userId = hashUser(msg.from);
  return withUserLock(userId, async () => {
    const t0 = Date.now();
    const s: Session = (await store.get(userId)) ?? newSession(userId);
    const isNew = s.messageCount === 0;
    s.messageCount++;
    const text = sanitize(msg.text);
    const lower = text.toLowerCase();

    const finish = async (reply: string, kind: string) => {
      s.updatedAt = Date.now();
      await store.save(s);
      metrics.record(kind, Date.now() - t0);
      return reply;
    };

    if (!allowUser(userId)) return finish(T.slowDown(s.lang), 'rate_limited');

    // Language detection: follow the student's script unless they picked a language explicitly.
    const detected = detectLang(text);
    if (detected && !s.langLocked) s.lang = detected;

    // --- Commands ---
    if (['hi', 'hello', 'start', 'vanakkam', 'வணக்கம்', 'join'].includes(lower) || lower.startsWith('join ')) {
      return finish(WELCOME[s.lang], 'command');
    }
    if (['help', 'உதவி', '?'].includes(lower)) return finish(HELP[s.lang], 'command');
    if (['tamil', 'தமிழ்'].includes(lower)) {
      s.lang = 'ta';
      s.langLocked = true;
      return finish(T.langSet('ta'), 'command');
    }
    if (['english', 'ஆங்கிலம்'].includes(lower)) {
      s.lang = 'en';
      s.langLocked = true;
      return finish(T.langSet('en'), 'command');
    }
    if (['reset', 'restart', 'புதிது'].includes(lower)) {
      const lang = s.lang;
      Object.assign(s, newSession(userId), { lang, messageCount: 1 });
      return finish(T.reset(lang), 'command');
    }
    const g = text.match(GRADE_RE) ?? text.match(GRADE_ONLY_RE);
    if (g) {
      const grade = Number(g[1]);
      if (grade >= 1 && grade <= 12) {
        s.grade = grade;
        return finish(T.gradeSet(s.lang, grade), 'command');
      }
    }

    if (msg.mediaKind === 'other' || (msg.mediaKind && !msg.media)) return finish(T.unsupported(s.lang), 'unsupported');
    if (!text && !msg.media) return finish(isNew ? WELCOME[s.lang] : HELP[s.lang], 'command');

    // --- Tutor turn ---
    if (!(await limiter.acquire())) return finish(T.busy(s.lang), 'busy');

    const clean = redactPII(text);
    const history = trimHistory(s.history, config.historyTurns, config.historyTokenBudget);
    try {
      const r = await askGemini(s, history, clean, msg.media);
      const reply = r.text || T.error(s.lang);
      const userNote = msg.mediaKind === 'image' ? `[photo] ${clean}` : msg.mediaKind === 'audio' ? `[voice note] ${clean}` : clean;
      s.history.push({ role: 'user', text: userNote.trim(), at: Date.now() }, { role: 'model', text: reply, at: Date.now() });
      s.history = s.history.slice(-20);
      metrics.tokens(r.tokensIn, r.tokensOut);
      const welcomeHint = isNew && !s.grade ? `\n\n${s.lang === 'ta' ? '(உங்கள் வகுப்பைச் சொல்லுங்கள்: *class 8*)' : '(Tell me your class: *class 8*)'}` : '';
      return finish(reply + welcomeHint, msg.mediaKind ?? 'text');
    } catch (e) {
      console.error('[tutor] LLM error', (e as Error).message);
      const status = (e as { status?: number }).status;
      return finish(status === 429 ? T.busy(s.lang) : T.error(s.lang), 'error');
    }
  });
}
