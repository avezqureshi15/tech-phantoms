import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { Markdown } from "@/components/Markdown";
import { CalendarCardView, ConfirmCardView, HostingPlanView, LinksCardView, QuestionCardView } from "@/components/utsav/Cards";
import type { QuestionCard } from "@/lib/utsav/schemas";

const mockAddToCalendar = jest.fn();
jest.mock("@/lib/calendar", () => ({ addToPhoneCalendar: (event: unknown) => mockAddToCalendar(event) }));

describe("Markdown", () => {
  it("renders bold, lists and headings as text, not as raw symbols", async () => {
    await render(<Markdown>{"## Plan\n\n- **Diyas** at dusk\n- Rangoli\n\nSee *you* soon"}</Markdown>);

    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Diyas")).toBeTruthy();
    expect(screen.getByText(/at dusk/)).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByText(/##/)).toBeNull();
  });

  it("never fetches an image from the model's text: it shows the description instead", async () => {
    await render(<Markdown>{"![a tracking pixel](https://evil.example/p.png)"}</Markdown>);

    expect(screen.getByText("a tracking pixel")).toBeTruthy();
    expect(screen.queryByRole("image")).toBeNull();
  });

  it("opens a normal link but ignores a dangerous one", async () => {
    const open = jest.spyOn(Linking, "openURL").mockImplementation(async () => undefined);
    await render(<Markdown>{"[good](https://example.com) and [bad](javascript:alert(1))"}</Markdown>);

    await fireEvent.press(screen.getByText("good"));
    await fireEvent.press(screen.getByText("bad"));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://example.com");
    open.mockRestore();
  });

  it("copes with half-finished markdown while an answer is still streaming", async () => {
    await render(<Markdown streaming>{"Here is a script:\n\n```py\nprint('hi'"}</Markdown>);

    expect(screen.getByText("Here is a script:")).toBeTruthy();
    expect(screen.getByText(/print\('hi'/)).toBeTruthy();
  });
});

const question: QuestionCard = {
  kind: "question",
  id: "q",
  title: "A few details",
  fields: [
    { key: "adults", label: "Adults", type: "number", options: [], minimum: 1, maximum: 50, required: true },
    {
      key: "diet",
      label: "Diet",
      type: "single_choice",
      options: [
        { value: "veg", label: "Vegetarian" },
        { value: "mixed", label: "Mixed" },
      ],
      required: true,
    },
  ],
};

describe("cards", () => {
  it("will not send a question card until it is answered, then sends clean answers and a recap", async () => {
    const onSubmit = jest.fn();
    await render(<QuestionCardView card={question} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole("button", { name: "Send answers" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please answer this")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Adults"), "4");
    await fireEvent.press(screen.getByRole("button", { name: "Vegetarian" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send answers" }));

    expect(onSubmit).toHaveBeenCalledWith({ adults: 4, diet: "veg" }, "Adults: 4\nDiet: Vegetarian");
  });

  it("asks for approval and reports the decision", async () => {
    const onDecide = jest.fn();
    await render(
      <ConfirmCardView
        card={{ kind: "confirm", id: "c", title: "Add 6 chairs", summary: "Add to inventory", details: [{ label: "Item", value: "Chair" }] }}
        onDecide={onDecide}
      />,
    );

    expect(screen.getByText("Chair")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));

    expect(onDecide.mock.calls).toEqual([["approve"], ["decline"]]);
  });

  it("shows the computed plan lines as they came", async () => {
    await render(
      <HostingPlanView
        card={{
          kind: "hosting_plan",
          id: "h",
          title: "Dinner plan",
          headline: "For 4 people",
          sections: [{ heading: "Food", lines: [{ label: "Rice", value: "1.2 kg" }] }],
        }}
      />,
    );

    expect(screen.getByText("For 4 people")).toBeTruthy();
    expect(screen.getByText("1.2 kg")).toBeTruthy();
  });
});

describe("event and calendar cards", () => {
  it("opens an event listing, and refuses a link that is not an ordinary web page", async () => {
    const open = jest.spyOn(Linking, "openURL").mockImplementation(async () => undefined);
    await render(
      <LinksCardView
        card={{
          kind: "links",
          id: "l",
          title: "Christmas near Bengaluru",
          description: "Open a listing to RSVP.",
          links: [
            { label: "Christmas Market 2026", url: "https://in.bookmyshow.com/activities/christmas-market-2026/etr20wh36i/", note: "5 Dec · Ranch" },
            { label: "Sneaky", url: "javascript:alert(1)" },
          ],
        }}
      />,
    );

    expect(screen.getByText("5 Dec · Ranch")).toBeTruthy();
    await fireEvent.press(screen.getByText("Christmas Market 2026"));
    await fireEvent.press(screen.getByText("Sneaky"));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://in.bookmyshow.com/activities/christmas-market-2026/etr20wh36i/");
    open.mockRestore();
  });

  it("adds a calendar event only when tapped, and reports a refusal in plain words", async () => {
    mockAddToCalendar.mockResolvedValueOnce("denied");
    await render(
      <CalendarCardView card={{ kind: "calendar_event", id: "c", title: "Christmas 2026", start_date: "2026-12-24", end_date: "2026-12-26", notes: null }} />,
    );
    expect(mockAddToCalendar).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Add to my calendar" }));

    expect(mockAddToCalendar).toHaveBeenCalledWith(expect.objectContaining({ title: "Christmas 2026", startDate: "2026-12-24", endDate: "2026-12-26" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Settings/);
  });
});
