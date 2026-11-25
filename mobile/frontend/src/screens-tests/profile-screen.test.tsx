import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ProfileScreen from "@/app/(app)/profile";

const mockUser = {
  id: "u1",
  name: "Vikram Sharma",
  email: "vikram@example.com",
  avatar_url: null,
  faiths: ["hindu"],
  home_city: "bengaluru" as string | null,
};
const mockSave = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());
const mockDelete = jest.fn(() => Promise.resolve());
const mockPush = jest.fn();
let mockSupportOn = true;

jest.mock("@/lib/auth", () => ({
  useCurrentUser: () => mockUser,
  useAuth: () => ({ signOut: mockSignOut, deleteAccount: mockDelete }),
}));
jest.mock("@/features/queries", () => ({
  useFeatures: () => ({ on: () => mockSupportOn, announcement: null }),
  useCities: () => ({
    data: [
      { key: "bengaluru", name: "Bengaluru" },
      { key: "chennai", name: "Chennai" },
    ],
    isError: false,
  }),
  useUpdateProfile: () => ({ mutate: mockSave, isPending: false }),
}));
jest.mock("expo-router", () => ({ router: { push: (to: string) => mockPush(to) } }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.2.3" } }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const show = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ProfileScreen />
    </SafeAreaProvider>,
  );
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSupportOn = true;
  Object.assign(mockUser, { faiths: ["hindu"], home_city: "bengaluru" });
});

describe("the profile screen", () => {
  it("shows who you are and the app version", async () => {
    await show();
    expect(screen.getByText("Vikram Sharma")).toBeTruthy();
    expect(screen.getByText("vikram@example.com")).toBeTruthy();
    expect(screen.getByText(/FestiveOS 1\.2\.3/)).toBeTruthy();
  });

  it("offers no Save button until something has changed", async () => {
    await show();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("saves only what changed", async () => {
    await show();
    await press("Sikh");
    await press("Save changes");

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0]![0]).toEqual({ faiths: ["hindu", "sikh"] });
  });

  it("can change the city, and clear it", async () => {
    await show();
    await press("Chennai");
    await press("Save changes");
    expect(mockSave.mock.calls[0]![0]).toEqual({ home_city: "chennai" });

    await press("Not set");
    await press("Save changes");
    expect(mockSave.mock.calls[1]![0]).toEqual({ home_city: null });
  });

  it("takes the Save button away again when the change is undone", async () => {
    await show();
    await press("Sikh");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    await press("Sikh");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("links to groups, appearance and the call-back screen", async () => {
    await show();
    await press(/Your groups/);
    await press(/Appearance/);
    await press(/Get a call back/);
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(["/group", "/appearance", "/support"]);
  });

  it("hides the call-back row when that feature is switched off", async () => {
    mockSupportOn = false;
    await show();
    expect(screen.queryByRole("button", { name: /Get a call back/ })).toBeNull();
  });

  it("signs out", async () => {
    await show();
    await press("Sign out");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("asks before deleting the account, and does nothing if you cancel", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await show();

    await press("Delete my account");

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toBe("Delete your account?");
    expect(mockDelete).not.toHaveBeenCalled(); // asking is not deleting
    alert.mockRestore();
  });

  it("deletes the account only after the person confirms", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await show();
    await press("Delete my account");

    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Delete my account")!.onPress!();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
