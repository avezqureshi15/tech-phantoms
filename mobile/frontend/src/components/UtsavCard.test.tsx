import { fireEvent, render, screen } from "@testing-library/react-native";

import { UtsavCard } from "@/components/UtsavCard";

const handlers = () => ({ onAsk: jest.fn(), onTalk: jest.fn(), onPray: jest.fn() });

describe("the Utsav card", () => {
  it("offers all three ways in and each does its own thing", async () => {
    const h = handlers();
    await render(<UtsavCard ask talk pray {...h} />);

    await fireEvent.press(screen.getByRole("button", { name: "Ask Utsav" }));
    await fireEvent.press(screen.getByRole("button", { name: "Talk with Utsav" }));
    await fireEvent.press(screen.getByRole("button", { name: "Practise a prayer" }));

    expect(h.onAsk).toHaveBeenCalledTimes(1);
    expect(h.onTalk).toHaveBeenCalledTimes(1);
    expect(h.onPray).toHaveBeenCalledTimes(1);
  });

  it("shows only the ways that are switched on", async () => {
    await render(<UtsavCard ask talk={false} pray={false} {...handlers()} />);

    expect(screen.getByRole("button", { name: "Ask Utsav" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Talk with Utsav" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Practise a prayer" })).toBeNull();
  });

  it("is not shown at all when everything is switched off", async () => {
    const { toJSON } = await render(<UtsavCard ask={false} talk={false} pray={false} {...handlers()} />);

    expect(toJSON()).toBeNull();
  });
});
