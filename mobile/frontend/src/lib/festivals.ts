import { daysUntil } from "@/lib/dates";
import type { Festival } from "@/lib/schemas";

/** The festival to spotlight: the next one still to come (or in progress), else the latest. */
export function pickFeatured(festivals: Festival[], today: string): Festival | undefined {
  const live = festivals
    .filter((f) => f.status !== "cancelled" && daysUntil(f.end_date, today) >= 0)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return live[0] ?? [...festivals].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}
