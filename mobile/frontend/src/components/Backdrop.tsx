import { StyleSheet, View } from "react-native";

import { PatternArt } from "@/components/Patterns";
import { usePattern } from "@/lib/appearance";
import { colors } from "@/lib/theme";

const SIZE = 460;

/**
 * A flat canvas with the person's pattern faintly inked off the top corner. It is not decoration for
 * its own sake: glass (the tab bar, header pills) needs something behind it to refract, and over a
 * perfectly flat page it just looks white.
 */
export function Backdrop() {
  const pattern = usePattern();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.cream, overflow: "hidden" }]}>
      {pattern !== "none" ? (
        <View style={{ position: "absolute", right: -SIZE * 0.42, top: -SIZE * 0.3 }}>
          <PatternArt id={pattern} size={SIZE} color={colors.saffronDeep} opacity={0.12} />
        </View>
      ) : null}
    </View>
  );
}
