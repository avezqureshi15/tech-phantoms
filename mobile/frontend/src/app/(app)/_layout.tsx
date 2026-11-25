import { Stack } from "expo-router";
import { View } from "react-native";

import { ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useActiveHousehold } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { deviceTimeZone } from "@/lib/clock";
import { ClockProvider } from "@/lib/clock-context";
import { colors, fonts } from "@/lib/theme";

const headerOptions = {
  headerStyle: { backgroundColor: colors.cream },
  headerTintColor: colors.maroon,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal" as const,
  contentStyle: { backgroundColor: colors.cream },
};

export default function AppLayout() {
  const { household, data, isError, error, refetch } = useActiveHousehold();
  const { user } = useAuth();
  // The faith question comes first, once, before anything else is shown.
  const needsFaith = !!user && !user.faith_chosen;

  // Only block the app when there is nothing to show; a failed background refetch
  // must not replace data the user is already looking at.
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        {isError ? <ErrorState {...errorProps(error)} onRetry={() => void refetch()} /> : <ScreenSkeleton />}
      </View>
    );
  }

  const hasHousehold = !!household;
  const ready = !needsFaith && hasHousehold;

  return (
    <ClockProvider timeZone={household?.timezone ?? deviceTimeZone()}>
      <Stack screenOptions={headerOptions}>
      <Stack.Protected guard={needsFaith}>
        <Stack.Screen name="onboarding/faith" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="festival/[id]/index" options={{ title: "" }} />
        <Stack.Screen name="festival/[id]/add-event" options={{ title: "Add event", presentation: "modal" }} />
        <Stack.Screen name="festival/new" options={{ title: "New festival", presentation: "modal" }} />
        <Stack.Screen name="tradition/[id]" options={{ title: "" }} />
        <Stack.Screen name="tradition/new" options={{ title: "New tradition", presentation: "modal" }} />
        <Stack.Screen name="member/new" options={{ title: "Add family member", presentation: "modal" }} />
        <Stack.Screen name="member/[userId]" options={{ title: "Family member", presentation: "modal" }} />
        <Stack.Screen name="group/index" options={{ title: "Your groups", presentation: "modal" }} />
        <Stack.Screen name="group/new" options={{ title: "New group", presentation: "modal" }} />
        <Stack.Screen name="expense/new" options={{ title: "Add expense", presentation: "modal" }} />
        <Stack.Screen name="profile" options={{ title: "Your profile" }} />
        <Stack.Screen name="support" options={{ title: "Get a call back", presentation: "modal" }} />
        <Stack.Screen name="expense/[id]" options={{ title: "Expense", presentation: "modal" }} />
        <Stack.Screen name="search" options={{ title: "Search", presentation: "modal" }} />
        <Stack.Screen name="audio" options={{ title: "Music", presentation: "modal" }} />
        <Stack.Screen name="utsav/index" options={{ title: "Utsav", presentation: "modal" }} />
        <Stack.Screen name="utsav/history" options={{ title: "Past chats" }} />
        <Stack.Screen name="voice" options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="appearance" options={{ title: "Appearance", presentation: "modal" }} />
      </Stack.Protected>
      <Stack.Protected guard={!needsFaith && !hasHousehold}>
        <Stack.Screen name="household/new" options={{ headerShown: false }} />
      </Stack.Protected>
      </Stack>
    </ClockProvider>
  );
}
