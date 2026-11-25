/**
 * Money is carried as integer minor units (paise) everywhere, so there is no floating-point drift.
 * Only the edges convert: parsing what a person types, and formatting what they read.
 */

const MINOR_PER_MAJOR = 100;
const MAX_MINOR = 1_000_000_000_000;

/** "1,234.5" -> 123450. Returns null for anything that is not a positive amount with at most two decimals. */
export function parseMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * MINOR_PER_MAJOR + Number(fraction.padEnd(2, "0"));
  return minor > 0 && minor <= MAX_MINOR ? minor : null;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** 123450 + "INR" -> "₹1,234.50". Whole amounts drop the decimals ("₹1,234"). */
export function formatMoney(minor: number, currency = "INR"): string {
  const key = currency;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 });
    formatters.set(key, formatter);
  }
  const major = minor / MINOR_PER_MAJOR;
  return Number.isInteger(major)
    ? formatter.format(major).replace(/\.00$/, "")
    : formatter.format(major);
}

/** Splits an equal share the same way the server does, for showing a preview before saving. */
export function previewEqualShares(total: number, people: number): number[] {
  if (people <= 0) return [];
  const base = Math.floor(total / people);
  const extra = total - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
}
