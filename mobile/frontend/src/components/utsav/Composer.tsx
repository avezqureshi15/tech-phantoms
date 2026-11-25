import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText } from "@/components/AppText";
import type { AttachedDocument } from "@/lib/utsav/schemas";
import { useVoiceInput } from "@/features/useVoiceInput";
import { mergeTranscript } from "@/lib/voice";
import { colors, fonts, MIN_TOUCH, spacing } from "@/lib/theme";

const MAX = 2000; // the server's limit

type Props = {
  busy: boolean;
  /** Typing is paused while a card waits for an answer. */
  blocked?: boolean;
  placeholder?: string;
  onSend: (text: string, documents: AttachedDocument[]) => void;
  onStop: () => void;
  /** Documents waiting to be sent with the next message. */
  attachments?: AttachedDocument[];
  attaching?: boolean;
  onAttach?: () => void;
  onRemoveAttachment?: (index: number) => void;
  /** Needed for the mic: the group the recording is transcribed for. */
  householdId?: string;
  /** False when voice is switched off: the mic is not shown. */
  voiceEnabled?: boolean;
};

export function Composer({
  busy,
  blocked = false,
  placeholder = "Ask Utsav anything",
  onSend,
  onStop,
  attachments = [],
  attaching = false,
  onAttach,
  onRemoveAttachment,
  householdId,
  voiceEnabled = true,
}: Props) {
  const [text, setText] = useState("");
  const typedBefore = useRef(""); // what was already in the box when the recording began
  const voice = useVoiceInput(householdId, (spoken) => setText(mergeTranscript(typedBefore.current, spoken)));
  const recording = voice.state === "recording";
  const transcribing = voice.state === "transcribing";
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !busy && !blocked && voice.state === "idle";

  const toggleMic = () => {
    if (recording) {
      void voice.stop();
      return;
    }
    typedBefore.current = text;
    void voice.start();
  };

  const send = () => {
    if (!canSend) return;
    onSend(trimmed, attachments);
    setText("");
  };

  const showMic = !busy && !blocked && !!householdId && voiceEnabled;

  return (
    <View style={styles.wrap}>
      {attachments.length > 0 || attaching ? (
        <View style={styles.chips}>
          {attachments.map((doc, index) => (
            <Pressable
              key={`${doc.name}:${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${doc.name}`}
              onPress={() => onRemoveAttachment?.(index)}
              style={styles.chip}
            >
              <Ionicons name="document-text" size={16} color={colors.saffronDeep} />
              <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 160 }}>
                {doc.name}
              </AppText>
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          ))}
          {attaching ? (
            <AppText variant="caption" color={colors.muted} accessibilityLiveRegion="polite">
              Reading your document…
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={styles.box}>
        {onAttach && !busy && !blocked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a document"
            onPress={onAttach}
            disabled={attaching}
            style={styles.attach}
          >
            <Ionicons name="attach" size={24} color={colors.muted} />
          </Pressable>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={
            blocked
              ? "Answer the card above to continue"
              : recording
                ? "Listening…"
                : transcribing
                  ? "Turning your voice into text…"
                  : placeholder
          }
          placeholderTextColor={colors.muted}
          editable={!blocked && voice.state === "idle"}
          multiline
          maxLength={MAX}
          accessibilityLabel="Message Utsav"
          style={styles.input}
        />
        {showMic ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop and send my voice to Utsav" : "Speak to Utsav"}
            accessibilityState={{ selected: recording, disabled: transcribing }}
            onPress={toggleMic}
            disabled={transcribing}
            style={[styles.mic, recording && styles.micOn]}
          >
            {transcribing ? (
              <ActivityIndicator color={colors.saffronDeep} />
            ) : (
              <Ionicons name={recording ? "stop" : "mic"} size={20} color={recording ? colors.white : colors.saffronDeep} />
            )}
          </Pressable>
        ) : null}
        {busy ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={onStop} style={[styles.button, styles.stop]}>
            <Ionicons name="stop" size={18} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            onPress={send}
            style={[styles.button, !canSend && styles.off]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </Pressable>
        )}
      </View>
      {voice.error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert" style={styles.count}>
          {voice.error}
          {voice.error.includes("Settings") ? (
            <AppText variant="caption" color={colors.saffronDeep} onPress={() => void Linking.openSettings()}>
              {"  Open Settings"}
            </AppText>
          ) : null}
        </AppText>
      ) : recording ? (
        <AppText variant="caption" color={colors.muted} style={styles.count} accessibilityLiveRegion="polite">
          Speak in any language. Tap the square when you are done.
        </AppText>
      ) : null}
      {text.length > MAX - 200 ? (
        <AppText variant="caption" color={colors.muted} style={styles.count}>
          {text.length}/{MAX}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 4 },
  box: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 26,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: MIN_TOUCH - 8,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    paddingTop: 8,
    paddingBottom: 8,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.saffronDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  stop: { backgroundColor: colors.maroon },
  attach: { width: 36, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.saffronSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  micOn: { backgroundColor: colors.danger },
  off: { opacity: 0.35 },
  count: { textAlign: "right", paddingRight: spacing.sm },
});
