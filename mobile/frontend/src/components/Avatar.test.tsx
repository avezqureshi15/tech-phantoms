import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Avatar } from "@/components/Avatar";

const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

describe("an avatar", () => {
  it("shows up to two initials in capitals", async () => {
    await render(<Avatar name="vikram sharma kumar" />);
    expect(screen.getByText("VS")).toBeTruthy();
  });

  it("shows a question mark rather than nothing when there is no name", async () => {
    await render(<Avatar name="" />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it.each([24, 40, 46, 84, 120])("leaves room for the initials to be seen whole at size %s", async (size) => {
    await render(<Avatar name="Vikram Sharma" size={size} />);
    const { fontSize, lineHeight } = styleOf("VS");
    // A line box shorter than the letters cuts their tops off.
    expect(lineHeight).toBeGreaterThanOrEqual(fontSize * 1.2);
  });

  it("shows the photo instead when there is one", async () => {
    await render(<Avatar name="Vikram Sharma" uri="https://example.com/a.jpg" />);
    expect(screen.queryByText("VS")).toBeNull();
    expect(screen.getByLabelText("Vikram Sharma")).toBeTruthy();
  });
});
