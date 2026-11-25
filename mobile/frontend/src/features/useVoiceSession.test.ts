import { act, renderHook } from "@testing-library/react-native";
import { AudioModule, setAudioModeAsync } from "expo-audio";
import { Linking } from "react-native";

import { GREETING, useVoiceSession } from "@/features/useVoiceSession";
import { ApiError, download, upload } from "@/lib/api";
import { streamTurn } from "@/lib/utsav/client";
import { MAX_SESSION_MS } from "@/lib/voice-guard";
import { SILENCE_MS, SPEECH_DB } from "@/lib/voice-session";

const mockRecorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: "file:///c/clip.m4a" };
const mockMeter = { metering: -60 as number | undefined, durationMillis: 0 };
let mockFinishPlaying: (() => void) | null = null;

jest.mock("expo-audio", () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ ...mockMeter }),
  createAudioPlayer: () => {
    let listener: (s: { didJustFinish: boolean }) => void = () => undefined;
    mockFinishPlaying = () => listener({ didJustFinish: true });
    return {
      addListener: (_: string, cb: typeof listener) => {
        listener = cb;
        return { remove: jest.fn() };
      },
      play: jest.fn(),
      remove: jest.fn(),
    };
  },
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: class {
    uri: string;
    constructor(_dir: string, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    write() {}
    delete() {}
  },
}));
jest.mock("@/lib/voice-guard", () => ({ ...jest.requireActual("@/lib/voice-guard"), ECHO_TAIL_MS: 0 })); // no real waiting in tests
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), download: jest.fn(), upload: jest.fn() }));
jest.mock("@/lib/utsav/client", () => ({ streamTurn: jest.fn() }));

const permission = jest.mocked(AudioModule.requestRecordingPermissionsAsync);
const mockDownload = jest.mocked(download);
const mockUpload = jest.mocked(upload);
const mockStream = jest.mocked(streamTurn);

type Reply = { text?: string; link?: string };
const answer = (conversationId: string, { text = "Namaste ji.", link }: Reply = {}) =>
  mockStream.mockImplementationOnce(async (_path, _body, onEvent) => {
    onEvent({ name: "start", data: { conversation_id: conversationId } });
    const items = [
      { type: "text" as const, text },
      ...(link
        ? [
            {
              type: "card" as const,
              card: {
                kind: "links" as const,
                id: "l",
                title: "Play",
                links: [{ label: "Play on YouTube", url: link }],
              },
            },
          ]
        : []),
    ];
    onEvent({ name: "done", data: { conversation_id: conversationId, agent: "elder", items, pending_card: null } });
  });

/** Lets playback "finish" the moment it starts, as a real clip would after its length. */
const playThrough = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => mockFinishPlaying?.());
};

async function started(mode: "elder" | "recite" = "elder", options: { autoStart?: boolean } = {}) {
  const hook = await renderHook(() => useVoiceSession("h1", mode, options));
  if (!options.autoStart) {
    await act(async () => {
      void hook.result.current.tap();
    });
  }
  return hook;
}

/** The phone greets and then listens: the state every real conversation starts from. */
async function listening(mode: "elder" | "recite" = "elder") {
  const hook = await started(mode);
  await playThrough();
  return hook;
}

/** The person speaks and the turn ends (a tap), so their words are sent and Utsav replies. */
async function say(hook: Awaited<ReturnType<typeof started>>, words: string, language = "en-IN") {
  mockUpload.mockResolvedValueOnce({ text: words, language });
  await act(async () => {
    void hook.result.current.tap();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockReset(); // an answer set in one test must not leak into the next
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  jest.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  permission.mockResolvedValue({ granted: true } as never);
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined as never);
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecorder.stop.mockResolvedValue(undefined);
  mockDownload.mockResolvedValue(new ArrayBuffer(8));
  mockMeter.metering = -60;
});
afterEach(() => jest.useRealTimers());

describe("a voice session", () => {
  it("greets aloud by itself, without asking the model, then listens", async () => {
    const hook = await started("elder");

    expect(mockStream).not.toHaveBeenCalled(); // no model call, so the first words set the language
    expect(mockDownload).toHaveBeenCalledWith("/households/h1/ai/speak", { text: GREETING.elder, pace: 1 });
    expect(hook.result.current.phase).toBe("speaking");
    expect(hook.result.current.reply).toBe(GREETING.elder);

    await playThrough();

    expect(mockRecorder.record).toHaveBeenCalled();
    expect(hook.result.current.phase).toBe("listening");
  });

  it("starts by itself when asked to, once, with nothing to tap", async () => {
    const hook = await started("elder", { autoStart: true });
    await act(async () => Promise.resolve());

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(hook.result.current.phase).toBe("speaking");

    await hook.rerender({});
    expect(mockDownload).toHaveBeenCalledTimes(1); // not again on a re-render
  });

  it("does not start by itself when not asked to", async () => {
    await renderHook(() => useVoiceSession("h1", "elder"));
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("waits for a group before starting by itself", async () => {
    await renderHook(() => useVoiceSession(undefined, "elder", { autoStart: true }));
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("asks which prayer in recite mode", async () => {
    await started("recite");

    expect(mockDownload).toHaveBeenCalledWith(
      "/households/h1/ai/speak",
      expect.objectContaining({ text: GREETING.recite }),
    );
  });

  it("speaks the greeting slowly when asked to", async () => {
    const hook = await renderHook(() => useVoiceSession("h1", "elder"));
    await act(async () => hook.result.current.setSlow(true));

    await act(async () => {
      void hook.result.current.tap();
    });

    expect(mockDownload).toHaveBeenCalledWith("/households/h1/ai/speak", expect.objectContaining({ pace: 0.8 }));
  });

  it("sends what the person said with the language it was heard in, and the mode on the first turn", async () => {
    answer("c1", { text: "ಸರಿ, ಹೇಳಿ." });
    const hook = await listening("elder");

    await say(hook, "ನಾಳೆ ಗಣೇಶ ಹಬ್ಬಕ್ಕೆ ಏನು ಮಾಡಬೇಕು", "kn-IN");

    expect(mockStream).toHaveBeenCalledWith(
      "/households/h1/ai/conversations/stream",
      { message: "ನಾಳೆ ಗಣೇಶ ಹಬ್ಬಕ್ಕೆ ಏನು ಮಾಡಬೇಕು", mode: "elder", language: "kn-IN" },
      expect.any(Function),
      expect.anything(),
    );
    expect(hook.result.current.said).toBe("ನಾಳೆ ಗಣೇಶ ಹಬ್ಬಕ್ಕೆ ಏನು ಮಾಡಬೇಕು");
  });

  it("keeps sending the language on later turns of the same conversation", async () => {
    answer("c1");
    answer("c1", { text: "बहुत अच्छे जी।" });
    const hook = await listening("elder");
    await say(hook, "हनुमान चालीसा सुनाइए", "hi-IN");
    await playThrough();

    await say(hook, "आगे बताइए", "hi-IN");

    expect(mockStream.mock.calls[1]![0]).toBe("/ai/conversations/c1/messages/stream");
    expect(mockStream.mock.calls[1]![1]).toEqual({ message: "आगे बताइए", language: "hi-IN" });
  });

  it("takes turns by itself: it hears the person finish, transcribes, replies and listens again", async () => {
    answer("c1", { text: "बहुत अच्छे जी।" });
    mockUpload.mockResolvedValue({ text: "श्रीगुरु चरन सरोज रज", language: "hi-IN" });
    const hook = await listening("elder");
    expect(hook.result.current.phase).toBe("listening");

    // They speak (loud), then stop (quiet for longer than a pause).
    mockMeter.metering = SPEECH_DB + 12;
    await act(async () => {
      jest.advanceTimersByTime(600);
      await hook.rerender({});
    });
    mockMeter.metering = -60;
    await act(async () => {
      jest.advanceTimersByTime(SILENCE_MS + 200);
      mockMeter.durationMillis += 2500;
      await hook.rerender({});
    });
    await act(async () => Promise.resolve());

    expect(mockUpload).toHaveBeenCalledWith(
      "/households/h1/ai/transcribe",
      expect.objectContaining({ name: "voice.m4a" }),
      expect.anything(),
    );
    expect(mockStream.mock.calls[0]![1]).toMatchObject({ message: "श्रीगुरु चरन सरोज रज" });
    expect(hook.result.current.said).toBe("श्रीगुरु चरन सरोज रज");
  });

  it("stays in the session when the voice was not understood: it says so and listens again", async () => {
    mockUpload.mockRejectedValueOnce(new ApiError("I didn't catch that. Please try again.", 422));
    const hook = await listening();

    await act(async () => {
      await hook.result.current.tap(); // tap while listening ends their turn now
    });

    expect(hook.result.current.error).toBe("I didn't catch that. Please try again.");
    expect(hook.result.current.phase).toBe("listening");
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
  });

  it("does not answer its own voice: an echo of what Utsav just said is ignored and it listens again", async () => {
    mockUpload.mockResolvedValueOnce({ text: "Namaste ji. Tell me how can I help you today", language: "en-IN" });
    const hook = await listening();

    await act(async () => {
      await hook.result.current.tap();
    });

    expect(mockStream).not.toHaveBeenCalled(); // no paid model call for an echo
    expect(hook.result.current.phase).toBe("listening");
    expect(hook.result.current.error).toMatch(/did not catch/i);
  });

  it("stops asking after three empty turns in a row and waits to be tapped, instead of looping", async () => {
    mockUpload.mockResolvedValue({ text: "...", language: "en-IN" });
    const hook = await listening();

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await hook.result.current.tap();
      });
    }

    expect(hook.result.current.phase).toBe("paused");
    expect(hook.result.current.error).toMatch(/I will wait/);
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalledTimes(3); // listened three times, not for ever
  });

  it("a real answer resets the count of empty turns", async () => {
    answer("c1", { text: "Ji." });
    mockUpload
      .mockResolvedValueOnce({ text: "", language: "en-IN" })
      .mockResolvedValueOnce({ text: "", language: "en-IN" })
      .mockResolvedValueOnce({ text: "Please play a bhajan", language: "en-IN" })
      .mockResolvedValue({ text: "", language: "en-IN" });
    const hook = await listening();

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await hook.result.current.tap(); // two empty turns
      });
    }
    await act(async () => {
      void hook.result.current.tap(); // a real answer: Utsav replies aloud
    });
    await playThrough();
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await hook.result.current.tap(); // two more empty turns: still under the limit of three
      });
    }

    expect(hook.result.current.phase).toBe("listening");
    expect(hook.result.current.error).not.toMatch(/I will wait/);
  });

  it("ends a sitting that has run too long, kindly, without listening again", async () => {
    answer("c1", { text: "Ji." });
    const hook = await listening();
    await say(hook, "tell me about Diwali"); // the first real turn starts the clock
    await playThrough();
    expect(hook.result.current.phase).toBe("listening");

    jest.setSystemTime(Date.now() + MAX_SESSION_MS + 1000);
    await say(hook, ""); // nothing heard: the next thing it would do is listen again

    expect(hook.result.current.phase).toBe("ended");
    expect(hook.result.current.error).toMatch(/rest here/);
  });

  it("carries on listening when the spoken reply could not be made", async () => {
    mockDownload.mockRejectedValue(new ApiError("not available", 503));

    const hook = await started();
    await act(async () => Promise.resolve());

    expect(hook.result.current.reply).toBe(GREETING.elder); // the words are still on screen
    expect(hook.result.current.phase).toBe("listening");
    expect(hook.result.current.error).toMatch(/voice is slow/i); // and says why there is no sound
  });

  it("opens the music for a bhajan request, then waits for the person to come back", async () => {
    answer("c1", { text: "Playing it now, ji.", link: "https://www.youtube.com/results?search_query=hanuman" });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const hook = await listening();

    await say(hook, "play a hanuman bhajan");

    expect(open).toHaveBeenCalledWith("https://www.youtube.com/results?search_query=hanuman");
    expect(hook.result.current.phase).toBe("paused");
    open.mockRestore();
  });

  it("explains a refused microphone instead of failing silently", async () => {
    permission.mockResolvedValue({ granted: false } as never);
    const hook = await listening();

    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.error).toMatch(/Settings/);
  });

  it("shows the problem and offers a retry when Utsav cannot be reached", async () => {
    mockStream.mockRejectedValueOnce(new ApiError("Can't reach FestiveOS. Check your connection and try again.", 0));
    const hook = await listening();

    await say(hook, "hello there");

    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.error).toMatch(/Can't reach/);
  });

  it("ends cleanly: stops recording and playing and says goodbye", async () => {
    const hook = await listening();

    await act(async () => hook.result.current.end());

    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(hook.result.current.phase).toBe("ended");
  });
});
