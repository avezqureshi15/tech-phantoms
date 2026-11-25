import { ApiError, openStream } from "@/lib/api";
import { SseParser } from "@/lib/utsav/sse";
import { streamEventSchema, type StreamEvent } from "@/lib/utsav/schemas";

/**
 * Streams one turn. Calls `onEvent` for each event as it arrives and resolves when the turn ends.
 * A stream that closes without a `done` or `error` is a dropped connection and is reported as one,
 * never mistaken for a finished answer.
 */
export async function streamTurn(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = await openStream(path, body, signal);
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let finished = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const raw of parser.push(decoder.decode(value, { stream: true }))) {
        let payload: unknown;
        try {
          payload = JSON.parse(raw.data);
        } catch {
          continue; // not ours to understand
        }
        const parsed = streamEventSchema.safeParse({ name: raw.name, data: payload });
        if (!parsed.success) continue; // an event from a newer server: ignore, don't crash
        onEvent(parsed.data);
        if (parsed.data.name === "done" || parsed.data.name === "error") finished = true;
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (!finished && !signal.aborted) {
    throw new ApiError("The connection dropped before Utsav finished. Please try again.", 0);
  }
}
