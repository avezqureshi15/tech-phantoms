import { fireEvent, render, screen } from "@testing-library/react-native";

import { SafeAreaProvider } from "react-native-safe-area-context";

import SupportScreen from "@/app/(app)/support";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const show = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SupportScreen />
    </SafeAreaProvider>,
  );

const mockMutate = jest.fn();
let mockOff = false;
jest.mock("@/features/queries", () => ({
  useFeatures: () => ({ on: () => !mockOff, announcement: null }),
  useRequestCallback: () => ({ mutate: mockMutate, isPending: false }),
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { back: () => mockBack() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockOff = false;
});

const fill = async (phone = "+91 98765 43210") => {
  await fireEvent.changeText(screen.getByLabelText("Your phone number"), phone);
};
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

describe("the call-back screen", () => {
  it("does not send anything until the person has agreed", async () => {
    await show();
    await fill();

    await press("Call me back");

    expect(screen.getByRole("alert")).toHaveTextContent(/tick the box/i);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("does not send a number that cannot be called", async () => {
    await show();
    await fill("not a number");
    await fireEvent.press(screen.getByRole("checkbox"));

    await press("Call me back");

    expect(screen.getByRole("alert")).toHaveTextContent(/country code/i);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("sends the request once the form is complete and consent is ticked", async () => {
    await show();
    await press("Kannada");
    await press("An expense");
    await fill();
    await fireEvent.press(screen.getByRole("checkbox"));

    await press("Call me back");

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0]![0]).toEqual({
      phone: "+919876543210",
      language: "kn-IN",
      topic: "expense_dispute",
      note: undefined,
      consent: true,
    });
  });

  it("tells the person plainly that their number is not kept", async () => {
    await show();
    expect(screen.getByText(/do not keep your number/i)).toBeTruthy();
  });

  it("shows a calm notice instead of the form when the feature is switched off", async () => {
    mockOff = true;
    await show();

    expect(screen.getByText("Call-back support is resting")).toBeTruthy();
    expect(screen.queryByLabelText("Your phone number")).toBeNull();
  });
});
