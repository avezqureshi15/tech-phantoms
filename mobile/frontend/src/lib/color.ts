const parse = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};

/** `amount` (0 to 1) of `other` mixed into `base`: a solid colour, never a gradient. */
export function mix(base: string, other: string, amount: number): string {
  const a = parse(base);
  const b = parse(other);
  const channel = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * amount);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}
