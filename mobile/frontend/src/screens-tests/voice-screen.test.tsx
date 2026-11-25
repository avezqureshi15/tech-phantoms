import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import VoiceScreen from "@/app/(app)/voice";
import { MIC_PERMISSION_MESSAGE } from "@/features/useVoiceSession";

const mockSession = {
  phase: "idle" as string,
  said: "",
  reply: "",
  error: null as string | null,
  slow: false,
  hasAudio: false,
  tap: jest.fn(),
  again: jest.fn(),
  end: jest.fn(),
  setSlow: jest.fn(),
};
const mockBack = jest.fn();
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const show = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <VoiceScreen />
    </SafeAreaProvider>,
  );
let mockMode: string | undefined = "elder";

jest.mock("@/features/useVoiceSession", () => ({
  useVoiceSession: () => mockSession,
  MIC_PERMISSION_MESSAGE: "Allow the microphone in Settings so Utsav can hear you.",
}));
let mockOff: string[] = [];
jest.mock("@/features/queries", () => ({
  useActiveHousehold: () => ({ household: { id: "h1" } }),
  useFeatures: () => ({ on: (name: string) => !mockOff.includes(name), announcement: null }),
}));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ mode: mockMode }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSession, { phase: "idle", said: "", reply: "", error: null, slow: false, hasAudio: false });
  mockMode = "elder";
  mockOff = [];
});

describe("the voice screen when a feature is switched off", () => {
  it.each([
    ["utsav", "elder"],
    ["utsav_voice", "elder"],
    ["elder_mode", "elder"],
    ["recite_mode", "recite"],
  ])("shows a calm notice instead of starting when %s is off (%s mode)", async (flag, mode) => {
    mockOff = [flag];
    mockMode = mode;

    await show();

    expect(screen.getByText("Voice is resting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tap to start talking" })).toBeNull();
    expect(mockSession.tap).not.toHaveBeenCalled();
  });

  it("still works for the other mode when only one mode is switched off", async () => {
    mockOff = ["recite_mode"];
    mockMode = "elder";

    await show();

    expect(screen.getByText("Tap to start talking")).toBeTruthy();
  });
});

describe("the voice screen", () => {
  it("invites the person to start, in the words of the mode", async () => {
    await show();
    expect(screen.getByText("Talking with Utsav")).toBeTruthy();
    expect(screen.getByText("Tap to start talking")).toBeTruthy();

    mockMode = "recite";
    await show();
    expect(screen.getByText("Practise a prayer")).toBeTruthy();
    expect(screen.getByText("Tap to begin")).toBeTruthy();
  });

  it("starts or continues with one tap on the big button", async () => {
    await show();

    await fireEvent.press(screen.getByRole("button", { name: "Tap to start talking" }));

    expect(mockSession.tap).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["speaking", "Utsav is speaking"],
    ["listening", "Your turn. Speak now"],
    ["thinking", "One moment…"],
    ["paused", "Tap when you are ready"],
    ["error", "Tap to try again"],
  ])("says plainly what is happening while %s", async (phase, words) => {
    mockSession.phase = phase;

    await show();

    expect(screen.getByText(words)).toBeTruthy();
  });

  it("tells the person it is their turn and that listening stops by itself", async () => {
    mockSession.phase = "listening";
    await show();
    expect(screen.getByText("I will stop listening when you pause")).toBeTruthy();
    expect(screen.getByLabelText("Step 2 of 3: Your turn")).toBeTruthy();
  });

  it("explains in plain words what to expect before the first tap", async () => {
    await show();
    expect(screen.getByText(/You do not need to press anything/)).toBeTruthy();
  });

  it("drops that explanation once Utsav has spoken", async () => {
    mockSession.phase = "speaking";
    mockSession.reply = "Namaste ji.";
    await show();
    expect(screen.queryByText(/You do not need to press anything/)).toBeNull();
  });

  it("keeps a very long reply whole, so nothing is cut off", async () => {
    const prayer = Array.from({ length: 40 }, (_, i) => `पंक्ति ${i + 1} जय हनुमान ज्ञान गुन सागर`).join(" ");
    Object.assign(mockSession, { reply: prayer });

    await show();

    expect(screen.getByText(prayer)).toBeTruthy(); // the whole text is there, inside a box that scrolls
  });

  it("offers a way to open Settings when the microphone is refused", async () => {
    mockSession.error = MIC_PERMISSION_MESSAGE;
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);

    await show();
    await fireEvent.press(screen.getByRole("button", { name: "Open Settings" }));

    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("shows what Utsav said in very large type, what the person said, and any problem", async () => {
    Object.assign(mockSession, { reply: "श्रीगुरु चरन सरोज रज", said: "श्रीगुरु चरन कमल रज", error: "I didn't catch that." });

    await show();

    expect(screen.getByText("श्रीगुरु चरन सरोज रज")).toBeTruthy();
    expect(screen.getByText("You: श्रीगुरु चरन कमल रज")).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("I didn't catch that.");
  });

  it("will not take a tap while Utsav is thinking", async () => {
    mockSession.phase = "thinking";
    await show();

    await fireEvent.press(screen.getByRole("button", { name: "One moment…" }));

    expect(mockSession.tap).not.toHaveBeenCalled();
  });

  it("cannot repeat before anything has been said", async () => {
    await show();

    expect(screen.getByRole("button", { name: "Say it again" }).props.accessibilityState.disabled).toBe(true);
  });

  it("repeats the last thing said once there is something to repeat", async () => {
    mockSession.hasAudio = true;
    await show();

    await fireEvent.press(screen.getByRole("button", { name: "Say it again" }));

    expect(mockSession.again).toHaveBeenCalled();
  });

  it("switches between slower and normal speed", async () => {
    await show();
    await fireEvent.press(screen.getByRole("button", { name: "Slower" }));
    expect(mockSession.setSlow).toHaveBeenCalledWith(true);

    mockSession.slow = true;
    await show();
    expect(screen.getByRole("button", { name: "Normal speed" })).toBeTruthy();
  });

  it("ends the session and goes back", async () => {
    await show();

    await fireEvent.press(screen.getByRole("button", { name: "End" }));

    expect(mockSession.end).toHaveBeenCalled();
    await Promise.resolve();
    expect(mockBack).toHaveBeenCalled();
  });
});
