import { render, screen } from "@testing-library/react-native";

import { ListRow } from "@/components/ListRow";

const LONG = "Any festival parties or events near me this month, and what should I bring along?";

describe("a list row", () => {
  it("keeps a short title to one line so lists stay tidy", async () => {
    await render(<ListRow title="Ask Utsav" />);
    expect(screen.getByText("Ask Utsav").props.numberOfLines).toBe(1);
  });

  it("lets long text wrap when asked to, so a notice or a question is never cut off mid-sentence", async () => {
    await render(<ListRow title={LONG} titleLines={3} />);
    expect(screen.getByText(LONG).props.numberOfLines).toBe(3);
  });
});
