import { Alert } from "react-native";
import { router } from "expo-router";

import { IconTile } from "@/components/IconTile";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { useActiveHousehold } from "@/features/queries";
import { useConversations, useDeleteConversation } from "@/features/utsav";
import { errorProps } from "@/lib/errors";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function HistoryScreen() {
  const { household } = useActiveHousehold();
  const chats = useConversations(household?.id);
  const remove = useDeleteConversation(household?.id);

  if (chats.isError) return <ErrorState {...errorProps(chats.error)} onRetry={() => void chats.refetch()} />;
  if (!chats.data) return <ScreenSkeleton />;

  return (
    <Screen refreshing={chats.isRefetching} onRefresh={() => void chats.refetch()}>
      {chats.data.length === 0 ? (
        <EmptyState
          icon="chatbubbles"
          title="No chats yet"
          message="Your conversations with Utsav show up here."
          actionLabel="Start a chat"
          onAction={() => router.back()}
        />
      ) : (
        chats.data.map((chat) => (
          <ListRow
            key={chat.id}
            leading={<IconTile icon="chatbubble-ellipses" />}
            title={chat.title}
            subtitle={when(chat.updated_at)}
            onPress={() => router.replace({ pathname: "/utsav", params: { conversation: chat.id } })}
            trailing={
              <Ionicons
                name="trash-outline"
                size={20}
                color={colors.muted}
                accessibilityRole="button"
                accessibilityLabel="Delete chat"
                onPress={() =>
                  Alert.alert("Delete this chat?", "It can't be recovered.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => remove.mutate(chat.id) },
                  ])
                }
              />
            }
          />
        ))
      )}
    </Screen>
  );
}
