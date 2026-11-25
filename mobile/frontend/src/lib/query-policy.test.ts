import { ApiError } from "@/lib/api";
import { retryDelay, shouldRetry } from "@/lib/query-policy";

describe("query retry policy", () => {
  it("retries network failures and server errors, at most twice", () => {
    expect(shouldRetry(0, new ApiError("offline", 0))).toBe(true);
    expect(shouldRetry(1, new ApiError("boom", 500))).toBe(true);
    expect(shouldRetry(2, new ApiError("boom", 500))).toBe(false);
  });

  it("retries 'slow down' and 'busy' answers but not other client errors", () => {
    expect(shouldRetry(0, new ApiError("slow", 429, 3))).toBe(true);
    expect(shouldRetry(0, new ApiError("busy", 503, 1))).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetry(0, new ApiError("no", status))).toBe(false);
    }
  });

  it("treats an unknown error as worth another try", () => {
    expect(shouldRetry(0, new Error("???"))).toBe(true);
  });

  it("waits as long as the server asked, but never more than ten seconds", () => {
    expect(retryDelay(0, new ApiError("slow", 429, 3))).toBe(3000);
    expect(retryDelay(0, new ApiError("slow", 429, 120))).toBe(10_000);
  });

  it("backs off exponentially when the server gave no hint", () => {
    expect(retryDelay(0, new ApiError("boom", 500))).toBe(1000);
    expect(retryDelay(1, new ApiError("boom", 500))).toBe(2000);
    expect(retryDelay(9, new Error("x"))).toBe(10_000);
  });
});
