import { Modal, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { IconTile } from "@/components/IconTile";
import { ListRow } from "@/components/ListRow";
import type { PickSource } from "@/lib/pick";
import { colors, radius, spacing } from "@/lib/theme";

type Props = { visible: boolean; onPick: (source: PickSource) => void; onClose: () => void };

/** Where to get the document from. */
export function PickSheet({ visible, onPick, onClose }: Props) {
  const choose = (source: PickSource) => {
    onClose();
    onPick(source);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <AppText variant="heading">Add a document</AppText>
        <AppText variant="caption" color={colors.muted}>
          Utsav reads it so you can ask about it. The file itself is not kept.
        </AppText>
        <View style={styles.list}>
          <ListRow leading={<IconTile icon="camera" />} title="Take a photo" onPress={() => choose("camera")} />
          <ListRow leading={<IconTile icon="image" />} title="Choose a photo" onPress={() => choose("library")} />
          <ListRow leading={<IconTile icon="document" />} title="PDF or file" onPress={() => choose("file")} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  list: { gap: spacing.sm, paddingTop: spacing.sm },
});
