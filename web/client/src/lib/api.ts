const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

async function toError(res: Response, fallback: string): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const message = typeof data?.error === "string" ? data.error : fallback;
  const code = typeof data?.code === "string" ? data.code : undefined;
  return new ApiError(message, res.status, code);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new CustomEvent("diya:unauthorized"));
    }
    throw await toError(res, `${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** multipart/form-data upload — no Content-Type header, the browser sets the boundary. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("diya:unauthorized"));
    throw await toError(res, `POST ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
