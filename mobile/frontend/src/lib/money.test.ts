import { formatMoney, parseMinor, previewEqualShares } from "@/lib/money";

describe("parseMinor", () => {
  it("turns what people type into paise", () => {
    expect(parseMinor("250")).toBe(25000);
    expect(parseMinor("1,234.5")).toBe(123450);
    expect(parseMinor("0.07")).toBe(7);
    expect(parseMinor(" 99.99 ")).toBe(9999);
  });

  it("refuses anything that is not a positive amount with at most two decimals", () => {
    for (const bad of ["", "0", "0.00", "-5", "abc", "1.234", "1..2", "12e3", "₹50", "1,0,0.5.5"]) {
      expect(parseMinor(bad)).toBeNull();
    }
    expect(parseMinor("99999999999999")).toBeNull();
  });

  it("is exact where floating point is not", () => {
    expect(parseMinor("0.1")! + parseMinor("0.2")!).toBe(parseMinor("0.3"));
    expect(parseMinor("19.99")).toBe(1999);
  });
});

describe("formatMoney", () => {
  it("formats rupees with Indian grouping and drops empty decimals", () => {
    expect(formatMoney(123456700)).toBe("₹12,34,567");
    expect(formatMoney(12345)).toBe("₹123.45");
    expect(formatMoney(50000)).toBe("₹500");
  });
});

describe("previewEqualShares", () => {
  it("matches the server: the leftover paise go to the first few", () => {
    expect(previewEqualShares(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(previewEqualShares(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(previewEqualShares(5, 0)).toEqual([]);
  });
});
