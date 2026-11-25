import { Image, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors } from "@/lib/theme";

type Props = { name: string; uri?: string | null; size?: number };

export function Avatar({ name, uri, size = 40 }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  const fontSize = size * 0.36;

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
      style={[
        box,
        {
          backgroundColor: colors.goldSoft,
          borderWidth: 1,
          borderColor: colors.marigold,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      {/* The line height grows with the letters: with the label style's fixed one, a large avatar cut the
          tops of its initials off. */}
      <AppText variant="label" color={colors.maroonDark} style={{ fontSize, lineHeight: Math.ceil(fontSize * 1.3) }}>
        {initials || "?"}
      </AppText>
    </View>
  );
}
