import { Mic } from "lucide-react";
import { LevelMeter } from "./LevelMeter";
import { cn } from "@/lib/utils";

interface PushToTalkProps {
  isReady: boolean;
  isRecording: boolean;
  level: number;
  onStart: () => void;
  onStop: () => void;
}

/** Hold-to-talk, with a level ring that pulses while recording (§3.7). */
export function PushToTalk({ isReady, isRecording, level, onStart, onStop }: PushToTalkProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <LevelMeter level={level} active={isRecording} />
        <button
          type="button"
          disabled={!isReady}
          onMouseDown={onStart}
          onMouseUp={onStop}
          onMouseLeave={() => isRecording && onStop()}
          onTouchStart={(e) => {
            e.preventDefault();
            onStart();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onStop();
          }}
          className={cn(
            "relative flex h-28 w-28 items-center justify-center rounded-full border-2 shadow-sm transition-all select-none",
            isRecording
              ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-brand/20"
              : "border-brand-lightest bg-brand-light text-primary hover:border-brand-lighter hover:bg-brand-ultra-light",
            !isReady && "cursor-not-allowed opacity-50",
          )}
        >
          <Mic className={cn("h-10 w-10 transition-transform", isRecording && "scale-110")} aria-hidden="true" />
        </button>
      </div>
      <p className="font-heading text-xs font-medium tracking-wide text-tertiary uppercase">
        {!isReady ? "Waiting for mic permission…" : isRecording ? "Listening…" : "Hold to speak"}
      </p>
    </div>
  );
}
