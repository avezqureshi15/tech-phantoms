import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { z } from "zod";

import { ApiError, command, request } from "@/lib/api";
import { streamTurn } from "@/lib/utsav/client";
import { chatReducer, initialChat } from "@/lib/utsav/chat";
import { conversationDetailSchema, conversationSchema, type AttachedDocument, type Card, type StreamEvent } from "@/lib/utsav/schemas";

const FLUSH_MS = 50;

export function useConversations(householdId: string | undefined) {
  return useQuery({
    queryKey: ["utsav", "conversations", householdId],
    queryFn: () =>
      request(`/households/${householdId}/ai/conversations`, {
        schema: z.array(conversationSchema),
        query: { limit: 50 },
      }),
    enabled: !!householdId,
  });
}

export function useDeleteConversation(householdId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => command(`/ai/conversations/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utsav", "conversations", householdId] }),
  });
}

/**
 * One chat with Utsav. Owns the streaming connection: text is batched so a fast stream re-renders
 * the screen a few times a second rather than for every word, and leaving the screen stops the
 * request (the server then stops cleanly too).
 */
export function useUtsavChat(householdId: string | undefined, resume?: string) {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state; // event handlers read the latest state without re-creating themselves
  }, [state]);
  const nextId = () => `m${++counter.current}`;

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const load = useCallback(
    async (id: string) => {
      try {
        const detail = await request(`/ai/conversations/${id}`, { schema: conversationDetailSchema });
        dispatch({ type: "loaded", detail });
      } catch (error) {
        dispatch({ type: "failed", message: error instanceof ApiError ? error.message : "Couldn't open that chat." });
      }
    },
    [],
  );

  const run = useCallback(
    async (path: string, body: unknown) => {
      stop();
      const mine = new AbortController();
      controller.current = mine;
      const doneId = nextId();

      // Merge text pieces that arrive close together; anything else flushes them first.
      let pending: Extract<StreamEvent, { name: "text" }> | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (pending && !mine.signal.aborted) dispatch({ type: "event", event: pending, id: doneId });
        pending = null;
      };
      const onEvent = (event: StreamEvent) => {
        if (mine.signal.aborted) return;
        if (event.name === "text") {
          if (pending && pending.data.segment === event.data.segment) {
            pending = { name: "text", data: { segment: event.data.segment, text: pending.data.text + event.data.text } };
          } else {
            flush();
            pending = event;
          }
          timer ??= setTimeout(flush, FLUSH_MS);
          return;
        }
        flush();
        dispatch({ type: "event", event, id: doneId });
      };

      try {
        await streamTurn(path, body, onEvent, mine.signal);
        flush();
      } catch (error) {
        flush();
        if (mine.signal.aborted) return;
        dispatch({
          type: "failed",
          message: error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
        });
      } finally {
        if (controller.current === mine) controller.current = null;
        void client.invalidateQueries({ queryKey: ["utsav", "conversations", householdId] });
      }
    },
    [client, householdId, stop],
  );

  const send = useCallback(
    (text: string, documents: AttachedDocument[] = []) => {
      const id = stateRef.current.conversationId;
      const shown = documents.length ? `${text}\n\nAttached: ${documents.map((d) => d.name).join(", ")}` : text;
      dispatch({ type: "sent", id: nextId(), text: shown });
      void run(
        id ? `/ai/conversations/${id}/messages/stream` : `/households/${householdId}/ai/conversations/stream`,
        { message: text, documents: documents.map(({ name, text: body }) => ({ name, text: body })) },
      );
    },
    [householdId, run],
  );

  const answer = useCallback(
    (card: Card, body: { answers: Record<string, unknown> } | { decision: "approve" | "decline" }, summary: string) => {
      const id = stateRef.current.conversationId;
      if (!id) return;
      dispatch({ type: "answered", id: nextId(), summary });
      void run(`/ai/conversations/${id}/cards/${card.id}/response/stream`, body);
    },
    [run],
  );

  /** Stop the reply in progress and show the chat as the server has it. */
  const cancel = useCallback(() => {
    stop();
    const id = stateRef.current.conversationId;
    if (id) void load(id);
    else dispatch({ type: "reset" });
  }, [load, stop]);

  useEffect(() => {
    if (resume) void load(resume);
    return stop; // leaving the screen ends the request
  }, [resume, load, stop]);

  return { state, send, answer, cancel, reset: () => { stop(); dispatch({ type: "reset" }); } };
}
