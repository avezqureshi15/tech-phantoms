import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/**
 * Which group the app is showing. A person can belong to several (family, friends, office), so this
 * is remembered between launches. It is a tiny external store rather than context so that any
 * screen, and the query hooks, can read and change it without a provider.
 */
const KEY = "festiveos.active-group";

let activeId: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

async function load() {
  try {
    activeId = (await SecureStore.getItemAsync(KEY)) ?? null;
  } catch {
    activeId = null; // an unreadable store just means "use the first group"
  }
  loaded = true;
  emit();
}
void load();

export function setActiveGroup(id: string | null) {
  if (id === activeId) return;
  activeId = id;
  emit();
  void (id ? SecureStore.setItemAsync(KEY, id) : SecureStore.deleteItemAsync(KEY)).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useActiveGroupId(): { id: string | null; ready: boolean } {
  const id = useSyncExternalStore(subscribe, () => activeId, () => null);
  const ready = useSyncExternalStore(subscribe, () => loaded, () => false);
  return { id, ready };
}

/** The remembered group if the person still belongs to it, otherwise the first one. */
export function pickGroup<T extends { id: string }>(groups: T[] | undefined, id: string | null): T | undefined {
  return groups?.find((group) => group.id === id) ?? groups?.[0];
}
