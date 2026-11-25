import { act, renderHook } from "@testing-library/react-native";
import { AudioModule, setAudioModeAsync } from "expo-audio";

import { useVoiceInput } from "@/features/useVoiceInput";
import { ApiError, upload } from "@/lib/api";

const mockRecorder = {
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
  uri: "file:///tmp/clip.m4a",
};
jest.mock("expo-audio", () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: () => mockRecorder,
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  upload: jest.fn(),
}));

const permission = jest.mocked(AudioModule.requestRecordingPermissionsAsync);
const mockUpload = jest.mocked(upload);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  permission.mockResolvedValue({ granted: true } as never);
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined as never);
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecorder.stop.mockResolvedValue(undefined);
  mockRecorder.uri = "file:///tmp/clip.m4a";
});
afterEach(() => jest.useRealTimers());

async function recording(onText = jest.fn()) {
  const hook = await renderHook(() => useVoiceInput("h1", onText));
  await act(async () => hook.result.current.start());
  return { hook, onText };
}

describe("useVoiceInput", () => {
  it("records, then sends the clip for transcription and hands back the words", async () => {
    mockUpload.mockResolvedValue({ text: "ದೀಪಾವಳಿಗೆ ಏನು ಮಾಡಬೇಕು", language: "kn-IN" });
    const { hook, onText } = await recording();
    expect(hook.result.current.state).toBe("recording");

    await act(async () => hook.result.current.stop());

    expect(mockUpload).toHaveBeenCalledWith(
      "/households/h1/ai/transcribe",
      { uri: "file:///tmp/clip.m4a", name: "voice.m4a", type: "audio/mp4" },
      expect.anything(),
    );
    expect(onText).toHaveBeenCalledWith("ದೀಪಾವಳಿಗೆ ಏನು ಮಾಡಬೇಕು");
    expect(hook.result.current.state).toBe("idle");
  });

  it("never sends or asks for a language: detection is the server's job", async () => {
    mockUpload.mockResolvedValue({ text: "hi", language: "en-IN" });
    const { hook } = await recording();

    await act(async () => hook.result.current.stop());

    const [, file] = mockUpload.mock.calls[0]!;
    expect(Object.keys(file as object).sort()).toEqual(["name", "type", "uri"]);
  });

  it("does not record without permission and says how to fix it", async () => {
    permission.mockResolvedValue({ granted: false } as never);
    const hook = await renderHook(() => useVoiceInput("h1", jest.fn()));

    await act(async () => hook.result.current.start());

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe("idle");
    expect(hook.result.current.error).toMatch(/Settings/);
  });

  it("stops by itself at 30 seconds so a clip is never too long for the service", async () => {
    mockUpload.mockResolvedValue({ text: "a long story", language: "hi-IN" });
    const { hook, onText } = await recording();

    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    expect(hook.result.current.state).toBe("recording");
    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });

    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith("a long story");
  });

  it("shows the server's own message when it could not understand the clip", async () => {
    mockUpload.mockRejectedValue(new ApiError("I didn't catch that. Please try again.", 422));
    const { hook, onText } = await recording();

    await act(async () => hook.result.current.stop());

    expect(hook.result.current.error).toBe("I didn't catch that. Please try again.");
    expect(onText).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe("idle");
  });

  it("explains any other failure in plain words and always lets go of the microphone", async () => {
    mockUpload.mockRejectedValue(new Error("network exploded"));
    const { hook } = await recording();

    await act(async () => hook.result.current.stop());

    expect(hook.result.current.error).toMatch(/type instead/);
    expect(jest.mocked(setAudioModeAsync)).toHaveBeenLastCalledWith({ allowsRecording: false });
  });

  it("reports a microphone that cannot start", async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValue(new Error("busy"));
    const hook = await renderHook(() => useVoiceInput("h1", jest.fn()));

    await act(async () => hook.result.current.start());

    expect(hook.result.current.state).toBe("idle");
    expect(hook.result.current.error).toMatch(/microphone isn't available/);
  });
});
