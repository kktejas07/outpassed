import { View } from "react-native";
import { color } from "../theme/tokens";

/**
 * The Outpass mark, "scan and go": three QR corners on an indigo tile, and
 * the fourth corner is a teal arrow heading out. Drawn on a 64-unit grid and
 * scaled, so it stays sharp at any size. Matches assets/icon.png.
 */
export function Mark({ size = 34, inverse, bare }: { size?: number; /** White tile with indigo corners, for indigo backgrounds. */ inverse?: boolean; /** No tile: white corners straight on the background (illustrations). */ bare?: boolean }) {
  const u = size / 64;
  const ink = inverse && !bare ? color.indigo : color.white;
  const finder = (x: number, y: number) => (
    <View
      key={`${x}-${y}`}
      style={{ position: "absolute", left: (x - 2.25) * u, top: (y - 2.25) * u, width: 21.5 * u, height: 21.5 * u, borderRadius: 6.5 * u, borderWidth: 4.5 * u, borderColor: ink, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: 6 * u, height: 6 * u, borderRadius: 1.5 * u, backgroundColor: ink }} />
    </View>
  );
  const bar = 6 * u;
  return (
    <View accessibilityLabel="Outpass" style={{ width: size, height: size, borderRadius: 18 * u, backgroundColor: bare ? "transparent" : inverse ? color.white : color.indigo, overflow: "hidden" }}>
      {finder(10, 10)}
      {finder(37, 10)}
      {finder(10, 37)}
      {/* The arrow's shaft, from (38.5, 38.5) to (52, 52) */}
      <View style={{ position: "absolute", left: (45.25 - 12.5) * u, top: 45.25 * u - bar / 2, width: 25 * u, height: bar, borderRadius: bar / 2, backgroundColor: color.accentLight, transform: [{ rotate: "45deg" }] }} />
      {/* Its head: the corner at (52.5, 52.5) */}
      <View style={{ position: "absolute", left: (42 - 3) * u, top: 52.5 * u - bar / 2, width: 16.5 * u, height: bar, borderRadius: bar / 2, backgroundColor: color.accentLight }} />
      <View style={{ position: "absolute", left: 52.5 * u - bar / 2, top: (42 - 3) * u, width: bar, height: 16.5 * u, borderRadius: bar / 2, backgroundColor: color.accentLight }} />
    </View>
  );
}
