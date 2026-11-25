import { View } from "react-native";

type Props = { value: number; total: number; color?: string; trackColor?: string };

export function ProgressBar({ value, total, color = "#FFFFFF", trackColor = "rgba(255,255,255,0.28)" }: Props) {
  const ratio = total > 0 ? Math.min(value / total, 1) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${value} of ${total} done`}
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={{ height: 8, borderRadius: 4, backgroundColor: trackColor, overflow: "hidden" }}
    >
      <View style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}
