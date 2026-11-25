import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { Composer } from "@/components/utsav/Composer";

let mockOnText: (spoken: string) => void = () => undefined;
const mockVoice = { state: "idle" as "idle" | "recording" | "transcribing", error: null as string | null, start: jest.fn(), stop: jest.fn() };
jest.mock("@/features/useVoiceInput", () => ({
  useVoiceInput: (_household: string | undefined, onText: (spoken: string) => void) => {
    mockOnText = onText;
    return mockVoice;
  },
}));

const noop = () => undefined;
const box = () => screen.getByLabelText("Message Utsav");

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockVoice, { state: "idle", error: null });
});

describe("voice input", () => {
  it("shows a mic that starts a recording, with no language to choose", async () => {
    await render(<Composer busy={false} householdId="h1" onSend={noop} onStop={noop} />);

    await fireEvent.press(screen.getByRole("button", { name: "Speak to Utsav" }));

    expect(mockVoice.start).toHaveBeenCalled();
    expect(screen.queryByText(/language/i)).toBeNull();
  });

  it("says it is listening, in any language, and the mic becomes a stop button", async () => {
    mockVoice.state = "recording";
    await render(<Composer busy={false} householdId="h1" onSend={noop} onStop={noop} />);

    expect(screen.getByPlaceholderText("Listening…")).toBeTruthy();
    expect(screen.getByText(/Speak in any language/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Stop and send my voice/ }));
    expect(mockVoice.stop).toHaveBeenCalled();
  });

  it("puts the transcript after what was already typed and never sends it by itself", async () => {
    const onSend = jest.fn();
    await render(<Composer busy={false} householdId="h1" onSend={onSend} onStop={noop} />);
    await fireEvent.changeText(box(), "Hello Utsav");

    await fireEvent.press(screen.getByRole("button", { name: "Speak to Utsav" }));
    await act(async () => mockOnText("ದೀಪಾವಳಿ ಯಾವಾಗ"));

    expect(box().props.value).toBe("Hello Utsav ದೀಪಾವಳಿ ಯಾವಾಗ");
    expect(onSend).not.toHaveBeenCalled(); // the person reads it first
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Hello Utsav ದೀಪಾವಳಿ ಯಾವಾಗ", []);
  });

  it("holds sending while it is recording or turning the voice into text", async () => {
    mockVoice.state = "transcribing";
    const onSend = jest.fn();
    await render(<Composer busy={false} householdId="h1" onSend={onSend} onStop={noop} />);
    await fireEvent.changeText(box(), "typed");

    expect(screen.getByPlaceholderText("Turning your voice into text…")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a voice problem, and points to Settings when the microphone is refused", async () => {
    mockVoice.error = "Allow the microphone in Settings to talk to Utsav.";
    const settings = jest.spyOn(Linking, "openSettings").mockImplementation(async () => undefined);
    await render(<Composer busy={false} householdId="h1" onSend={noop} onStop={noop} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Settings/);
    await fireEvent.press(screen.getByText(/Open Settings/));
    expect(settings).toHaveBeenCalled();
    settings.mockRestore();
  });

  it("has no mic when voice is switched off, but typing and sending still work", async () => {
    const onSend = jest.fn();
    await render(<Composer busy={false} householdId="h1" voiceEnabled={false} onSend={onSend} onStop={noop} />);

    expect(screen.queryByRole("button", { name: "Speak to Utsav" })).toBeNull();
    await fireEvent.changeText(box(), "hello");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hello", []);
  });

  it("has no mic while Utsav is answering, while a card waits, or without a group to transcribe for", async () => {
    const { rerender } = await render(<Composer busy householdId="h1" onSend={noop} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Speak to Utsav" })).toBeNull();

    await rerender(<Composer busy={false} blocked householdId="h1" onSend={noop} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Speak to Utsav" })).toBeNull();

    await rerender(<Composer busy={false} onSend={noop} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Speak to Utsav" })).toBeNull();
  });
});

describe("attachments", () => {
  const doc = { name: "invite.pdf", text: "Housewarming on 5 Dec", truncated: false };

  it("shows attached documents, lets the person remove one, and sends them with the message", async () => {
    const onSend = jest.fn();
    const onRemove = jest.fn();
    await render(<Composer busy={false} onSend={onSend} onStop={noop} attachments={[doc]} onRemoveAttachment={onRemove} onAttach={noop} />);

    expect(screen.getByText("invite.pdf")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Message Utsav"), "Summarise this");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Summarise this", [doc]);

    await fireEvent.press(screen.getByRole("button", { name: "Remove invite.pdf" }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("offers the paperclip only when attaching is possible, and says while it is reading", async () => {
    const onAttach = jest.fn();
    const { rerender } = await render(<Composer busy={false} onSend={noop} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Attach a document" })).toBeNull();

    await rerender(<Composer busy={false} onSend={noop} onStop={noop} onAttach={onAttach} />);
    await fireEvent.press(screen.getByRole("button", { name: "Attach a document" }));
    expect(onAttach).toHaveBeenCalled();

    await rerender(<Composer busy={false} onSend={noop} onStop={noop} onAttach={onAttach} attaching />);
    expect(screen.getByText("Reading your document…")).toBeTruthy();
  });

  it("hides the paperclip while Utsav is answering", async () => {
    await render(<Composer busy onSend={noop} onStop={noop} onAttach={noop} />);

    expect(screen.queryByRole("button", { name: "Attach a document" })).toBeNull();
  });
});
