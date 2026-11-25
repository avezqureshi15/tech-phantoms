import {
  captionSize,
  circleIsTappable,
  forSpeech,
  guidance,
  MAX_LISTEN_MS,
  meterLevel,
  musicLink,
  NO_SPEECH_MS,
  replyText,
  SILENCE_MS,
  SPEECH_DB,
  RECITE_BONUS_MS,
  SHORT_BONUS_MS,
  THRESHOLD_MAX_DB,
  THRESHOLD_MIN_DB,
  thresholdFor,
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

    // A very short answer waits a little longer: they may still be thinking.
    step = vadStep(vad, QUIET, 500 + SILENCE_MS + SHORT_BONUS_MS - 100);
    expect(step.action).toBe("continue"); // a pause between words is not the end
    step = vadStep(step.vad, QUIET, 500 + SILENCE_MS + SHORT_BONUS_MS);
    expect(step.action).toBe("finish");
  });

  it("finishes sooner after a longer answer, which is clearly complete", () => {
    let vad = vadStart(0);
    vad = vadStep(vad, LOUD, 600).vad;
    vad = vadStep(vad, LOUD, 2600).vad; // two seconds of speech
    expect(vadStep(vad, QUIET, 2600 + SILENCE_MS - 100).action).toBe("continue");
    expect(vadStep(vad, QUIET, 2600 + SILENCE_MS).action).toBe("finish");
  });

  it("waits longer in a prayer, where people breathe between lines", () => {
    let vad = vadStart(0);
    vad = vadStep(vad, LOUD, 600).vad;
    vad = vadStep(vad, LOUD, 2600).vad;
    expect(vadStep(vad, QUIET, 2600 + SILENCE_MS, RECITE_BONUS_MS).action).toBe("continue");
    expect(vadStep(vad, QUIET, 2600 + SILENCE_MS + RECITE_BONUS_MS, RECITE_BONUS_MS).action).toBe("finish");
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

describe("coping with a noisy room", () => {
  const NOISY = -30; // a kitchen or a street: far louder than a bedroom

  const listenFor = (levels: number[], from = 0, every = 100) => {
    let vad = vadStart(from);
    let at = from;
    let last = { vad, action: "continue" as string };
    for (const level of levels) {
      at += every;
      last = vadStep(vad, level, at);
      vad = last.vad;
    }
    return { ...last, at };
  };

  it("learns the room's level, so constant noise is not mistaken for someone speaking", () => {
    const room = Array(8).fill(NOISY); // 800 ms of steady noise
    const { vad } = listenFor(room);

    expect(vad.calibrated).toBe(true);
    expect(vad.threshold).toBeGreaterThan(NOISY); // speech has to rise above the noise
    expect(vad.heardSpeech).toBe(false);
  });

  it("still hears a voice that rises above that noise", () => {
    const { vad } = listenFor([...Array(6).fill(NOISY), -12, -10, -12]);
    expect(vad.heardSpeech).toBe(true);
  });

  it("does not let a loud room stop a turn from ever ending", () => {
    // They speak (loud), then stop, but the room keeps humming at -35. With a fixed threshold of -38 that
    // hum counts as speech for ever; learning the room, it counts as quiet.
    const hum = -35;
    const room = Array(6).fill(hum);
    const speech = [-12, -10, -11, -12, -10];
    const after = Array(40).fill(hum); // four seconds of just the hum
    const { action } = listenFor([...room, ...speech, ...after]);
    expect(action).toBe("finish");
  });

  it("keeps the usual threshold in a quiet room, and never goes absurdly low or high", () => {
    expect(thresholdFor([])).toBe(SPEECH_DB);
    expect(thresholdFor(Array(8).fill(-70))).toBeGreaterThanOrEqual(THRESHOLD_MIN_DB);
    expect(thresholdFor(Array(8).fill(-5))).toBeLessThanOrEqual(THRESHOLD_MAX_DB);
  });

  it("measures the room by its quiet moments, so a voice at the start does not raise the bar", () => {
    const threshold = thresholdFor([-10, -11, -50, -52, -51, -50, -52, -51]);
    expect(threshold).toBeLessThan(-35); // speech in the first moments did not make the room 'loud'
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
    for (const phase of ["speaking", "listening", "thinking"] as const) {
      expect(guidance(phase, "x").hint).not.toMatch(/tap|press/i);
    }
  });

  it("only lets the circle be tapped to start again after a pause or a problem", () => {
    expect(circleIsTappable("speaking")).toBe(false);
    expect(circleIsTappable("listening")).toBe(false);
    expect(circleIsTappable("thinking")).toBe(false);
    expect(circleIsTappable("ended")).toBe(false);
    for (const phase of ["idle", "paused", "error"] as const) expect(circleIsTappable(phase)).toBe(true);
  });

  it("shrinks long replies and never goes below a readable size", () => {
    expect(captionSize("Namaste").fontSize).toBe(32);
    expect(captionSize("a".repeat(150)).fontSize).toBe(27);
    expect(captionSize("a".repeat(400)).fontSize).toBe(23);
    expect(captionSize("a".repeat(6000)).fontSize).toBe(20);
    expect(captionSize("a".repeat(6000)).lineHeight).toBeGreaterThan(captionSize("a".repeat(6000)).fontSize);
  });
});
