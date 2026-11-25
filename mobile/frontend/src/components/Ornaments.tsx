import Svg, { Circle, G, Path } from "react-native-svg";

type MandalaProps = { size: number; color?: string; opacity?: number };

const C = 100; // centre of the 200 x 200 drawing

const polar = (radius: number, degrees: number): [number, number] => {
  const a = ((degrees - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
};
const fix = (n: number) => n.toFixed(2);

/** A pointed lotus petal along the vertical axis from radius r0 (base) to r1 (tip). */
function petalPath(r0: number, r1: number, halfWidth: number): string {
  const length = r1 - r0;
  const y = (f: number) => fix(C - r0 - length * f);
  const left = (f: number, w: number) => `${fix(C - halfWidth * w)} ${y(f)}`;
  const right = (f: number, w: number) => `${fix(C + halfWidth * w)} ${y(f)}`;
  return (
    `M${C} ${fix(C - r0)} ` +
    `C${left(0.18, 1)} ${left(0.7, 0.85)} ${C} ${fix(C - r1)} ` +
    `C${right(0.7, 0.85)} ${right(0.18, 1)} ${C} ${fix(C - r0)} Z`
  );
}

const evenly = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => offset + (i * 360) / count);

/** Half-circle scallops around a ring, like the rim of a rangoli. */
function scallopPath(radius: number, count: number): string {
  const step = 360 / count;
  const chord = 2 * radius * Math.sin((step / 2) * (Math.PI / 180));
  return evenly(count)
    .map((angle) => {
      const [x1, y1] = polar(radius, angle);
      const [x2, y2] = polar(radius, angle + step);
      return `M${fix(x1)} ${fix(y1)} A${fix(chord / 2)} ${fix(chord / 2)} 0 0 1 ${fix(x2)} ${fix(y2)}`;
    })
    .join(" ");
}

const OUTER_PETAL = petalPath(48, 80, 11);
const OUTER_VEIN = petalPath(54, 74, 4.5);
const MID_PETAL = petalPath(30, 56, 8);
const INNER_PETAL = petalPath(15, 34, 6.5);
const SCALLOPS = scallopPath(92, 36);

/**
 * A traditional lotus mandala: scalloped rim, a ring of dots, three interlocking petal layers and
 * a star at the heart. Drawn from circles and bezier petals so it stays symmetrical at any size;
 * it is meant as a quiet watermark behind hero surfaces.
 */
export function Mandala({ size, color = "#FFFFFF", opacity = 0.14 }: MandalaProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" opacity={opacity} pointerEvents="none">
      <G fill="none" stroke={color} strokeWidth={0.9} strokeLinejoin="round">
        <Circle cx={C} cy={C} r={98} strokeWidth={1.2} />
        <Path d={SCALLOPS} />
        <Circle cx={C} cy={C} r={92} strokeWidth={0.6} />
        <Circle cx={C} cy={C} r={84} strokeWidth={0.6} />
        {evenly(72).map((angle) => {
          const [x, y] = polar(88, angle);
          return <Circle key={angle} cx={x} cy={y} r={0.9} fill={color} stroke="none" />;
        })}

        {evenly(16).map((angle) => (
          <G key={`outer-${angle}`} transform={`rotate(${angle} ${C} ${C})`}>
            <Path d={OUTER_PETAL} fill={color} fillOpacity={0.12} />
            <Path d={OUTER_VEIN} strokeWidth={0.6} />
          </G>
        ))}
        <Circle cx={C} cy={C} r={48} strokeWidth={0.6} />

        {evenly(16, 11.25).map((angle) => (
          <Path
            key={`mid-${angle}`}
            d={MID_PETAL}
            fill={color}
            fillOpacity={0.18}
            transform={`rotate(${angle} ${C} ${C})`}
          />
        ))}

        {evenly(8).map((angle) => (
          <Path
            key={`inner-${angle}`}
            d={INNER_PETAL}
            fill={color}
            fillOpacity={0.26}
            transform={`rotate(${angle} ${C} ${C})`}
          />
        ))}

        <Circle cx={C} cy={C} r={14} strokeWidth={0.7} />
        {evenly(8).map((angle) => {
          const [tx, ty] = polar(13, angle);
          const [lx, ly] = polar(5.5, angle - 22.5);
          const [rx, ry] = polar(5.5, angle + 22.5);
          return (
            <Path
              key={`star-${angle}`}
              d={`M${fix(lx)} ${fix(ly)} L${fix(tx)} ${fix(ty)} L${fix(rx)} ${fix(ry)}`}
              strokeWidth={0.7}
            />
          );
        })}
        <Circle cx={C} cy={C} r={3.2} fill={color} stroke="none" />
      </G>
    </Svg>
  );
}
