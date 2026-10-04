import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Railway runs this before the trading-journal build. Keep it strictly
// idempotent: the source is already patched in Git, so this step must never
// fail just because a previous build already applied the same change.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChart.tsx");
let text = fs.readFileSync(file, "utf8");

// Normalize chart spacing without accumulating duplicate object keys across
// repeated Railway builds/patch passes.
const spacing = /minBarSpacing:\s*[^,]+,/;
if (!spacing.test(text)) throw new Error("Chart minBarSpacing option not found");

let next = text.replace(spacing, "minBarSpacing:   0.01,");
if (!/maxBarSpacing:\s*5000,/.test(next)) {
  next = next.replace("minBarSpacing:   0.01,", "minBarSpacing:   0.01,\n        maxBarSpacing:   5000,", 1);
}

// Older patch passes accidentally repeated these two time-scale options many
// times. Collapse each contiguous run to exactly one pair before Vite parses
// the object literal. This is intentionally idempotent.
const duplicateScalePair = /(\n\s{8}allowShiftVisibleRangeOnWhitespaceReplacement:\s*false,\n\s{8}shiftVisibleRangeOnNewBar:\s*false,)(?:\n\s{8}allowShiftVisibleRangeOnWhitespaceReplacement:\s*false,\n\s{8}shiftVisibleRangeOnNewBar:\s*false,)+/g;
next = next.replace(duplicateScalePair, "$1");

if (next !== text) fs.writeFileSync(file, next);
console.log("[chart-fix] normalized time-scale options: min=0.01 max=5000; duplicate scale keys collapsed");

// Keep custom indicator SVG geometry synchronized without any Market Sessions
// specific hooks. Unrelated indicator behavior remains unchanged.
const indicatorOverlayPatch = path.join(repoRoot, "artifacts/trading-journal/fix-indicator-overlay-sync.cjs");
if (fs.existsSync(indicatorOverlayPatch)) {
  execFileSync(process.execPath, [indicatorOverlayPatch], { stdio: "inherit", cwd: repoRoot });
}

// Settings changes update Zustand; keep the generic indicator settings bridge
// runtime-safe and idempotent. No session-specific behavior is injected here.
const indicatorSettingsFix = path.join(repoRoot, "artifacts/trading-journal/fix-indicator-settings-runtime.cjs");
if (fs.existsSync(indicatorSettingsFix)) {
  execFileSync(process.execPath, [indicatorSettingsFix], { stdio: "inherit", cwd: repoRoot });
}

// ── Instant trendline / drawing creation ──────────────────────────────────────
// The second-point tap must render locally immediately. Never block pointer-up
// on POST /api/drawings; persist in the background and reconcile the temporary
// id with the database id after the request completes.
const overlayFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(overlayFile)) throw new Error(`Drawing overlay file not found: ${overlayFile}`);

let overlay = fs.readFileSync(overlayFile, "utf8");
let overlayChanged = false;

const oldSaveDrawing = `  const saveDrawing = async (pts: DrawingPoint[]) => {
    try {
      const res = await fetch(\`\${BASE}/api/drawings\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
      });
      if (res.ok) {
        const saved: Drawing = await res.json();
        addDrawing(saved);
        // Auto-select the newly placed drawing so the toolbar appears immediately
        selectDrawing(saved.id);
      }
    } catch { /* ignore */ }
  };`;

const newSaveDrawing = `  const saveDrawing = async (pts: DrawingPoint[]) => {
    // OPTIMISTIC: render immediately; never block the second-point tap on network I/O.
    const tempId = -Math.max(1, Date.now());
    const optimistic: Drawing = {
      id: tempId, symbol, timeframe, toolType: activeTool, points: pts,
      style: activeStyle, isLocked: false, isVisible: true,
      createdAt: new Date().toISOString(),
    };
    addDrawing(optimistic);
    selectDrawing(tempId);

    try {
      const res = await fetch(\`\${BASE}/api/drawings\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
      });
      if (res.ok) {
        const saved: Drawing = await res.json();
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.map(d => d.id === tempId ? saved : d));
        selectDrawing(saved.id);
      } else {
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.filter(d => d.id !== tempId));
        selectDrawing(null);
      }
    } catch {
      const current = useDrawingStore.getState().drawings;
      useDrawingStore.getState().setDrawings(current.filter(d => d.id !== tempId));
      selectDrawing(null);
    }
  };`;

if (overlay.includes(oldSaveDrawing)) {
  overlay = overlay.replace(oldSaveDrawing, newSaveDrawing);
  overlayChanged = true;
} else if (!overlay.includes("OPTIMISTIC: render immediately")) {
  throw new Error("Drawing save block not found; refusing to skip the latency fix");
}

if (overlay.includes("await saveDrawing(")) {
  overlay = overlay.replaceAll("await saveDrawing(", "void saveDrawing(");
  overlayChanged = true;
}

if (overlayChanged) {
  fs.writeFileSync(overlayFile, overlay);
  console.log("[chart-fix] Applied instant optimistic drawing creation");
} else {
  console.log("[chart-fix] Instant drawing creation already present");
}
