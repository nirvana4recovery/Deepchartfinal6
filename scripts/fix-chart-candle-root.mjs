import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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

const sessionPatch = path.join(repoRoot, "artifacts/trading-journal/patch-market-sessions.cjs");
let patchText = fs.readFileSync(sessionPatch, "utf8");
patchText = patchText.replace(/const key = .*startEpoch.*;/, '      const key = session.name + ":" + startEpoch;');
patchText = patchText.replace(/<g key=\{.*?\}>/, '<g key={z.label + "-" + z.startTime + "-" + i}>');
patchText = patchText.replace("const SMCOverlayconst SMCOverlay", "const SMCOverlay");
fs.writeFileSync(sessionPatch, patchText);

execFileSync(process.execPath, [sessionPatch], { stdio: "inherit", cwd: repoRoot });

// The session result is stored in a ref. Bridge store changes to a React
// render so Inputs/Style changes are applied immediately to the SVG overlay.
const sessionRenderFix = path.join(repoRoot, "artifacts/trading-journal/fix-market-sessions-render.cjs");
execFileSync(process.execPath, [sessionRenderFix], { stdio: "inherit", cwd: repoRoot });

// Keep custom indicator/session SVG geometry on the same animation frame as
// Lightweight Charts. React state rerenders can lag during touch scrolling.
const indicatorOverlayPatch = path.join(repoRoot, "artifacts/trading-journal/fix-indicator-overlay-sync.cjs");
execFileSync(process.execPath, [indicatorOverlayPatch], { stdio: "inherit", cwd: repoRoot });
