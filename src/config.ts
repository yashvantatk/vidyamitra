const bool = (v: string | undefined, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(v.toLowerCase()));
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    rpm: num(process.env.GEMINI_RPM, 10),
    maxOutputTokens: num(process.env.GEMINI_MAX_OUTPUT_TOKENS, 400),
    timeoutMs: num(process.env.GEMINI_TIMEOUT_MS, 12000),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    validateSignature: bool(process.env.VALIDATE_TWILIO_SIGNATURE, false),
    publicUrl: process.env.PUBLIC_URL ?? '',
  },
  mongoUri: process.env.MONGODB_URI ?? '',
  mockLlm: bool(process.env.MOCK_LLM, false),
  // Conversation memory: how many past turns go back to the model, and a rough token cap for them.
  historyTurns: num(process.env.HISTORY_TURNS, 6),
  historyTokenBudget: num(process.env.HISTORY_TOKEN_BUDGET, 350),
  maxInputChars: 1000,
  perUserPerMinute: num(process.env.PER_USER_PER_MINUTE, 8),
};

export type Config = typeof config;
