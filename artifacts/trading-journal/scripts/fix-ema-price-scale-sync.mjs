import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// scripts/ is three levels below the repository root:
// artifacts/trading-journal/scripts -> artifacts -> repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChart.tsx");
const source = fs.readFileSync(file, "utf8");

const oldBlock = `        const s = chart.addSeries(LineSeries, {
          color: EMA_COLORS[key], lineWidth: 1,
          priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: false,
        });`;

const newBlock = `        // Keep legacy EMA/VWAP overlays on the exact same price scale as candles.
        // The chart supports custom vertical price-scale zoom via the main candle
        // series' autoscaleInfoProvider. Without the same provider on indicators,
        // Lightweight Charts unions their natural range with the candle range and
        // the EMA lines can resist/fight the user's zoom.
        const s = chart.addSeries(LineSeries, {
          color: EMA_COLORS[key], lineWidth: 1,
          priceScaleId: "right",
          priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: false,
          autoscaleInfoProvider: () => {
            const range = getPanRange(panScope);
            return range ? { priceRange: { minValue: range.lo, maxValue: range.hi } } : null;
          },
        });`;

if (source.includes('priceScaleId: "right"') && source.includes('getPanRange(panScope)')) {
  console.log("[ema-fix] already applied");
  process.exit(0);
}
if (!source.includes(oldBlock)) {
  throw new Error("[ema-fix] EMA series creation block not found; refusing to patch blindly");
}

fs.writeFileSync(file, source.replace(oldBlock, newBlock));
console.log("[ema-fix] EMA overlays now follow the candle price-scale zoom");
