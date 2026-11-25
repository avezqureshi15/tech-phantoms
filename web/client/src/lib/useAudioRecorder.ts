import { useCallback, useEffect, useRef, useState } from "react";

/** Mime selection order (§3.6) — Sarvam's REST API accepts all three, no transcoding. */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const AUTO_STOP_MS = 20_000;

function pickMimeType(): string {
  for (const mime of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export interface UseAudioRecorderResult {
  /** Mic permission granted and the stream is open. */
  isReady: boolean;
  isRecording: boolean;
  /** 0..1 input level, for the hold-to-talk ring. */
  level: number;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Hold-to-talk capture (§3.6): mic permission requested on mount (not on
 * first click), the MediaStream kept open between turns, a 20s auto-stop,
 * and a live level meter so the speaker knows the mic is hearing them.
 */
export function useAudioRecorder(onStop: (blob: Blob, mimeType: string) => void): UseAudioRecorderResult {
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        mimeTypeRef.current = pickMimeType();
        setIsReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "microphone permission was denied");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close().catch(() => {});
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current);
    };
  }, []);

  // A ref (not a self-referencing closure) avoids reading `tickLevel` before
  // its own declaration finishes initializing. Assigned in an effect, not
  // during render — nothing it closes over changes between renders anyway.
  const tickLevelRef = useRef<() => void>(() => {});
  useEffect(() => {
    tickLevelRef.current = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const v of data) {
        const normalized = (v - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setLevel(Math.min(1, rms * 4));
      rafRef.current = requestAnimationFrame(() => tickLevelRef.current());
    };
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
    setLevel(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current);
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const start = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecording) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(
      stream,
      mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined,
    );
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
      onStopRef.current(blob, mimeTypeRef.current || "audio/webm");
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    rafRef.current = requestAnimationFrame(() => tickLevelRef.current());

    autoStopTimerRef.current = window.setTimeout(stop, AUTO_STOP_MS);
  }, [isRecording, stop]);

  return { isReady, isRecording, level, error, start, stop };
}
