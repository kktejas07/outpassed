import QRCode from "qrcode";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { color } from "../theme/tokens";

/**
 * Renders a QR code as rows of Views (no SVG dependency). Each row merges runs
 * of dark modules into one View to keep the element count low.
 */
export const QrCode = memo(function QrCode({ value, size = 220, fg = color.ink }: { value: string; size?: number; fg?: string }) {
  const rows = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    const out: { y: number; runs: [number, number][] }[] = [];
    for (let y = 0; y < n; y++) {
      const runs: [number, number][] = [];
      let start = -1;
      for (let x = 0; x <= n; x++) {
        const on = x < n && data[y * n + x] === 1;
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          runs.push([start, x - start]);
          start = -1;
        }
      }
      out.push({ y, runs });
    }
    return { n, out };
  }, [value]);

  const cell = size / rows.n;
  return (
    <View style={{ width: size, height: size, backgroundColor: color.white }} accessibilityLabel="Gate pass QR code" accessible>
      {rows.out.map(({ y, runs }) =>
        runs.map(([x, w]) => (
          <View
            key={`${y}-${x}`}
            style={{ position: "absolute", left: x * cell, top: y * cell, width: w * cell + 0.5, height: cell + 0.5, backgroundColor: fg }}
          />
        )),
      )}
    </View>
  );
});
