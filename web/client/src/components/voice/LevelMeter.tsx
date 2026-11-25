import { cn } from "@/lib/utils";

/** Pulsing ring around the hold-to-talk button (§3.6) — the only proof, in a loud hall, that the mic is hearing you. */
export function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const scale = active ? 1 + level * 0.6 : 1;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-full border-2 transition-transform duration-75",
        active ? "border-brand-lighter" : "border-transparent",
      )}
      style={{ transform: `scale(${scale})` }}
    />
  );
}
