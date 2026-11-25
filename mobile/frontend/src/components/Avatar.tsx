import { Image, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors } from "@/lib/theme";

type Props = { name: string; uri?: string | null; size?: number };

export function Avatar({ name, uri, size = 40 }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={box} accessibilityLabel={name} />;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <View
      accessibilityLabel={name}
      style={[box, { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.marigold, alignItems: "center", justifyContent: "center" }]}
    >
      <AppText variant="label" color={colors.maroonDark} style={{ fontSize: size * 0.36 }}>
        {initials || "?"}
      </AppText>
    </View>
  );
}
