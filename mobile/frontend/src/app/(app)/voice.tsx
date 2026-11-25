import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { PatternArt } from "@/components/Patterns";
import { EmptyState } from "@/components/States";
import { VoiceSteps } from "@/components/VoiceSteps";
import { useActiveHousehold, useFeatures } from "@/features/queries";
import { MIC_PERMISSION_MESSAGE, useVoiceSession, type SessionMode } from "@/features/useVoiceSession";
import { usePattern } from "@/lib/appearance";
import { useLayout } from "@/lib/layout";
import { colors, layout, spacing } from "@/lib/theme";
import { captionSize, circleIsTappable, guidance, type Phase } from "@/lib/voice-session";

type ScrollHandle = React.ComponentProps<typeof ScrollView>["ref"] extends React.Ref<infer T> | undefined ? T : never;
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const COPY: Record<SessionMode, { title: string; start: string; intro: string }> = {
  elder: {
    title: "Talking with Utsav",
    start: "Tap to start talking",
    intro:
      "Speak in any language. Utsav will talk back, and listens after each reply. You do not need to press anything.",
  },
  recite: {
    title: "Practise a prayer",
    start: "Tap to begin",
    intro: "Utsav says one line at a time. Say it back, and Utsav will gently help with any word.",
  },
};

const LOOK: Record<Phase, { icon: IconName; color: string }> = {
  idle: { icon: "mic", color: colors.saffronDeep },
  speaking: { icon: "volume-high", color: colors.saffronDeep },
  listening: { icon: "mic", color: colors.success },
  thinking: { icon: "ellipsis-horizontal", color: "#5B5249" },
  paused: { icon: "mic", color: colors.saffronDeep },
  ended: { icon: "checkmark", color: "#5B5249" },
  error: { icon: "refresh", color: colors.danger },
};

export default function VoiceScreen() {
  const { mode: raw } = useLocalSearchParams<{ mode?: string }>();
  const mode: SessionMode = raw === "recite" ? "recite" : "elder";
  useKeepAwake(); // the screen must not lock in the middle of a prayer

  const { household } = useActiveHousehold();
  const features = useFeatures();
  const session = useVoiceSession(household?.id, mode, { autoStart: true });
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { isTablet } = useLayout();
  const look = LOOK[session.phase];
  const say = guidance(session.phase, COPY[mode].start);
  const label = say.hint ? `${say.title}. ${say.hint}` : say.title;
  const orb = Math.round(Math.min(210, Math.max(150, height * 0.22))); // smaller phones get a smaller circle
  const pattern = usePattern();
  const caption = captionSize(session.reply);

  // Two soft rings around the circle. While listening they swell with the person's real voice; while
  // Utsav speaks they breathe slowly; otherwise they rest. It shows at a glance that the phone can hear.
  const [inner] = useState(() => new Animated.Value(0));
  const [outer] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (session.phase === "listening") {
      Animated.timing(inner, {
        toValue: session.level,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      Animated.timing(outer, {
        toValue: session.level * 0.7,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (session.phase === "speaking") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(inner, {
            toValue: 0.55,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(inner, {
            toValue: 0.1,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      outer.setValue(0.25);
      loop.start();
      return () => loop.stop();
    }
    inner.setValue(0);
    outer.setValue(0);
  }, [inner, outer, session.phase, session.level]);

  // Changes are eased, not snapped: the circle gives a small press when the turn changes, and each new
  // reply fades in from the top of its box instead of replacing the old one at once.
  const [press] = useState(() => new Animated.Value(1));
  useEffect(() => {
    press.setValue(0.92);
    Animated.spring(press, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [press, session.phase]);

  const [fade] = useState(() => new Animated.Value(1));
  const scroller = useRef<ScrollHandle>(null);
  useEffect(() => {
    fade.setValue(0);
    scroller.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(fade, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade, session.reply]);

  const leave = async () => {
    await session.end();
    router.back();
  };

  const allowed =
    features.on("utsav") && features.on("utsav_voice") && features.on(mode === "recite" ? "recite_mode" : "elder_mode");
  if (!allowed) {
    return (
      <EmptyState
        icon="pause-circle"
        title="Voice is resting"
        message="This is switched off for a little while. Please try again later."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  const needsSettings = session.error === MIC_PERMISSION_MESSAGE;

  return (
    <View
      style={[
        styles.root,
        { overflow: "hidden", paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      {pattern !== "none" ? (
        <View pointerEvents="none" style={styles.art}>
          <PatternArt id={pattern} size={560} color={colors.white} opacity={0.05} />
        </View>
      ) : null}
      <View style={[styles.column, isTablet && { maxWidth: layout.maxContentWidth }]}>
        <View style={styles.top}>
          <AppText variant="heading" color="rgba(255,255,255,0.75)">
            {COPY[mode].title}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End"
            onPress={() => void leave()}
            style={styles.close}
          >
            <Ionicons name="close" size={30} color={colors.white} />
          </Pressable>
        </View>

        <VoiceSteps step={say.step} />

        <ScrollView
          ref={scroller}
          style={styles.wordsBox}
          contentContainerStyle={styles.words}
          showsVerticalScrollIndicator
          indicatorStyle="white"
        >
          <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
            {session.reply ? (
              <AppText style={[styles.reply, caption]} accessibilityLiveRegion="polite">
                {session.reply}
              </AppText>
            ) : session.phase === "idle" ? (
              <AppText style={styles.intro}>{COPY[mode].intro}</AppText>
            ) : null}
            {session.said ? (
              <AppText style={styles.said} color="rgba(255,255,255,0.6)">
                You: {session.said}
              </AppText>
            ) : null}
            {session.error ? (
              <AppText style={styles.error} accessibilityRole="alert">
                {session.error}
              </AppText>
            ) : null}
            {needsSettings ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Settings"
                onPress={() => void Linking.openSettings()}
                style={styles.settings}
              >
                <Ionicons name="settings-outline" size={26} color={colors.white} />
                <AppText style={styles.settingsText}>Open Settings</AppText>
              </Pressable>
            ) : null}
          </Animated.View>
        </ScrollView>

        <View style={styles.center}>
          <View style={{ width: orb, height: orb, alignItems: "center", justifyContent: "center" }}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: orb,
                  height: orb,
                  borderRadius: orb / 2,
                  backgroundColor: look.color,
                  opacity: outer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }),
                  transform: [{ scale: outer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: orb,
                  height: orb,
                  borderRadius: orb / 2,
                  backgroundColor: look.color,
                  opacity: inner.interpolate({ inputRange: [0, 1], outputRange: [0, 0.34] }),
                  transform: [{ scale: inner.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: press }] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label || "Start"}
                accessibilityState={{ busy: session.phase === "thinking" }}
                onPress={() => void session.tap()}
                disabled={!circleIsTappable(session.phase)}
                style={[styles.orb, { width: orb, height: orb, borderRadius: orb / 2, backgroundColor: look.color }]}
              >
                {session.phase === "thinking" ? (
                  <ActivityIndicator size="large" color={colors.white} />
                ) : (
                  <Ionicons name={look.icon} size={Math.round(orb * 0.42)} color={colors.white} />
                )}
              </Pressable>
            </Animated.View>
          </View>

          {/* A fixed-height block, so the circle and buttons never jump when the words change. */}
          <View style={styles.say} accessibilityLiveRegion="polite">
            <AppText style={styles.sayTitle}>{say.title}</AppText>
            <AppText style={styles.sayHint}>{say.hint}</AppText>
          </View>
        </View>

        <View style={styles.buttons}>
          <Big icon="refresh" label="Say it again" onPress={() => void session.again()} disabled={!session.hasAudio} />
          <Big
            icon="walk"
            label={session.slow ? "Normal speed" : "Slower"}
            onPress={() => session.setSlow(!session.slow)}
            selected={session.slow}
          />
        </View>
      </View>
    </View>
  );
}

function Big({
  icon,
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.big, selected && styles.bigOn, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={30} color={colors.white} />
      <AppText style={styles.bigText}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.maroon, alignItems: "center", paddingHorizontal: spacing.lg },
  art: { position: "absolute", left: -140, top: 110 },
  column: { flex: 1, width: "100%", gap: spacing.md },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  close: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  // The words take whatever room is left and scroll inside it, so a long prayer is never cut off.
  wordsBox: { flex: 1 },
  words: { flexGrow: 1, justifyContent: "center", paddingVertical: spacing.sm },
  reply: { color: colors.white, textAlign: "center" },
  intro: { color: "rgba(255,255,255,0.8)", fontSize: 24, lineHeight: 34, textAlign: "center" },
  said: { fontSize: 20, lineHeight: 28, textAlign: "center" },
  error: { color: "#FFB4A9", fontSize: 20, lineHeight: 28, textAlign: "center" },
  settings: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  settingsText: { color: colors.white, fontSize: 20, lineHeight: 26 },
  center: { alignItems: "center", gap: spacing.md },
  ring: { position: "absolute" },
  orb: { alignItems: "center", justifyContent: "center" },
  say: { minHeight: 76, alignItems: "center", justifyContent: "flex-start", gap: 4 },
  sayTitle: { color: colors.white, fontSize: 26, lineHeight: 32, textAlign: "center" },
  sayHint: { color: "rgba(255,255,255,0.65)", fontSize: 18, lineHeight: 24, textAlign: "center" },
  buttons: { flexDirection: "row", gap: spacing.md },
  big: {
    flex: 1,
    minHeight: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  bigOn: { backgroundColor: colors.saffronDeep },
  bigText: { color: colors.white, fontSize: 19, lineHeight: 24 },
});
