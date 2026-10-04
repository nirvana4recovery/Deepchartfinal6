import fs from "node:fs";

const path = "src/pages/charts.tsx";
let s = fs.readFileSync(path, "utf8");

const replacements = [
  // The Free Chart is a true viewport workspace: no app chrome around it.
  [
    'height: "100%", background: "#0a0a0a",',
    'height: "100dvh", minHeight: 0, width: "100vw", position: "fixed", inset: 0, zIndex: 9999, background: "#000000", overflow: "hidden",',
  ],
  // 48px TradingView/Free Chart top bar.
  [
    'height: 52, display: "flex", alignItems: "center",\n        background: "#0a0a0a",',
    'height: 48, display: "flex", alignItems: "center",\n        background: "#131722",',
  ],
  [
    'height: 48, display: "flex", alignItems: "center",\n        background: "#0a0a0a",',
    'height: 48, display: "flex", alignItems: "center",\n        background: "#131722",',
  ],
  // Chart canvas itself stays black; the chrome is #131722.
  [
    'className="flex flex-1 min-h-0" style={{ paddingBottom: bottomTotalH, touchAction: "none" }}',
    'className="flex flex-1 min-h-0" style={{ paddingBottom: bottomTotalH, touchAction: "none", background: "#131722", overflow: "hidden" }}',
  ],
  [
    'className="flex-1 min-w-0 flex relative" style={{ background: "#07110D", touchAction: "none", overflow: "hidden" }}',
    'className="flex-1 min-w-0 flex relative" style={{ background: "#000000", touchAction: "none", overflow: "hidden", borderTop: "1px solid #2a2e39" }}',
  ],
  // Free Chart left drawing rail is 56px wide.
  [
    '          <DrawingToolbar />',
    '          <div className="freechart-drawing-rail" style={{ width: 56, flex: "0 0 56px", height: "100%", background: "#131722", borderRight: "1px solid #2a2e39", zIndex: 20, display: "flex", alignItems: "stretch" }}><DrawingToolbar /></div>',
  ],
  // Default bottom panel is closed, leaving the 36px Free Chart status rail.
  [
    'bottomOpen: localStorage.getItem("tv_bot") !== "false",',
    'bottomOpen: localStorage.getItem("tv_bot") === "true",',
  ],
  [
    'const BOTTOM_MIN  = 90;',
    'const BOTTOM_MIN  = 36;',
  ],
  [
    'const BOTTOM_MAX  = 420;',
    'const BOTTOM_MAX  = 420;',
  ],
  [
    'height: "100%", background: "#0a0a0a",',
    'height: "100%", background: "#000000",',
  ],
  [
    'background: "rgba(57,91,67,0.15)",',
    'background: "#2a2e39",',
  ],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (s.includes(from)) {
    s = s.replace(from, to);
    changed++;
  }
}

// Keep the build patch idempotent and visible in the source for future passes.
if (!s.includes("FREECHART_LAYOUT_V2")) {
  const marker = '  // ── Toolbar icon button style (TradingView flat style)';
  const inject = `  // FREECHART_LAYOUT_V2: exact viewport shell, compact chrome, black canvas, 56px drawing rail, closed bottom panel by default.\n`;
  if (s.includes(marker)) s = s.replace(marker, inject + marker);
}

fs.writeFileSync(path, s);
console.log(`[freechart-layout] applied ${changed} source layout replacements`);
