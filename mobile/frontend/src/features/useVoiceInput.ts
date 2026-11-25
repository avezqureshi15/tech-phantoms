import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, upload } from "@/lib/api";
import { transcriptSchema } from "@/lib/utsav/schemas";
import { MAX_RECORDING_SECONDS, PERMISSION_MESSAGE, RECORDING_FAILED, UPLOAD_FAILED } from "@/lib/voice";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * Talk to the app in any language. A short recording is sent for transcription and the words come back
 * in whatever language was spoken: there is no language to choose. The words are handed to `onText` for
 * the person to read and send; they are never sent on automatically, and the recording is not kept.
 */
export function useVoiceInput(householdId: string | undefined, onText: (spoken: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const release = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
  }, []);

  /** Stops recording and turns what was said into text. */
  const stop = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState("transcribing");
    void Haptics.selectionAsync();
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording");
      const heard = await upload(
        `/households/${householdId}/ai/transcribe`,
        { uri, name: "voice.m4a", type: "audio/mp4" },
        transcriptSchema,
      );
      if (live.current) onText(heard.text);
    } catch (e) {
      if (live.current) setError(e instanceof ApiError ? e.message : UPLOAD_FAILED);
    } finally {
      await release();
      if (live.current) setState("idle");
    }
  }, [householdId, onText, recorder, release]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(PERMISSION_MESSAGE);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      timer.current = setTimeout(() => void stop(), MAX_RECORDING_SECONDS * 1000);
    } catch {
      await release();
      setError(RECORDING_FAILED);
    }
  }, [recorder, release, stop]);

  return { state, error, start, stop };
}
