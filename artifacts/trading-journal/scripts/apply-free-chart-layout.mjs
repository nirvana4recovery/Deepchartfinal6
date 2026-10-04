import fs from "node:fs";

const path = "src/pages/charts.tsx";
let s = fs.readFileSync(path, "utf8");

const replacements = [
  [
    'height: "100%", background: "#0a0a0a",',
    'height: "100dvh", minHeight: 0, background: "#131722", overflow: "hidden",',
  ],
  [
    'height: 52, display: "flex", alignItems: "center",\n        background: "#0a0a0a",',
    'height: 48, display: "flex", alignItems: "center",\n        background: "#131722",',
  ],
  [
    'height: 48, display: "flex", alignItems: "center",\n        background: "#0a0a0a",',
    'height: 48, display: "flex", alignItems: "center",\n        background: "#131722",',
  ],
  [
    'className="flex flex-1 min-h-0" style={{ paddingBottom: bottomTotalH, touchAction: "none" }}',
    'className="flex flex-1 min-h-0" style={{ paddingBottom: bottomTotalH, touchAction: "none", background: "#131722", overflow: "hidden" }}',
  ],
  [
    'className="flex-1 min-w-0 flex relative" style={{ background: "#07110D", touchAction: "none", overflow: "hidden" }}',
    'className="flex-1 min-w-0 flex relative" style={{ background: "#131722", touchAction: "none", overflow: "hidden", borderTop: "1px solid #2a2e39" }}',
  ],
  [
    '          <DrawingToolbar />',
    '          <div className="freechart-drawing-rail" style={{ width: 44, flex: "0 0 44px", height: "100%", background: "#131722", borderRight: "1px solid #2a2e39", zIndex: 20 }}><DrawingToolbar /></div>',
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

// Make the shell idempotent and ensure the intended Free Chart viewport rules are
// present even if a prior styling pass changed the surrounding markup.
if (!s.includes("FREECHART_LAYOUT_V1")) {
  const marker = '  // ── Toolbar icon button style (TradingView flat style)';
  const inject = `  // FREECHART_LAYOUT_V1: viewport-locked chart workspace matching The Free Chart shell.\n`;
  if (s.includes(marker)) s = s.replace(marker, inject + marker);
}

fs.writeFileSync(path, s);
console.log(`[freechart-layout] applied ${changed} source layout replacements`);
