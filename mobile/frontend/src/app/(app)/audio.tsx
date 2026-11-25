import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { TrackRow } from "@/components/TrackRow";
import { useAudio } from "@/features/queries";
import { festivalMeta } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

/** Music and chants for a festival, or for the person's own faiths when none is given. */
export default function AudioScreen() {
  const { festival } = useLocalSearchParams<{ festival?: string }>();
  const audio = useAudio(festival);

  if (!audio.data) {
    return audio.isError ? <ErrorState {...errorProps(audio.error)} onRetry={() => void audio.refetch()} /> : <ScreenSkeleton />;
  }

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{festival ? festivalMeta(festival).label : "Music for you"}</AppText>
        <AppText color={colors.muted}>
          Tap a track to open it in YouTube, Spotify or JioSaavn. Familiar pieces first.
        </AppText>
      </View>
      {audio.data.tracks.length === 0 ? (
        <View style={{ minHeight: 260 }}>
          <EmptyState icon="musical-notes" title="No music listed yet" message="We haven't added music for this one." />
        </View>
      ) : (
        audio.data.tracks.map((track) => <TrackRow key={track.id} track={track} />)
      )}
    </Screen>
  );
}
