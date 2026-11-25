import { describe, expect, it } from "vitest";
import { raceDeadline } from "../deadline";

describe("raceDeadline", () => {
  it("returns an operation that completes within budget", async () => {
    await expect(raceDeadline(Promise.resolve("ready"), Date.now() + 100)).resolves.toEqual({
      timedOut: false,
      value: "ready",
    });
  });

  it("returns the holding path when the operation exceeds its deadline", async () => {
    const started = Date.now();
    const result = await raceDeadline(new Promise(() => undefined), started + 10);
    expect(result).toEqual({ timedOut: true });
    expect(Date.now() - started).toBeLessThan(100);
  });
});
