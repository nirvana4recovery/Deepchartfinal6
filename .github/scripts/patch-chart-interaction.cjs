const fs = require('fs');
const path = 'artifacts/trading-journal/src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(path, 'utf8');
const original = s;

function once(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Patch target missing: ${label}`);
  s = s.replace(from, to);
}

once(
  '  const nearRealtimeRef  = useRef(true);\n',
  '  const nearRealtimeRef  = useRef(true);\n  // User viewport lock: explicit pan/zoom choices must remain stable while new candles form.\n  const manualViewportLockRef = useRef(false);\n',
  'manual viewport ref'
);

once(
  '    let crosshairLocked          = false; // crosshair pinned after touch lift\n',
  `    let crosshairLocked          = false; // crosshair pinned after touch lift\n\n    // Favorite/drawing/tool bars own their drag gestures. The chart gesture engine\n    // runs in capture phase, so these targets must be excluded before chart pan starts.\n    const isChartChromeTarget = (target: EventTarget | null): boolean => {\n      const el = target instanceof Element ? target : null;\n      if (!el) return false;\n      return !!el.closest('[data-chart-favorite-bar], [data-favorite-bar], [data-chart-toolbar], [data-drawing-toolbar], [data-tool-bar], [class*="favorite"], [class*="favourite"], [class*="toolbar"], [class*="Toolbar"]');\n    };\n`,
  'chart chrome guard'
);

once(
  '      // ── Price-scale zone (mouse only): dedicated handler owns the scale ─────\n',
  `      // Chart chrome owns its drag; never let the chart gesture engine capture it.\n      if (isChartChromeTarget(e.target)) return;\n\n      // ── Price-scale zone (mouse only): dedicated handler owns the scale ─────\n`,
  'chart chrome bypass'
);

once(
  '      if (e.clientY >= rect.bottom - TIME_SCALE_H) {\n        e.preventDefault();\n        e.stopPropagation();\n',
  `      if (e.clientY >= rect.bottom - TIME_SCALE_H) {\n        e.preventDefault();\n        e.stopPropagation();\n        manualViewportLockRef.current = true;\n`,
  'time scale manual lock'
);

once(
  '      // Prevent browser text-selection / native image-drag from stealing the pointer\n      e.preventDefault();\n',
  `      // Prevent browser text-selection / native image-drag from stealing the pointer\n      e.preventDefault();\n      manualViewportLockRef.current = true;\n`,
  'chart pan manual lock'
);

once(
  '      if (absX > absY && absX > 1) {\n        // Horizontal trackpad swipe — pan ourselves, block LWC entirely\n',
  `      if (absX > absY && absX > 1) {\n        // Horizontal trackpad swipe — pan ourselves, block LWC entirely\n        manualViewportLockRef.current = true;\n`,
  'wheel manual lock'
);

once(
  '      const currentBars = (range.to as number) - (range.from as number);\n      const ratio       = prevSpan / span;\n',
  `      // Pinch is an explicit viewport choice; do not auto-follow it.\n      manualViewportLockRef.current = true;\n      const currentBars = (range.to as number) - (range.from as number);\n      const ratio       = prevSpan / span;\n`,
  'pinch manual lock'
);

s = s.replace('Math.min(500_000, newBars)', 'Math.min(2_000_000, newBars)');
s = s.replace('if (bar.time > prevTickBarTime && nearRealtimeRef.current) {', 'if (bar.time > prevTickBarTime && nearRealtimeRef.current && !manualViewportLockRef.current) {');
s = s.replace('if (isNewBar && nearRealtimeRef.current) {', 'if (isNewBar && nearRealtimeRef.current && !manualViewportLockRef.current) {');

const loadMarker = '    nearRealtimeRef.current = true;\n    setChartCtx({ chart, candle: cs });\n';
if (s.includes(loadMarker) && !s.includes('manualViewportLockRef.current = false;')) {
  s = s.replace(loadMarker, '    nearRealtimeRef.current = true;\n    manualViewportLockRef.current = false;\n    setChartCtx({ chart, candle: cs });', 1);
}

if (s === original) {
  console.log('Chart interaction patch already present.');
} else {
  fs.writeFileSync(path, s);
  console.log('Chart interaction patch applied.');
}
