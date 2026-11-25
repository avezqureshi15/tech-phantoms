/**
 * Server-sent events, parsed incrementally. A network chunk can end mid-line or mid-event, so the
 * parser keeps what it has not finished and completes it when the next chunk arrives.
 */
export type SseEvent = { name: string; data: string };

export class SseParser {
  private buffer = "";
  private name = "message";
  private data: string[] = [];

  /** Feed the next chunk of text; returns every event it completed. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r\n|\n|\r/);
    this.buffer = lines.pop() ?? ""; // the last piece may be an unfinished line
    const events: SseEvent[] = [];
    for (const line of lines) {
      if (line === "") {
        if (this.data.length > 0) events.push({ name: this.name, data: this.data.join("\n") });
        this.name = "message";
        this.data = [];
      } else if (line.startsWith(":")) {
        continue; // a comment, used by servers as a keep-alive
      } else if (line.startsWith("event:")) {
        this.name = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        this.data.push(line.slice(5).replace(/^ /, ""));
      }
    }
    return events;
  }
}
