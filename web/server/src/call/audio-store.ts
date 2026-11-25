import { randomUUID } from "node:crypto";

interface StoredAudio {
  data: Buffer;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const audio = new Map<string, StoredAudio>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, stored] of audio) {
    if (stored.expiresAt <= now) audio.delete(id);
  }
}, 60_000);
cleanupTimer.unref();

export function storeAudio(data: Buffer): string {
  const id = randomUUID();
  audio.set(id, { data, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getAudio(id: string): Buffer | null {
  const stored = audio.get(id);
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    audio.delete(id);
    return null;
  }
  return stored.data;
}

export function removeCallAudio(ids: readonly string[]): void {
  for (const id of ids) audio.delete(id);
}
