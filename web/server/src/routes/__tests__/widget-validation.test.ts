import { describe, expect, it } from "vitest";
import { isAllowedOrigin, normalizeOrigin, parseAllowedOrigins, SubmissionRateLimiter, validatePublicEnquiry } from "../widget-validation";

describe("public widget validation", () => {
  it("normalizes exact origins and rejects paths and wildcards", () => {
    expect(normalizeOrigin("https://shop.example.com/")).toBe("https://shop.example.com");
    expect(normalizeOrigin("https://shop.example.com/path")).toBeNull();
    expect(parseAllowedOrigins(["https://shop.example.com", "https://shop.example.com/"])).toEqual(["https://shop.example.com"]);
    expect(parseAllowedOrigins(["*"])).toBeNull();
    expect(isAllowedOrigin("https://shop.example.com", ["https://shop.example.com"])).toBe(true);
    expect(isAllowedOrigin("https://evil.example", ["https://shop.example.com"])).toBe(false);
  });

  it("requires a message, a valid contact method, and explicit contact consent", () => {
    const base = {
      submissionId: "demo-request-0001",
      name: "Asha Rao",
      message: "Do you have this in a smaller size?",
      contactConsent: true,
    };
    expect(validatePublicEnquiry({ ...base, email: "asha@example.com" }).input?.email).toBe("asha@example.com");
    expect(validatePublicEnquiry({ ...base, phone: "+91 98765 43210" }).input?.phone).toBe("+91 98765 43210");
    expect(validatePublicEnquiry({ ...base, email: "", phone: "" }).error).toContain("email address or phone");
    expect(validatePublicEnquiry({ ...base, email: "asha@example.com", contactConsent: false }).error).toContain("Consent");
    expect(validatePublicEnquiry({ ...base, email: "not-an-email" }).error).toContain("valid email");
  });

  it("limits repeated submissions in a window and resets after expiry", () => {
    const limiter = new SubmissionRateLimiter();
    expect(limiter.allow("widget:ip", 1000, 2, 100)).toBe(true);
    expect(limiter.allow("widget:ip", 1001, 2, 100)).toBe(true);
    expect(limiter.allow("widget:ip", 1002, 2, 100)).toBe(false);
    expect(limiter.allow("widget:ip", 1100, 2, 100)).toBe(true);
  });
});
