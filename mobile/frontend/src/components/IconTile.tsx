import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import type { Gradient, IconName } from "@/lib/meta";
import { colors } from "@/lib/theme";

type Props = {
  icon: IconName;
  /** Only its first colour is used: it tints the tile and the icon, so every row reads the same. */
  gradient?: Gradient;
  tint?: string;
  size?: number;
};

/** The rounded icon tile every list row, stat and picker leads with. */
export function IconTile({ icon, gradient, tint = colors.saffronDeep, size = 44 }: Props) {
  const color = gradient ? gradient[0] : tint;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: `${color}1A`,
      }}
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
    </View>
  );
}
