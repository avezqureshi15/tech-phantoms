import {
  captionSize,
  forSpeech,
  guidance,
  MAX_LISTEN_MS,
  meterLevel,
  musicLink,
  NO_SPEECH_MS,
  replyText,
  SILENCE_MS,
  SPEECH_DB,
  vadStart,
  vadStep,
} from "@/lib/voice-session";
import type { Item } from "@/lib/utsav/schemas";

const LOUD = SPEECH_DB + 10;
const QUIET = SPEECH_DB - 20;

describe("knowing when someone has finished speaking", () => {
  it("keeps listening while they speak, and finishes after a pause that follows speech", () => {
    let vad = vadStart(0);
    let step = vadStep(vad, LOUD, 500);
    expect(step.action).toBe("continue");
    vad = step.vad;

    step = vadStep(vad, QUIET, 500 + SILENCE_MS - 100);
    expect(step.action).toBe("continue"); // a pause between words is not the end
    step = vadStep(step.vad, QUIET, 500 + SILENCE_MS);
    expect(step.action).toBe("finish");
  });

  it("does not cut off an elder who pauses to remember the next word, as long as they resume", () => {
    let vad = vadStart(0);
    for (const [level, at] of [
      [LOUD, 300],
      [QUIET, 1500],
      [LOUD, 2000],
      [QUIET, 3500],
      [LOUD, 4000],
    ] as const) {
      const step = vadStep(vad, level, at);
      expect(step.action).toBe("continue");
      vad = step.vad;
    }
  });

  it("never finishes on silence alone, and gives up if nobody speaks", () => {
    let step = vadStep(vadStart(0), QUIET, SILENCE_MS + 500);
    expect(step.action).toBe("continue"); // silence before any speech just means they have not started
    step = vadStep(step.vad, QUIET, NO_SPEECH_MS);
    expect(step.action).toBe("giveup");
  });

  it("stops by itself before the transcription service's 30 second limit", () => {
    let vad = vadStart(0);
    vad = vadStep(vad, LOUD, 1000).vad;

    expect(vadStep(vad, LOUD, MAX_LISTEN_MS).action).toBe("finish");
    expect(vadStep(vadStart(0), QUIET, MAX_LISTEN_MS).action).toBe("giveup");
    expect(MAX_LISTEN_MS).toBeLessThan(30_000);
  });

  it("treats a missing level reading as quiet rather than crashing", () => {
    expect(vadStep(vadStart(0), undefined, 100).action).toBe("continue");
  });
});

describe("what is said aloud", () => {
  it("removes Markdown, links and emoji so a voice never reads them out", () => {
    expect(
      forSpeech("## Hanuman Chalisa 🙏\n\n- **Doha:** श्रीगुरु *चरन*\n- See [this page](https://x.in/a) or https://y.in"),
    ).toBe("Hanuman Chalisa Doha: श्रीगुरु चरन See this page or");
  });

  it("joins everything Utsav said in a turn and skips cards", () => {
    const items: Item[] = [
      { type: "text", text: "Namaste **ji**." },
      {
        type: "card",
        card: { kind: "calendar_event", id: "c", title: "t", start_date: "2026-12-24", end_date: "2026-12-24" },
      },
      { type: "text", text: "Shall we begin?" },
    ];

    expect(replyText(items)).toBe("Namaste ji. Shall we begin?");
  });
});

describe("music", () => {
  const links = (urls: [string, string][]): Item[] => [
    {
      type: "card",
      card: { kind: "links", id: "l", title: "Play", links: urls.map(([label, url]) => ({ label, url })) },
    },
  ];

  it("prefers YouTube, which needs no account", () => {
    const items = links([
      ["Play on Spotify", "https://open.spotify.com/search/x"],
      ["Play on YouTube", "https://www.youtube.com/results?search_query=x"],
    ]);

    expect(musicLink(items)).toBe("https://www.youtube.com/results?search_query=x");
  });

  it("falls back to the first playable link, ignores event listings, and refuses unsafe addresses", () => {
    expect(musicLink(links([["Play on Spotify", "https://open.spotify.com/search/x"]]))).toBe(
      "https://open.spotify.com/search/x",
    );
    expect(musicLink(links([["More on District", "https://google.com/search?q=x"]]))).toBeNull();
    expect(musicLink(links([["Play on YouTube", "javascript:alert(1)"]]))).toBeNull();
    expect(musicLink([{ type: "text", text: "hi" }])).toBeNull();
  });
});

describe("drawing the voice", () => {
  it("shows nothing for a quiet room and full strength for loud speech", () => {
    expect(meterLevel(-60)).toBe(0);
    expect(meterLevel(-10)).toBe(1);
    expect(meterLevel(0)).toBe(1);
  });

  it("grows steadily between quiet and loud", () => {
    expect(meterLevel(-40)).toBeGreaterThan(meterLevel(-50));
    expect(meterLevel(-25)).toBeGreaterThan(meterLevel(-40));
  });

  it("copes with a missing or broken reading", () => {
    expect(meterLevel(undefined)).toBe(0);
    expect(meterLevel(Number.NaN)).toBe(0);
  });
});

describe("telling the person what to do", () => {
  it("gives a headline for every phase and marks the current step", () => {
    expect(guidance("speaking", "Tap to start").step).toBe(0);
    expect(guidance("listening", "Tap to start").step).toBe(1);
    expect(guidance("thinking", "Tap to start").step).toBe(2);
    expect(guidance("idle", "Tap to start talking").title).toBe("Tap to start talking");
    for (const phase of ["idle", "paused", "ended", "error"] as const) {
      expect(guidance(phase, "x").step).toBeNull();
    }
  });

  it("never asks the person to press anything to get a turn: it starts and stops by itself", () => {
    expect(guidance("listening", "x").hint).toMatch(/pause/i);
    expect(guidance("listening", "x").hint).not.toMatch(/tap|press/i);
  });

  it("shrinks long replies and never goes below a readable size", () => {
    expect(captionSize("Namaste").fontSize).toBe(32);
    expect(captionSize("a".repeat(150)).fontSize).toBe(27);
    expect(captionSize("a".repeat(400)).fontSize).toBe(23);
    expect(captionSize("a".repeat(6000)).fontSize).toBe(20);
    expect(captionSize("a".repeat(6000)).lineHeight).toBeGreaterThan(captionSize("a".repeat(6000)).fontSize);
  });
});
