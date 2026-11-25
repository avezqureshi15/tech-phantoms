import { Ionicons } from "@expo/vector-icons";
import { Alert, Linking, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import type { IconName } from "@/lib/meta";
import type { Track } from "@/lib/schemas";
import { colors, radius, spacing } from "@/lib/theme";

const KIND_ICON: Record<string, IconName> = {
  aarti: "flame",
  bhajan: "musical-notes",
  kirtan: "musical-notes",
  stotra: "book",
  mantra: "sparkles",
  chant: "sparkles",
  hymn: "musical-note",
  carol: "musical-note",
  recitation: "mic",
  naat: "mic",
};

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open that", "Check that the app or a browser is available, then try again.");
  }
}

/** Choose where to listen. The links are searches, so they open the person's own streaming app. */
function choose(track: Track) {
  Alert.alert(track.title, "Where would you like to listen?", [
    { text: "YouTube", onPress: () => void open(track.links.youtube) },
    { text: "Spotify", onPress: () => void open(track.links.spotify) },
    { text: "JioSaavn", onPress: () => void open(track.links.jiosaavn) },
  ]);
}

export function TrackRow({ track }: { track: Track }) {
  return (
    <Card onPress={() => choose(track)} accessibilityLabel={`${track.title}, ${track.theme}. Choose where to listen`}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Ionicons name={KIND_ICON[track.kind] ?? "musical-notes"} size={22} color={colors.maroon} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={2}>
            {track.title}
          </AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {track.theme} · {track.language}
            {track.performer ? ` · ${track.performer}` : ""}
          </AppText>
        </View>
        <Ionicons name="play-circle" size={30} color={colors.saffronDeep} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sand,
  },
});
