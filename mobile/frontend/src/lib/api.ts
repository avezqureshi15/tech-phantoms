import { File } from "expo-file-system";
import { fetch as streamingFetch } from "expo/fetch";
import type { z } from "zod";

import { syncServerTime } from "@/lib/clock";
import { API_URL } from "@/lib/config";

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds the server asked us to wait (429 and 503 answers). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function retryAfterFrom(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

type SessionBridge = {
  getAccessToken: () => string | null;
  refresh: () => Promise<boolean>;
};

let bridge: SessionBridge = { getAccessToken: () => null, refresh: async () => false };

export function configureApi(next: SessionBridge) {
  bridge = next;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Set to false for the auth endpoints themselves. */
  authenticated?: boolean;
};

function messageFrom(payload: unknown, status: number): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (status === 422) return "Please check the details you entered.";
  if (status === 429) return "You're going a little fast. Please wait a moment and try again.";
  if (status === 503) return "FestiveOS is busy right now. Please try again in a moment.";
  if (status === 413) return "That's too large to send.";
  return "Something went wrong. Please try again.";
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const params = Object.entries(options.query ?? {}).filter(([, v]) => v !== undefined);
  const qs = params.length ? `?${new URLSearchParams(params.map(([k, v]) => [k, String(v)]))}` : "";

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = options.authenticated === false ? null : bridge.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}${qs}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    syncServerTime(response.headers.get("x-server-time"));
    return response;
  } catch {
    throw new ApiError("Can't reach FestiveOS. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function execute(path: string, options: RequestOptions): Promise<Response> {
  let response = await send(path, options);

  if (response.status === 401 && options.authenticated !== false && (await bridge.refresh())) {
    response = await send(path, options);
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(messageFrom(payload, response.status), response.status, retryAfterFrom(response));
  }
  return response;
}

/** Calls the API and validates the JSON body against `schema`. */
export async function request<S extends z.ZodType>(
  path: string,
  options: RequestOptions & { schema: S },
): Promise<z.infer<S>> {
  const response = await execute(path, options);
  // Validating at the boundary makes backend drift fail here, not deep inside a screen.
  const parsed = options.schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError("FestiveOS sent an unexpected response. Please update the app.", 502);
  }
  return parsed.data;
}

/** Calls an endpoint that returns no body (204). */
export async function command(path: string, options: RequestOptions = {}): Promise<void> {
  await execute(path, options);
}

/**
 * Opens a POST whose answer is a stream (server-sent events) and returns its reader. Uses Expo's
 * fetch, because React Native's own `fetch` buffers the whole body before handing it over.
 * Auth works as everywhere else: one silent refresh on a 401. There is deliberately no overall
 * timeout, since a stream is meant to stay open; the caller aborts it with `signal`.
 */
export async function openStream(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const attempt = () => {
    const token = bridge.getAccessToken();
    return streamingFetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  };

  let response;
  try {
    response = await attempt();
    if (response.status === 401 && (await bridge.refresh())) response = await attempt();
  } catch {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    throw new ApiError("Can't reach FestiveOS. Check your connection and try again.", 0);
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(
      messageFrom(payload, response.status),
      response.status,
      retryAfterFrom(response as unknown as Response),
    );
  }
  if (!response.body) throw new ApiError("FestiveOS sent an unexpected response. Please update the app.", 502);
  return response.body.getReader();
}

/**
 * Uploads one file as a form and validates the JSON answer. The timeout is longer than for ordinary
 * calls because reading a document takes a few seconds; auth works as everywhere else.
 */
export async function upload<S extends z.ZodType>(
  path: string,
  file: { uri: string; name: string; type: string },
  schema: S,
): Promise<z.infer<S>> {
  const attempt = async () => {
    const form = new FormData();
    // Expo's fetch cannot read React Native's old { uri, name, type } form part ("Unsupported
    // FormDataPart"); a File from expo-file-system is a real Blob it can send. The name and type
    // are the ones the caller chose, so the server sees the content type it expects.
    const part = new File(file.uri);
    form.append("file", part as unknown as Blob, file.name);
    const token = bridge.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      return await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("Can't reach FestiveOS. Check your connection and try again.", 0);
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await attempt();
  if (response.status === 401 && (await bridge.refresh())) response = await attempt();
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(messageFrom(payload, response.status), response.status, retryAfterFrom(response));
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError("FestiveOS sent an unexpected response. Please update the app.", 502);
  return parsed.data;
}

/** POSTs JSON and returns the raw bytes of the answer (for audio). Auth works as everywhere else. */
export async function download(path: string, body: unknown): Promise<ArrayBuffer> {
  const attempt = async () => {
    const token = bridge.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      return await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("Can't reach FestiveOS. Check your connection and try again.", 0);
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await attempt();
  if (response.status === 401 && (await bridge.refresh())) response = await attempt();
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(messageFrom(payload, response.status), response.status, retryAfterFrom(response));
  }
  return response.arrayBuffer();
}
