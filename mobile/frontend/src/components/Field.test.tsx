import { fireEvent, render, screen } from "@testing-library/react-native";

import { AmountField } from "@/components/Field";

describe("the amount field", () => {
  it("shows the currency symbol beside a large input and reports what is typed", async () => {
    const onChange = jest.fn();
    await render(<AmountField currency="INR" value="" onChangeText={onChange} />);

    expect(screen.getByText("₹")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount (INR)"), "250.50");

    expect(onChange).toHaveBeenCalledWith("250.50");
  });

  it("falls back to the currency code when there is no symbol for it", async () => {
    await render(<AmountField currency="JPY" value="100" onChangeText={jest.fn()} />);
    expect(screen.getByText("JPY")).toBeTruthy();
  });
});
