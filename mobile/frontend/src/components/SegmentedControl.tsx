import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, MIN_TOUCH, radius, softShadow } from "@/lib/theme";

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Pick one of a few mutually exclusive options (an equal or an exact split, for example). */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(option.value);
              }
            }}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText variant="label" color={selected ? colors.maroon : colors.muted} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", backgroundColor: "rgba(94,22,38,0.07)", borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: MIN_TOUCH - 6, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 3, paddingHorizontal: 10 },
  selected: { backgroundColor: "#FFFFFF", ...softShadow },
});
