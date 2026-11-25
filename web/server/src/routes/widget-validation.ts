export interface PublicEnquiryInput {
  submissionId: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  pageUrl: string | null;
  pageTitle: string | null;
  productName: string | null;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : undefined;
}

export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const origins: string[] = [];
  for (const item of value) {
    const origin = normalizeOrigin(item);
    if (!origin) return null;
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins.includes(normalized);
}

export function isHexColor(value: string): boolean {
  return /^#[\da-f]{6}$/i.test(value);
}

export function validatePublicEnquiry(value: unknown): { input?: PublicEnquiryInput; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Invalid enquiry" };
  const body = value as Record<string, unknown>;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = optionalText(body.email, 254);
  const phone = optionalText(body.phone, 32);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const pageUrl = optionalText(body.pageUrl, 2048);
  const pageTitle = optionalText(body.pageTitle, 200);
  const productName = optionalText(body.productName, 160);

  if (!/^[\w-]{8,80}$/.test(submissionId)) return { error: "Invalid submission id" };
  if (name.length < 2 || name.length > 100) return { error: "Name must be between 2 and 100 characters" };
  if (email === undefined || phone === undefined || pageUrl === undefined || pageTitle === undefined || productName === undefined) {
    return { error: "One or more fields are too long or invalid" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address" };
  if (phone && (!/^[+()\d][\d\s().-]{5,30}$/.test(phone) || phone.replace(/\D/g, "").length < 7)) {
    return { error: "Enter a valid phone number" };
  }
  if (!email && !phone) return { error: "Add an email address or phone number" };
  if (message.length < 5 || message.length > 2000) return { error: "Message must be between 5 and 2000 characters" };
  if (body.contactConsent !== true) return { error: "Consent is required so the business can respond" };
  if (pageUrl) {
    try {
      const url = new URL(pageUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return { error: "Invalid page URL" };
    } catch {
      return { error: "Invalid page URL" };
    }
  }

  return {
    input: {
      submissionId,
      name,
      email: email?.toLowerCase() ?? null,
      phone: phone ?? null,
      message,
      pageUrl: pageUrl ?? null,
      pageTitle: pageTitle ?? null,
      productName: productName ?? null,
    },
  };
}

export class SubmissionRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  allow(key: string, now = Date.now(), limit = 5, windowMs = 60_000): boolean {
    if (this.entries.size > 1000) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.resetAt <= now) this.entries.delete(entryKey);
      }
    }
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.entries.size >= 5000) return false;
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count++;
    return true;
  }
}
