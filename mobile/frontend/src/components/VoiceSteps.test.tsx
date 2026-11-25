import { render, screen } from "@testing-library/react-native";

import { VoiceSteps } from "@/components/VoiceSteps";

describe("the voice steps", () => {
  it("shows all three steps", async () => {
    await render(<VoiceSteps step={null} />);
    expect(screen.getByText("Utsav speaks")).toBeTruthy();
    expect(screen.getByText("Your turn")).toBeTruthy();
    expect(screen.getByText("Thinking")).toBeTruthy();
  });

  it("tells a screen reader which step it is", async () => {
    await render(<VoiceSteps step={1} />);
    expect(screen.getByLabelText("Step 2 of 3: Your turn")).toBeTruthy();
  });

  it("has a neutral description when no step is current", async () => {
    await render(<VoiceSteps step={null} />);
    expect(screen.getByLabelText("Conversation steps")).toBeTruthy();
  });
});
