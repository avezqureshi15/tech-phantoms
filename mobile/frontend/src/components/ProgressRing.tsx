import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppText } from "@/components/AppText";

type Props = {
  value: number;
  total: number;
  size?: number;
  color?: string;
  trackColor?: string;
  textColor?: string;
};

export function ProgressRing({
  value,
  total,
  size = 64,
  color = "#FFFFFF",
  trackColor = "rgba(255,255,255,0.28)",
  textColor = "#FFFFFF",
}: Props) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(value / total, 1) : 0;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${value} of ${total} done`}
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText variant="label" color={textColor}>
        {value}/{total}
      </AppText>
    </View>
  );
}
