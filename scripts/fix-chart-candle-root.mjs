import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Railway runs this before the trading-journal build. Keep it strictly
// idempotent: the source is already patched in Git, so this step must never
// fail just because a previous build already applied the same change.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChart.tsx");
const text = fs.readFileSync(file, "utf8");

const spacing = /minBarSpacing:\s*[^,]+,/;
if (!spacing.test(text)) throw new Error("Chart minBarSpacing option not found");

let next = text.replace(spacing, "minBarSpacing:   0.01,");
if (!/maxBarSpacing:\s*5000,/.test(next)) {
  next = next.replace("minBarSpacing:   0.01,", "minBarSpacing:   0.01,\n        maxBarSpacing:   5000,", 1);
}

if (next !== text) fs.writeFileSync(file, next);
console.log("[chart-fix] horizontal candle spacing normalized: min=0.01 max=5000");
