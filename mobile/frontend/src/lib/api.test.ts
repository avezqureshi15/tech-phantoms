import { ApiError, configureApi, command, request, upload } from "@/lib/api";
import { now, resetClock } from "@/lib/clock";
import { z } from "zod";

const schema = z.object({ ok: z.boolean() });

// A recorded or picked file is read through expo-file-system. The fake keeps what it was given.
jest.mock("expo-file-system", () => ({
  File: class extends Blob {
    isFakeFile = true;
    uri: string;
    constructor(location: string) {
      super([]);
      this.uri = location;
    }
  },
}));

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("api client", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    resetClock();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    configureApi({ getAccessToken: () => "access-1", refresh: async () => false });
  });

  it("sends the bearer token and validates the response", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    await expect(request("/ping", { schema })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer access-1");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    let token = "stale";
    configureApi({
      getAccessToken: () => token,
      refresh: async () => {
        token = "fresh";
        return true;
      },
    });
    fetchMock.mockResolvedValueOnce(reply(401, { detail: "expired" })).mockResolvedValueOnce(reply(200, { ok: true }));

    await expect(request("/ping", { schema })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
  });

  it("surfaces the 401 when refreshing fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { detail: "Invalid or expired token" }));

    await expect(request("/ping", { schema })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never refreshes for the auth endpoints themselves", async () => {
    const refresh = jest.fn();
    configureApi({ getAccessToken: () => "x", refresh });
    fetchMock.mockResolvedValueOnce(reply(401, { detail: "Invalid refresh token" }));

    await expect(request("/auth/refresh", { schema, method: "POST", authenticated: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("reports a network failure as status 0", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(request("/ping", { schema })).rejects.toMatchObject({ status: 0 });
  });

  it("turns validation errors into a friendly message", async () => {
    fetchMock.mockResolvedValueOnce(reply(422, { detail: [{ loc: ["body", "name"], msg: "bad" }] }));

    await expect(request("/ping", { schema })).rejects.toMatchObject({
      status: 422,
      message: "Please check the details you entered.",
    });
  });

  it("uses the server's message for domain errors", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { detail: "Already recorded for this festival" }));

    await expect(request("/ping", { schema })).rejects.toThrow("Already recorded for this festival");
  });

  it("does not leak schema errors when the backend response drifts", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { unexpected: 1 }));

    await expect(request("/ping", { schema })).rejects.toMatchObject({ status: 502 });
  });

  it("supports endpoints that return no body", async () => {
    fetchMock.mockResolvedValueOnce(reply(204));

    await expect(command("/auth/logout", { method: "POST", body: {} })).resolves.toBeUndefined();
  });

  it("sends DELETE for member removal and surfaces the last-admin conflict", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(204))
      .mockResolvedValueOnce(
        reply(409, { detail: "A household needs at least one admin. Make someone else an admin first." }),
      );

    await expect(command("/households/h/members/u", { method: "DELETE" })).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    await expect(command("/households/h/members/u", { method: "DELETE" })).rejects.toThrow("at least one admin");
  });

  it("learns the server's time from its response headers, even on errors", async () => {
    const serverNow = new Date(Date.now() + 3 * 86_400_000); // the device clock is 3 days slow
    const response = new Response(JSON.stringify({ detail: "nope" }), {
      status: 404,
      headers: { "X-Server-Time": serverNow.toISOString() },
    });
    fetchMock.mockResolvedValueOnce(response);

    await expect(request("/ping", { schema })).rejects.toBeInstanceOf(ApiError);

    expect(Math.abs(now().getTime() - serverNow.getTime())).toBeLessThan(1000);
  });

  it("reads Retry-After from 429 and 503 answers and gives friendly fallbacks", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Too many requests. Please try again in 12 seconds." }), {
          status: 429,
          headers: { "Retry-After": "12" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));

    await expect(request("/x", { schema })).rejects.toMatchObject({
      status: 429,
      retryAfter: 12,
      message: "Too many requests. Please try again in 12 seconds.",
    });
    await expect(request("/x", { schema })).rejects.toMatchObject({
      status: 503,
      retryAfter: 1,
      message: expect.stringContaining("busy"),
    });
    await expect(request("/x", { schema })).rejects.toMatchObject({
      status: 429,
      retryAfter: undefined,
      message: expect.stringContaining("a little fast"),
    });
  });

  describe("uploading a file", () => {
    const file = { uri: "file:///cache/voice.m4a", name: "voice.m4a", type: "audio/mp4" };

    it("sends a real file part, never React Native's { uri, name, type } object", async () => {
      // Expo's fetch throws "Unsupported FormDataPart implementation" for that old shape, which made the
      // microphone, receipt scan and document upload all fail with "Can't reach FestiveOS".
      fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

      await expect(upload("/transcribe", file, schema)).resolves.toEqual({ ok: true });

      const form = fetchMock.mock.calls[0][1].body as FormData;
      const part = form.get("file");
      expect(part).toBeInstanceOf(Blob); // a real file, so Expo's fetch can read and send it
      expect((part as File).name).toBe("voice.m4a");
    });

    it("still sends the token and refreshes once on 401", async () => {
      let token = "stale";
      configureApi({
        getAccessToken: () => token,
        refresh: async () => {
          token = "fresh";
          return true;
        },
      });
      fetchMock
        .mockResolvedValueOnce(reply(401, { detail: "expired" }))
        .mockResolvedValueOnce(reply(200, { ok: true }));

      await expect(upload("/transcribe", file, schema)).resolves.toEqual({ ok: true });
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
    });
  });
});
