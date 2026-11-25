import { ApiError } from "@/lib/api";
import type { IconName } from "@/lib/meta";

export type ErrorKind = "offline" | "busy" | "notFound" | "forbidden" | "generic";

/** What went wrong, in terms a person cares about, from an HTTP status (0 means no connection). */
export function errorKind(status?: number): ErrorKind {
  if (status === 0) return "offline";
  if (status === 503 || status === 429) return "busy";
  if (status === 404) return "notFound";
  if (status === 401 || status === 403) return "forbidden";
  return "generic";
}

export const ERROR_COPY: Record<ErrorKind, { icon: IconName; title: string; hint?: string }> = {
  offline: { icon: "cloud-offline", title: "You're offline", hint: "Check your connection. Your data is safe." },
  busy: { icon: "hourglass", title: "We're a little busy", hint: "Give it a moment and try again." },
  notFound: { icon: "search", title: "We can't find that", hint: "It may have been removed." },
  forbidden: { icon: "lock-closed", title: "No access", hint: "You don't have permission to see this." },
  generic: { icon: "alert-circle", title: "Something went wrong" },
};

/** Props for <ErrorState> from any caught error, so every screen reports failures the same way. */
export function errorProps(error: Error): { message: string; status?: number } {
  return { message: error.message, status: error instanceof ApiError ? error.status : undefined };
}
