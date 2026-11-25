import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Backdrop } from "@/components/Backdrop";
import { Chip } from "@/components/Chip";
import { IconTile } from "@/components/IconTile";
import { EmptyState } from "@/components/States";
import { MessageView, DraftView } from "@/components/utsav/Bubbles";
import { ConfirmCardView, QuestionCardView } from "@/components/utsav/Cards";
import { Composer } from "@/components/utsav/Composer";
import { PickSheet } from "@/components/utsav/PickSheet";
import { useActiveHousehold, useFeatures, useReadDocument } from "@/features/queries";
import { useUtsavChat } from "@/features/utsav";
import { useLayout } from "@/lib/layout";
import { PermissionDenied, PickFailed, pickFile, type PickSource } from "@/lib/pick";
import { MAX_DOCUMENTS, type AttachedDocument } from "@/lib/utsav/schemas";
import { colors, layout, spacing } from "@/lib/theme";

type ScrollMetrics = {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
};
const nearBottom = ({ contentOffset, contentSize, layoutMeasurement }: ScrollMetrics) =>
  contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;

const SUGGESTIONS = [
  "Help me plan hosting for 12 guests",
  "What festival is coming up next?",
  "What should we cook for a vegetarian Diwali dinner?",
];

export default function UtsavScreen() {
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  const { household } = useActiveHousehold();
  const features = useFeatures();
  const { state, send, answer, cancel, reset } = useUtsavChat(household?.id, conversation);
  const insets = useSafeAreaInsets();
  const { isTablet } = useLayout();
  const list = useRef<FlatList>(null);
  const following = useRef(true); // keep the latest text in view, unless the person scrolled up

  useEffect(() => {
    if (state.messages.length === 0) return;
    // After the list has laid out: a chat that was just opened should show its latest message.
    const frame = requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [state.conversationId, state.messages.length]);

  const [attachments, setAttachments] = useState<AttachedDocument[]>([]);
  const [picking, setPicking] = useState(false);
  const readDocument = useReadDocument(household?.id);

  const attach = async (source: PickSource) => {
    if (attachments.length >= MAX_DOCUMENTS) {
      Alert.alert("That's enough for one message", `You can attach up to ${MAX_DOCUMENTS} documents at a time.`);
      return;
    }
    try {
      const file = await pickFile(source);
      if (!file) return;
      readDocument.mutate(file, {
        onSuccess: (doc) => {
          setAttachments((current) => [...current, doc]);
          if (doc.truncated) Alert.alert("Long document", "Utsav read the first part of it.");
        },
        onError: (e) => Alert.alert("Couldn't read that", e.message),
      });
    } catch (e) {
      if (e instanceof PermissionDenied) Alert.alert("Permission needed", e.message);
      else if (e instanceof PickFailed) Alert.alert("Couldn't open that", e.message);
      else throw e;
    }
  };

  const busy = state.draft !== null;
  const pending = state.pendingCard;
  const empty = state.messages.length === 0 && !busy && !pending;

  const footer = (
    <View style={styles.footer}>
      {state.draft ? <DraftView draft={state.draft} /> : null}
      {pending?.kind === "question" ? (
        <QuestionCardView
          key={pending.id}
          card={pending}
          disabled={busy}
          onSubmit={(answers, summary) => answer(pending, { answers }, summary)}
        />
      ) : null}
      {pending?.kind === "confirm" ? (
        <ConfirmCardView
          key={pending.id}
          card={pending}
          disabled={busy}
          onDecide={(decision) => answer(pending, { decision }, decision === "approve" ? "Approved" : "Not now")}
        />
      ) : null}
      {state.error ? (
        <AppText color={colors.danger} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {state.error}
        </AppText>
      ) : null}
    </View>
  );

  if (!features.on("utsav")) {
    return (
      <EmptyState
        icon="pause-circle"
        title="Utsav is resting"
        message="Utsav is switched off for a little while. Please try again later."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Backdrop />
      <Stack.Screen
        options={{
          title: "Utsav",
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="New chat" hitSlop={10} onPress={reset}>
                <Ionicons name="create-outline" size={24} color={colors.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Past chats" hitSlop={10} onPress={() => router.push("/utsav/history")}>
                <Ionicons name="time-outline" size={24} color={colors.ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        {empty ? (
          <View style={styles.intro}>
            <IconTile icon="sparkles" size={64} />
            <AppText variant="title" style={styles.center}>
              Namaste, I&apos;m Utsav
            </AppText>
            <AppText color={colors.muted} style={styles.center}>
              I can plan hosting, check your festivals and groups, and suggest clever fixes when you run short.
              I&apos;ll ask before I change anything.
            </AppText>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((text) => (
                <Chip key={text} label={text} onPress={() => send(text)} />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={list}
            data={state.messages}
            keyExtractor={(message) => message.id}
            renderItem={({ item }) => <MessageView message={item} pendingId={pending?.id} />}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            ListFooterComponent={footer}
            contentContainerStyle={[
              styles.content,
              isTablet && { width: layout.maxContentWidth, alignSelf: "center" },
            ]}
            keyboardShouldPersistTaps="handled"
            // Only the person's own scrolling changes whether we follow the newest text.
            onScrollBeginDrag={() => (following.current = false)}
            onScrollEndDrag={(e) => (following.current = nearBottom(e.nativeEvent))}
            onMomentumScrollEnd={(e) => (following.current = nearBottom(e.nativeEvent))}
            onContentSizeChange={() => following.current && list.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          />
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Composer
            householdId={household?.id}
            voiceEnabled={features.on("utsav_voice")}
            busy={busy}
            blocked={!!pending && !busy}
            attachments={attachments}
            attaching={readDocument.isPending}
            onAttach={features.on("document_upload") ? () => setPicking(true) : undefined}
            onRemoveAttachment={(index) => setAttachments((current) => current.filter((_, i) => i !== index))}
            onSend={(text, documents) => {
              following.current = true;
              send(text, documents);
              setAttachments([]);
            }}
            onStop={cancel}
          />
          <AppText variant="caption" color={colors.muted} style={styles.center}>
            Utsav can make mistakes. Check important details.
          </AppText>
        </View>
      </KeyboardAvoidingView>
      <PickSheet visible={picking} onPick={(source) => void attach(source)} onClose={() => setPicking(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  intro: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  center: { textAlign: "center" },
  suggestions: { gap: spacing.sm, alignItems: "center", marginTop: spacing.md },
  composer: { gap: 4 },
  headerButtons: { flexDirection: "row", gap: spacing.lg, paddingHorizontal: spacing.xs },
});
