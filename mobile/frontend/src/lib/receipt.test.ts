import { fillFromReceipt, minorToInput, receiptDraftSchema, type ReceiptDraft } from "@/lib/receipt";

const draft = (over: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  merchant: "Sharma Sweets",
  spent_on: "2026-11-22",
  total_minor: 132300,
  currency: "INR",
  items: [],
  warnings: [],
  ...over,
});

describe("receipt drafts", () => {
  it("turns paise into the text typed into an amount box", () => {
    expect(minorToInput(132300)).toBe("1323.00");
    expect(minorToInput(9950)).toBe("99.50");
    expect(minorToInput(5)).toBe("0.05");
  });

  it("fills description, amount and date from what was read", () => {
    const fill = fillFromReceipt(draft());

    expect(fill).toMatchObject({ description: "Sharma Sweets", amount: "1323.00", notes: [] });
    expect(fill.date?.getFullYear()).toBe(2026);
    expect(fill.date?.getMonth()).toBe(10);
    expect(fill.date?.getDate()).toBe(22);
  });

  it("fills only what was read and carries the server's warnings to the person", () => {
    const fill = fillFromReceipt(draft({ merchant: null, spent_on: null, total_minor: null, warnings: ["We couldn't find a total. Please enter it."] }));

    expect(fill.description).toBeUndefined();
    expect(fill.amount).toBeUndefined();
    expect(fill.date).toBeUndefined();
    expect(fill.notes).toEqual(["We couldn't find a total. Please enter it."]);
  });

  it("uses a lone item as the description when the shop name is missing", () => {
    const fill = fillFromReceipt(draft({ merchant: null, items: [{ name: "Tea", amount_minor: 12000 }] }));

    expect(fill.description).toBe("Tea");
  });

  it("rejects a response that is not a draft", () => {
    expect(receiptDraftSchema.safeParse({ merchant: "x" }).success).toBe(false);
    expect(receiptDraftSchema.safeParse(draft()).success).toBe(true);
  });
});
