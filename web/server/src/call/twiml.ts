import twilio from "twilio";
import { publicUrl } from "./guards";

export function playAndRecord(sessionId: string, audioKey: string | null, fallbackText: string): string {
  const response = new twilio.twiml.VoiceResponse();
  if (audioKey) response.play(publicUrl(`/api/audio/${audioKey}.wav`));
  else response.say({ voice: "Google.hi-IN-Standard-A", language: "hi-IN" }, fallbackText);
  addRecorder(response, sessionId);
  return response.toString();
}

export function playAndHangup(audioKey: string | null, fallbackText: string): string {
  const response = new twilio.twiml.VoiceResponse();
  if (audioKey) response.play(publicUrl(`/api/audio/${audioKey}.wav`));
  else response.say({ voice: "Google.hi-IN-Standard-A", language: "hi-IN" }, fallbackText);
  response.hangup();
  return response.toString();
}

export function holdingResponse(sessionId: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "Google.hi-IN-Standard-A", language: "hi-IN" }, "Ek kshan, main aapki baat dekh rahi hoon.");
  response.pause({ length: 1 });
  response.redirect({ method: "POST" }, publicUrl(`/api/twilio/pending/${sessionId}`));
  return response.toString();
}

export function closeCallResponse(message: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "Google.hi-IN-Standard-A", language: "hi-IN" }, message);
  response.hangup();
  return response.toString();
}

export function hangupResponse(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}

function addRecorder(response: twilio.twiml.VoiceResponse, sessionId: string): void {
  response.record({
    action: publicUrl(`/api/twilio/turn/${sessionId}`),
    method: "POST",
    maxLength: 20,
    timeout: 3,
    playBeep: false,
    trim: "trim-silence",
    finishOnKey: "#",
  });
  response.say({ voice: "Google.hi-IN-Standard-A", language: "hi-IN" }, "Maaf kijiye, mujhe awaaz nahi mili. Dhanyavaad.");
  response.hangup();
}
