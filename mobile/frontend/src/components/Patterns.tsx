import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { Mandala } from "@/components/Ornaments";
import { usePattern, type PatternId } from "@/lib/appearance";
import { radius } from "@/lib/theme";

type Art = { size: number; color: string; opacity: number };

const C = 100; // centre of the 200 x 200 drawing
const fix = (n: number) => n.toFixed(2);
const polar = (r: number, degrees: number): [number, number] => {
  const a = ((degrees - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const evenly = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => offset + (i * 360) / count);

function Frame({ size, opacity, children }: Pick<Art, "size" | "opacity"> & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" opacity={opacity} pointerEvents="none">
      {children}
    </Svg>
  );
}

// ---- Rangoli: a diamond of dots with a ring of loops, like a pulli kolam -------------------------
const STEP = 20;
const LATTICE = (() => {
  const points: { i: number; j: number; loop: boolean }[] = [];
  for (let i = -4; i <= 4; i++)
    for (let j = -4; j <= 4; j++)
      if (Math.abs(i) + Math.abs(j) <= 4) points.push({ i, j, loop: (((i + j) % 2) + 2) % 2 === 0 });
  return points;
})();

function Rangoli({ size, color, opacity }: Art) {
  // Neighbouring loop centres are STEP * sqrt(2) apart, so loops of half that radius just touch.
  const loopRadius = (STEP * Math.SQRT2) / 2;
  return (
    <Frame size={size} opacity={opacity}>
      <G fill="none" stroke={color} strokeWidth={0.9}>
        <Circle cx={C} cy={C} r={97} strokeWidth={1.2} />
        <Circle cx={C} cy={C} r={93} strokeWidth={0.6} />
        {evenly(48).map((angle) => {
          const [x, y] = polar(95, angle);
          return <Circle key={angle} cx={x} cy={y} r={0.8} fill={color} stroke="none" />;
        })}
        {LATTICE.map(({ i, j, loop }) => {
          const x = C + i * STEP;
          const y = C + j * STEP;
          return loop ? (
            <G key={`${i}:${j}`}>
              <Circle cx={x} cy={y} r={loopRadius} fill={color} fillOpacity={0.06} />
              <Circle cx={x} cy={y} r={1.5} fill={color} stroke="none" />
            </G>
          ) : (
            <Circle key={`${i}:${j}`} cx={x} cy={y} r={2.2} fill={color} stroke="none" />
          );
        })}
      </G>
    </Frame>
  );
}

// ---- Jaali: a lattice of eight-pointed stars, as carved in Mughal stone screens ------------------
const CELL = 50;
const CELLS = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => ({ x: CELL / 2 + i * CELL, y: CELL / 2 + j * CELL })));
const GRID = "M0 50H200M0 100H200M0 150H200M50 0V200M100 0V200M150 0V200";

function Jaali({ size, color, opacity }: Art) {
  return (
    <Frame size={size} opacity={opacity}>
      <G fill="none" stroke={color} strokeWidth={0.8}>
        <Rect x={0.5} y={0.5} width={199} height={199} strokeWidth={1.2} />
        <Path d={GRID} strokeWidth={0.5} />
        {[50, 100, 150].flatMap((x) => [50, 100, 150].map((y) => <Circle key={`${x}:${y}`} cx={x} cy={y} r={3} />))}
        {CELLS.map(({ x, y }) => (
          <G key={`${x}:${y}`}>
            <Rect x={-13} y={-13} width={26} height={26} fill={color} fillOpacity={0.08} transform={`translate(${x} ${y})`} />
            <Rect x={-13} y={-13} width={26} height={26} fill={color} fillOpacity={0.08} transform={`translate(${x} ${y}) rotate(45)`} />
            <Circle cx={x} cy={y} r={4} />
          </G>
        ))}
      </G>
    </Frame>
  );
}

// ---- Paisley: a ring of buta around a small rosette ----------------------------------------------
// One paisley, base at the origin, tip pointing up (-y), with a curl inside the base.
const PAISLEY =
  "M0 -34 C14 -22 18 -2 9 10 C3 18 -8 18 -12 10 C-15 3 -9 -4 -3 -2 C1 0 1 6 -3 7";

function Paisley({ size, color, opacity }: Art) {
  return (
    <Frame size={size} opacity={opacity}>
      <G fill="none" stroke={color} strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round">
        <Circle cx={C} cy={C} r={98} strokeWidth={1.2} />
        {evenly(36).map((angle) => {
          const [x, y] = polar(93, angle);
          return <Circle key={angle} cx={x} cy={y} r={0.9} fill={color} stroke="none" />;
        })}
        {evenly(12).map((angle) => (
          <G key={angle} transform={`rotate(${angle} ${C} ${C})`}>
            <Path d={PAISLEY} fill={color} fillOpacity={0.14} transform={`translate(${C} ${C - 52})`} />
          </G>
        ))}
        {evenly(12, 15).map((angle) => {
          const [x, y] = polar(70, angle);
          return <Circle key={angle} cx={x} cy={y} r={2.4} fill={color} fillOpacity={0.5} stroke="none" />;
        })}
        <Circle cx={C} cy={C} r={30} strokeWidth={0.7} />
        {evenly(8).map((angle) => {
          const [x, y] = polar(19, angle);
          return <Circle key={angle} cx={x} cy={y} r={6} fill={color} fillOpacity={0.12} />;
        })}
        <Circle cx={C} cy={C} r={5} fill={color} stroke="none" />
      </G>
    </Frame>
  );
}

// ---- Surya: the sun wheel of Konark -------------------------------------------------------------
function Surya({ size, color, opacity }: Art) {
  return (
    <Frame size={size} opacity={opacity}>
      <G fill="none" stroke={color} strokeWidth={0.9} strokeLinecap="round">
        <Circle cx={C} cy={C} r={98} strokeWidth={1.2} />
        <Circle cx={C} cy={C} r={86} strokeWidth={0.6} />
        <Circle cx={C} cy={C} r={70} strokeWidth={0.8} />
        {evenly(60).map((angle) => {
          const [x, y] = polar(92, angle);
          return <Circle key={angle} cx={x} cy={y} r={0.9} fill={color} stroke="none" />;
        })}
        {evenly(16).map((angle) => {
          const [x1, y1] = polar(24, angle);
          const [x2, y2] = polar(70, angle);
          const [bx, by] = polar(78, angle + 11.25);
          return (
            <G key={angle}>
              <Path d={`M${fix(x1)} ${fix(y1)} L${fix(x2)} ${fix(y2)}`} strokeWidth={1.6} />
              <Circle cx={bx} cy={by} r={5} fill={color} fillOpacity={0.12} />
            </G>
          );
        })}
        <Circle cx={C} cy={C} r={24} fill={color} fillOpacity={0.1} />
        {evenly(8).map((angle) => {
          const [x, y] = polar(15, angle);
          return <Circle key={angle} cx={x} cy={y} r={3} />;
        })}
        <Circle cx={C} cy={C} r={6} fill={color} stroke="none" />
      </G>
    </Frame>
  );
}

export const PATTERNS: readonly { id: PatternId; label: string; hint: string }[] = [
  { id: "lotus", label: "Lotus", hint: "A mandala of layered petals" },
  { id: "rangoli", label: "Rangoli", hint: "Dots and loops, kolam style" },
  { id: "jaali", label: "Jaali", hint: "Stars from carved stone screens" },
  { id: "paisley", label: "Paisley", hint: "A ring of buta motifs" },
  { id: "surya", label: "Sun wheel", hint: "The chakra of Konark" },
  { id: "none", label: "Plain", hint: "No pattern at all" },
];

/** One piece of line art, drawn in a single colour. Returns nothing for the plain choice. */
export function PatternArt({ id, size, color = "#FFFFFF", opacity = 0.16 }: { id: PatternId; size: number; color?: string; opacity?: number }) {
  switch (id) {
    case "lotus":
      return <Mandala size={size} color={color} opacity={opacity} />;
    case "rangoli":
      return <Rangoli size={size} color={color} opacity={opacity} />;
    case "jaali":
      return <Jaali size={size} color={color} opacity={opacity} />;
    case "paisley":
      return <Paisley size={size} color={color} opacity={opacity} />;
    case "surya":
      return <Surya size={size} color={color} opacity={opacity} />;
    case "none":
      return null;
  }
}

type SurfaceProps = {
  /** A solid colour. Depth comes from the line art on it, not from a gradient. */
  color: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  size?: number;
};

/** A hero surface: a solid colour with the person's chosen pattern bleeding off one corner. */
export function PatternSurface({ color, children, style, size = 300 }: SurfaceProps) {
  const pattern = usePattern();
  return (
    <View style={[{ backgroundColor: color, borderRadius: radius.lg, overflow: "hidden" }, style]}>
      {pattern !== "none" ? (
        <View pointerEvents="none" style={{ position: "absolute", right: -size * 0.28, top: -size * 0.28 }}>
          <PatternArt id={pattern} size={size} />
        </View>
      ) : null}
      {children}
    </View>
  );
}
