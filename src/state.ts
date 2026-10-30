import { MongoClient, type Collection } from 'mongodb';
import { config } from './config.js';
import type { Session } from './types.js';

export interface SessionStore {
  get(userId: string): Promise<Session | undefined>;
  save(s: Session): Promise<void>;
  delete(userId: string): Promise<void>;
  count(): Promise<number>;
}

export function newSession(userId: string): Session {
  const now = Date.now();
  return { userId, lang: 'ta', langLocked: false, history: [], createdAt: now, updatedAt: now, messageCount: 0 };
}

/** Default store: in-process memory with a 7-day idle expiry. Good for the pilot and for tests. */
class MemoryStore implements SessionStore {
  private map = new Map<string, Session>();
  private ttlMs = 7 * 24 * 3600 * 1000;
  async get(id: string) {
    const s = this.map.get(id);
    if (s && Date.now() - s.updatedAt > this.ttlMs) {
      this.map.delete(id);
      return undefined;
    }
    return s ? structuredClone(s) : undefined;
  }
  async save(s: Session) {
    this.map.set(s.userId, structuredClone(s));
  }
  async delete(id: string) {
    this.map.delete(id);
  }
  async count() {
    return this.map.size;
  }
}

/** Production store: MongoDB (Atlas free tier works). Sessions expire after 30 idle days via a TTL index. */
class MongoStore implements SessionStore {
  private col!: Collection<Session>;
  constructor(private uri: string) {}
  async init() {
    const client = new MongoClient(this.uri);
    await client.connect();
    this.col = client.db('vidyamitra').collection<Session>('sessions');
    await this.col.createIndex({ userId: 1 }, { unique: true });
    await this.col.createIndex({ updatedAtDate: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
  }
  async get(id: string) {
    const doc = await this.col.findOne({ userId: id }, { projection: { _id: 0 } });
    return (doc as Session | null) ?? undefined;
  }
  async save(s: Session) {
    await this.col.updateOne({ userId: s.userId }, { $set: { ...s, updatedAtDate: new Date(s.updatedAt) } }, { upsert: true });
  }
  async delete(id: string) {
    await this.col.deleteOne({ userId: id });
  }
  async count() {
    return this.col.estimatedDocumentCount();
  }
}

export async function createStore(): Promise<SessionStore> {
  if (config.mongoUri) {
    const m = new MongoStore(config.mongoUri);
    await m.init();
    console.log('[state] using MongoDB');
    return m;
  }
  console.log('[state] using in-memory store');
  return new MemoryStore();
}

/** Per-user lock so two messages from the same student never interleave and corrupt their history. */
const chains = new Map<string, Promise<unknown>>();
export function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  chains.set(userId, tail);
  tail.then(() => {
    if (chains.get(userId) === tail) chains.delete(userId);
  });
  return next;
}
