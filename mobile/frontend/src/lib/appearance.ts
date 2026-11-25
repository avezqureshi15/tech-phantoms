import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/** The festive line-art pattern drawn on hero surfaces. Chosen by the person, kept between launches. */
export const PATTERN_IDS = ["lotus", "rangoli", "jaali", "paisley", "surya", "none"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

const KEY = "festiveos.pattern";
const DEFAULT: PatternId = "lotus";

let current: PatternId = DEFAULT;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const isPatternId = (value: unknown): value is PatternId =>
  typeof value === "string" && (PATTERN_IDS as readonly string[]).includes(value);

async function load() {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (isPatternId(saved) && saved !== current) {
      current = saved;
      emit();
    }
  } catch {
    // An unreadable store just means "use the default".
  }
}
void load();

export function setPattern(id: PatternId) {
  if (id === current) return;
  current = id;
  emit();
  void SecureStore.setItemAsync(KEY, id).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePattern(): PatternId {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT);
}
