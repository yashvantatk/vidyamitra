export type Lang = 'ta' | 'en';

export interface Turn {
  role: 'user' | 'model';
  text: string;
  at: number;
}

export interface Session {
  userId: string; // sha256 of the WhatsApp number, never the raw number
  grade?: number;
  lang: Lang;
  langLocked: boolean; // true once the student picks a language explicitly
  history: Turn[];
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Media {
  mimeType: string;
  base64: string;
}

export interface IncomingMessage {
  from: string;
  text: string;
  media?: Media;
  mediaKind?: 'image' | 'audio' | 'other';
}
