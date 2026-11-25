import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Markdown } from "@/components/Markdown";
import { CardView } from "@/components/utsav/Cards";
import { draftText, toolStatus, type Draft, type Message } from "@/lib/utsav/chat";
import type { Item } from "@/lib/utsav/schemas";
import { colors, radius, spacing } from "@/lib/theme";

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.user}>
        <AppText color={colors.white} selectable>
          {text}
        </AppText>
      </View>
    </View>
  );
}

function Items({ items, pendingId }: { items: Item[]; pendingId?: string | null }) {
  return (
    <>
      {items.map((item, index) =>
        item.type === "text" ? (
          <View key={index} style={styles.assistant}>
            <Markdown>{item.text}</Markdown>
          </View>
        ) : (
          <CardView key={index} card={item.card} pendingId={pendingId} />
        ),
      )}
    </>
  );
}

export function MessageView({ message, pendingId }: { message: Message; pendingId?: string | null }) {
  if (message.role === "user") return <UserBubble text={message.text} />;
  if (message.role === "notice") {
    return (
      <AppText variant="caption" color={colors.muted} style={styles.notice}>
        {message.text}
      </AppText>
    );
  }
  return (
    <View style={styles.column}>
      <Items items={message.items} pendingId={pendingId} />
    </View>
  );
}

/** The reply as it is being written, followed by what Utsav is doing right now. */
export function DraftView({ draft }: { draft: Draft }) {
  const text = draftText(draft);
  return (
    <View style={styles.column} accessibilityLiveRegion="polite">
      {text ? (
        <View style={styles.assistant}>
          <Markdown streaming>{text}</Markdown>
        </View>
      ) : null}
      {draft.cards
        .filter((card) => card.kind !== "question" && card.kind !== "confirm") // those show once, as the form below
        .map((card) => (
          <CardView key={card.id} card={card} />
        ))}
      <Typing label={toolStatus(draft.tool)} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const [value] = useState(() => new Animated.Value(0.3));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, value]);
  return <Animated.View style={[styles.dot, { opacity: value }]} />;
}

export function Typing({ label }: { label: string }) {
  return (
    <View style={styles.typing} accessibilityRole="progressbar" accessibilityLabel={`Utsav: ${label}`}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
      <AppText variant="caption" color={colors.muted}>
        {label}…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: "flex-end" },
  user: {
    maxWidth: "85%",
    backgroundColor: colors.maroon,
    borderRadius: radius.md,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  column: { gap: spacing.sm, alignItems: "stretch" },
  assistant: {
    alignSelf: "flex-start",
    maxWidth: "92%",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  notice: { textAlign: "center", paddingHorizontal: spacing.lg },
  typing: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.saffronDeep },
});
