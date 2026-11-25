import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { defaultGroupIcon, type GroupKind, type IconName } from "@/lib/meta";
import { colors } from "@/lib/theme";

type Props = {
  group: { kind: GroupKind; icon: string | null; color: string | null };
  size?: number;
};

/** A group's avatar: its emoji or symbol on its colour, or the kind's default if it chose none. */
export function GroupBadge({ group, size = 44 }: Props) {
  const background = group.color ?? colors.maroon;
  const isEmoji = group.icon?.startsWith("emoji:");
  const symbol = (group.icon?.startsWith("symbol:") ? group.icon.slice(7) : null) as IconName | null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isEmoji ? (
        <AppText style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{group.icon?.slice(6)}</AppText>
      ) : (
        <Ionicons name={symbol ?? defaultGroupIcon(group.kind)} size={size * 0.5} color={colors.white} />
      )}
    </View>
  );
}
