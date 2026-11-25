import {
  AudioModule,
  createAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";

import { ApiError, download, upload } from "@/lib/api";
import { streamTurn } from "@/lib/utsav/client";
import { transcriptSchema, type Item } from "@/lib/utsav/schemas";
import {
  ECHO_TAIL_MS,
  IDLE_LIMIT_MESSAGE,
  isEcho,
  isNoise,
  MAX_IDLE_TURNS,
  overBudget,
  SESSION_LIMIT_MESSAGE,
  type Budget,
} from "@/lib/voice-guard";
import { meterLevel, musicLink, replyText, vadStart, vadStep, type Phase, type Vad } from "@/lib/voice-session";

export type SessionMode = "elder" | "recite";

// Said aloud by the phone itself before anyone has spoken, so the first words the person says (in any
// language) decide the language of the whole conversation. No model is asked for this.
export const GREETING: Record<SessionMode, string> = {
  elder: "Namaste ji. Tell me, how can I help you today?",
  recite: "Namaste ji. Which prayer would you like to practise? Please say its name.",
};
export const VOICE_SLOW = "Utsav's voice is slow right now. You can read the reply above.";
export const MIC_PERMISSION_MESSAGE = "Allow the microphone in Settings so Utsav can hear you.";
export const PACE = { normal: 1.0, slow: 0.8 } as const;

/**
 * A spoken conversation: Utsav speaks, the person answers aloud, and so on, hands-free. The microphone
 * level decides when the person has finished, so nobody has to press anything between turns. If voice
 * (or anything else) fails, the words are still on screen and one big tap tries again.
 */
export function useVoiceSession(
  householdId: string | undefined,
  mode: SessionMode,
  options: { autoStart?: boolean } = {},
) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 150);

  const [phase, setPhaseState] = useState<Phase>("idle");
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const active = useRef(true);
  const conversation = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const vad = useRef<Vad | null>(null);
  const player = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const finishPlayback = useRef<(() => void) | null>(null);
  const lastAudio = useRef<File | null>(null);
  const slowRef = useRef(false);
  const lastSpoken = useRef(""); // what Utsav last said aloud, to tell an echo from the person
  const idleTurns = useRef(0); // turns in a row where nothing usable was heard
  const budget = useRef<Budget>({ turns: 0, startedAt: 0 }); // the clock starts with the first turn
  useEffect(() => {
    slowRef.current = slow; // the next spoken reply uses the latest pace without re-creating callbacks
  }, [slow]);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (!active.current) return;
      setError(e instanceof ApiError ? e.message : fallback);
      setPhase("error");
    },
    [setPhase],
  );

  // ---- speaking ---------------------------------------------------------------------------------------
  const playFile = useCallback(async (file: File) => {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    await new Promise<void>((resolve) => {
      const audio = createAudioPlayer({ uri: file.uri });
      player.current = audio;
      const subscription = audio.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) done();
      });
      const guard = setTimeout(() => done(), 180_000);
      function done() {
        clearTimeout(guard);
        subscription.remove();
        audio.remove();
        if (player.current === audio) player.current = null;
        finishPlayback.current = null;
        resolve();
      }
      finishPlayback.current = done;
      audio.play();
    });
    // Let the speaker's tail fade before the microphone opens, or the phone hears itself.
    if (ECHO_TAIL_MS > 0) await new Promise<void>((resolve) => setTimeout(resolve, ECHO_TAIL_MS));
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text || !active.current) return;
      setPhase("speaking");
      lastSpoken.current = text;
      try {
        const bytes = await download(`/households/${householdId}/ai/speak`, {
          text,
          pace: slowRef.current ? PACE.slow : PACE.normal,
        });
        const file = new File(Paths.cache, `utsav-voice-${Date.now()}.wav`);
        file.create();
        file.write(new Uint8Array(bytes));
        lastAudio.current?.delete();
        lastAudio.current = file;
        setHasAudio(true);
        if (active.current) await playFile(file);
      } catch {
        // Speaking is an extra: the reply is on screen, so say so and carry on to listening.
        if (active.current) setError(VOICE_SLOW);
      }
    },
    [householdId, playFile, setPhase],
  );

  // ---- listening ------------------------------------------------------------------------------------------
  const listen = useCallback(async () => {
    if (!active.current) return;
    if (overBudget(budget.current, Date.now())) {
      setError(SESSION_LIMIT_MESSAGE);
      setPhase("ended");
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(MIC_PERMISSION_MESSAGE);
        setPhase("error");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      vad.current = vadStart(Date.now());
      setPhase("listening");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      fail(e, "The microphone isn't available right now.");
    }
  }, [fail, recorder, setPhase]);

  // ---- one turn of conversation --------------------------------------------------------------------------
  const turn = useCallback(
    async (message: string, language?: string | null) => {
      const { turns, startedAt } = budget.current;
      budget.current = { turns: turns + 1, startedAt: startedAt || Date.now() };
      setPhase("thinking");
      setSaid(message);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      let finalItems: Item[] | null = null;
      const id = conversation.current;
      try {
        await streamTurn(
          id ? `/ai/conversations/${id}/messages/stream` : `/households/${householdId}/ai/conversations/stream`,
          id ? { message, language: language ?? undefined } : { message, mode, language: language ?? undefined },
          (event) => {
            if (event.name === "start") conversation.current = event.data.conversation_id;
            if (event.name === "done") finalItems = event.data.items;
            if (event.name === "error") throw new ApiError(event.data.message, event.data.status);
          },
          controller.signal,
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        fail(e, "I couldn't reach Utsav. Check the internet and try again.");
        return;
      }
      if (!active.current || !finalItems) return;

      const text = replyText(finalItems);
      setReply(text);
      const music = musicLink(finalItems);
      if (music) {
        void Linking.openURL(music).catch(() => undefined);
        setPhase("paused"); // the music app is in front now; come back and tap when ready
        return;
      }
      await speak(text);
      if (active.current) await listen();
    },
    [fail, householdId, listen, mode, setPhase, speak],
  );

  const stopRecording = useCallback(async () => {
    vad.current = null;
    try {
      await recorder.stop();
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  }, [recorder]);

  /** Nothing usable was heard. Ask again, but only a few times in a row: then wait for a tap. */
  const nothingHeard = useCallback(
    async (message: string) => {
      idleTurns.current += 1;
      if (idleTurns.current >= MAX_IDLE_TURNS) {
        idleTurns.current = 0;
        setError(IDLE_LIMIT_MESSAGE);
        setPhase("paused");
        return;
      }
      setError(message);
      if (active.current) await listen();
    },
    [listen, setPhase],
  );

  const finishListening = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    setPhase("thinking");
    try {
      await stopRecording();
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording");
      const heard = await upload(
        `/households/${householdId}/ai/transcribe`,
        { uri, name: "voice.m4a", type: "audio/mp4" },
        transcriptSchema,
      );
      // Nothing usable, or just the phone's own voice coming back: do not pay for an answer to it.
      if (isNoise(heard.text) || isEcho(heard.text, lastSpoken.current)) {
        await nothingHeard("I did not catch that. Please say it again.");
        return;
      }
      idleTurns.current = 0;
      await turn(heard.text, heard.language);
    } catch (e) {
      // "I didn't catch that" is normal: say so, and listen again instead of ending the session.
      if (e instanceof ApiError && e.status === 422 && active.current) {
        await nothingHeard(e.message);
        return;
      }
      fail(e, "I couldn't hear that. Please try again.");
    }
  }, [fail, householdId, nothingHeard, recorder, setPhase, stopRecording, turn]);

  const giveUp = useCallback(async () => {
    await stopRecording().catch(() => undefined);
    if (active.current) setPhase("paused");
  }, [setPhase, stopRecording]);

  // The microphone level, a few times a second, decides when they have finished speaking.
  useEffect(() => {
    if (phaseRef.current !== "listening" || !vad.current) return;
    const step = vadStep(vad.current, recorderState.metering, Date.now());
    vad.current = step.vad;
    if (step.action === "finish") void finishListening();
    else if (step.action === "giveup") void giveUp();
  }, [recorderState.metering, recorderState.durationMillis, finishListening, giveUp]);

  // ---- what the big buttons do ----------------------------------------------------------------------------
  /** The phone greets, then listens: the person never has to tap before speaking. */
  const begin = useCallback(async () => {
    setError(null);
    setReply(GREETING[mode]);
    await speak(GREETING[mode]);
    if (active.current) await listen();
  }, [listen, mode, speak]);

  const tap = useCallback(async () => {
    setError(null);
    switch (phaseRef.current) {
      case "listening":
        await finishListening();
        break;
      case "speaking":
        finishPlayback.current?.(); // skip ahead: the person wants to speak
        break;
      case "idle":
        await begin();
        break;
      case "paused":
      case "error":
        if (conversation.current) await listen();
        else await begin();
        break;
    }
  }, [begin, finishListening, listen]);

  const again = useCallback(async () => {
    const file = lastAudio.current;
    if (!file || phaseRef.current === "thinking") return;
    finishPlayback.current?.();
    if (phaseRef.current === "listening") await stopRecording().catch(() => undefined);
    setPhase("speaking");
    await playFile(file).catch(() => undefined);
    if (active.current) await listen();
  }, [listen, playFile, setPhase, stopRecording]);

  const end = useCallback(async () => {
    active.current = false;
    abort.current?.abort();
    finishPlayback.current?.();
    await stopRecording().catch(() => undefined);
    lastAudio.current?.delete();
    setPhase("ended");
  }, [setPhase, stopRecording]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
      finishPlayback.current?.();
    };
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (!options.autoStart || started.current || !householdId || phaseRef.current !== "idle") return;
    started.current = true;
    void begin();
  }, [options.autoStart, householdId, begin]);

  // How loud the person is, 0 to 1, only while listening: the screen draws it as a ring.
  const level = phase === "listening" ? meterLevel(recorderState.metering) : 0;

  return { phase, said, reply, error, slow, setSlow, tap, again, end, hasAudio, level };
}
