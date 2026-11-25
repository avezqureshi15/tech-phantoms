import { ApiError } from "@/lib/api";

const MAX_ATTEMPTS = 2;
const MAX_WAIT_MS = 10_000;

/**
 * Whether a failed *read* should be tried again. Network failures, server errors and
 * "slow down" answers (429, 503) are worth retrying; other client errors never get better.
 * Mutations are never retried: a repeated write is not safe to assume idempotent.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (failures >= MAX_ATTEMPTS) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.status === 429) return true;
  return !(error.status >= 400 && error.status < 500);
}

/** Wait as long as the server asked; otherwise back off exponentially. Never longer than 10s. */
export function retryDelay(failures: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfter !== undefined) {
    return Math.min(error.retryAfter * 1000, MAX_WAIT_MS);
  }
  return Math.min(1000 * 2 ** failures, MAX_WAIT_MS);
}
