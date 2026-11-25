import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import { deviceTimeZone, safeZone, todayIn } from "@/lib/clock";

type ClockValue = { today: string; timeZone: string };

const ClockContext = createContext<ClockValue | null>(null);

/** Provides "today" in the household's time zone, rolling over at midnight there. */
export function ClockProvider({ timeZone, children }: PropsWithChildren<{ timeZone: string }>) {
  const [, setTick] = useState(0);

  useEffect(() => {
    // Re-evaluate periodically and whenever the app returns to the foreground.
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setTick((t) => t + 1);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const zone = safeZone(timeZone);
  const today = todayIn(zone);
  // The value only changes when the day does, so consumers re-render at midnight, not every tick.
  const value = useMemo(() => ({ today, timeZone: zone }), [today, zone]);

  return <ClockContext value={value}>{children}</ClockContext>;
}

/** Today's date (YYYY-MM-DD) in the household's time zone (the device's, outside a household). */
export function useToday(): string {
  return use(ClockContext)?.today ?? todayIn(deviceTimeZone());
}

export function useTimeZone(): string {
  return use(ClockContext)?.timeZone ?? deviceTimeZone();
}
