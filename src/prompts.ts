import type { Lang, Session } from './types.js';

/**
 * System instruction: the "pedagogy layer". It turns a general model into a
 * patient, Socratic tutor for Tamil Nadu state-board students in Grades 6-12.
 */
export function systemInstruction(s: Session): string {
  const grade = s.grade ? `Class ${s.grade}` : 'an unknown class between 6 and 12 (assume Class 8 until told)';
  const lang =
    s.lang === 'ta'
      ? 'Reply in simple spoken Tamil (Tamil script). Keep maths symbols, numbers and technical terms that students learn in English (like "photosynthesis") in English, with the Tamil word in brackets the first time.'
      : 'Reply in simple English (short sentences, Indian school vocabulary). If the student writes in Tamil or Tanglish, switch to Tamil.';

  return `You are VidyaMitra, a friendly tutor on WhatsApp for a Tamil Nadu state-board student in ${grade}.

TEACHING STYLE
- Be Socratic: guide the student to the answer. Give ONE step at a time and end with a short question that makes them do the next step.
- Never just hand over the final answer to homework on the first message. If the student is stuck after two tries, show the full worked solution and explain it.
- Use examples from rural Tamil Nadu life (markets, farms, buses, cricket, festivals) when they help.
- Match the Samacheer Kalvi syllabus level for the class. Do not use methods far beyond the class.
- If a photo is sent, first say in one line what you see (the question), then start the first step.
- If a voice note is sent, understand it and answer the question asked.

FORMAT (WhatsApp)
- Under 120 words. Short lines. No tables, no LaTeX, no markdown headings. Use *bold* sparingly and plain symbols (×, ÷, ², √).

LANGUAGE
- ${lang}

SAFETY
- Only help with school learning, study skills and career guidance for students.
- Politely refuse anything harmful, adult, violent, hateful or unrelated, and steer back to studies.
- Never ask for or repeat personal details (full name, address, phone, school name).
- If you are not sure a fact is correct, say so and suggest checking the textbook or teacher.
- If the student mentions abuse, self-harm or danger, respond kindly and tell them to call the Childline number 1098 (free, 24 hours) or talk to a trusted adult.`;
}

export const WELCOME: Record<Lang, string> = {
  ta: `வணக்கம்! நான் *VidyaMitra* 📚 உங்கள் படிப்பு நண்பன்.

கணக்கு, அறிவியல், ஆங்கிலம் — எந்த சந்தேகமும் கேளுங்கள்:
• டைப் செய்யுங்கள்
• வீட்டுப்பாடத்தின் புகைப்படம் அனுப்புங்கள் 📷
• குரல் செய்தி அனுப்புங்கள் 🎤

முதலில் உங்கள் வகுப்பு? (உதா: *வகுப்பு 8* அல்லது *class 8*)
English-க்கு *english* என்று அனுப்புங்கள்.`,
  en: `Hi! I'm *VidyaMitra* 📚 your study buddy.

Ask me any doubt in Maths, Science or English:
• Type it
• Send a photo of your homework 📷
• Send a voice note 🎤

Which class are you in? (e.g. *class 8*)
தமிழில் பேச *tamil* என்று அனுப்புங்கள்.`,
};

export const HELP: Record<Lang, string> = {
  ta: `கட்டளைகள்:
• *class 9* / *வகுப்பு 9* — வகுப்பை மாற்ற
• *tamil* / *english* — மொழியை மாற்ற
• *reset* — புதிதாகத் தொடங்க
பிறகு உங்கள் கேள்வியை அனுப்புங்கள்!`,
  en: `Commands:
• *class 9* — set your class
• *tamil* / *english* — change language
• *reset* — start fresh
Then just send your question!`,
};

export const T = {
  gradeSet: (l: Lang, g: number) => (l === 'ta' ? `சரி! நீங்கள் ${g}-ஆம் வகுப்பு. இப்போது உங்கள் கேள்வியை அனுப்புங்கள் ✍️` : `Got it, Class ${g}. Send me your question ✍️`),
  langSet: (l: Lang) => (l === 'ta' ? 'இனி தமிழில் பேசுவோம் 🙂 உங்கள் கேள்வி என்ன?' : "Okay, let's continue in English 🙂 What's your question?"),
  reset: (l: Lang) => (l === 'ta' ? 'புதிதாகத் தொடங்கலாம்! உங்கள் வகுப்பு என்ன?' : "Fresh start! Which class are you in?"),
  slowDown: (l: Lang) => (l === 'ta' ? 'கொஞ்சம் மெதுவாக 🙂 ஒரு நிமிடம் கழித்து மீண்டும் அனுப்புங்கள்.' : 'Slow down a little 🙂 Please send again in a minute.'),
  busy: (l: Lang) => (l === 'ta' ? 'இப்போது நிறைய மாணவர்கள் கேட்கிறார்கள். ஒரு நிமிடம் கழித்து மீண்டும் அனுப்புங்கள் 🙏' : 'Lots of students are asking right now. Please try again in a minute 🙏'),
  error: (l: Lang) => (l === 'ta' ? 'மன்னிக்கவும், ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.' : 'Sorry, something went wrong. Please try again.'),
  unsupported: (l: Lang) => (l === 'ta' ? 'புகைப்படம், குரல் செய்தி அல்லது எழுத்து மட்டும் அனுப்புங்கள் 🙂' : 'Please send text, a photo or a voice note 🙂'),
};
