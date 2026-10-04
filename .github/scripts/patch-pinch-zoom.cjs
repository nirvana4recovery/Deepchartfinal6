const fs = require('fs');
const nodePath = require('path');

// Resolve from this script, not process.cwd(). Railway runs the workspace
// package build from /app/artifacts/trading-journal.
const repoRoot = nodePath.resolve(__dirname, '../..');
const file = nodePath.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomChart.tsx');
let s = fs.readFileSync(file, 'utf8');

// Lightweight Charts native two-finger pinch is the sole zoom owner.
s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');

// Disable the custom time-scale mutation that was fighting native pinch.
const start = s.indexOf('    const applyPinchZoom = (t0: Touch, t1: Touch) => {');
const end = s.indexOf('    // ── touchstart capture', start);
if (start >= 0 && end > start) {
  const replacement = `    // Native Lightweight Charts owns two-finger pinch zoom.
    const applyPinchZoom = (_t0: Touch, _t1: Touch) => {};

`;
  s = s.slice(0, start) + replacement + s.slice(end);
}

// Do not intercept two-finger touchmove; let the native chart listener receive it.
const pinchMoveStart = s.indexOf('      if (e.touches.length >= 2) {');
if (pinchMoveStart >= 0) {
  const pinchMoveEnd = s.indexOf('      if (!ig) return;', pinchMoveStart);
  if (pinchMoveEnd > pinchMoveStart) {
    s = s.slice(0, pinchMoveStart) + `      if (e.touches.length >= 2) {
        return;
      }

` + s.slice(pinchMoveEnd);
  }
}

// Price-scale interaction: block the numeric label area, but make the
// chart/price-scale border (the LEFT edge of the right-side price axis) the
// only active strip. This is where the user grabs the scale to zoom vertically.
s = s.replace(/const PRICE_SCALE_TOUCH_W = 72;[^\n]*/,
  'const PRICE_SCALE_TOUCH_W = 72; // blocker width; only the leftmost 8px is the active scale handle');

const downMarker = '    e.preventDefault();\n    e.stopPropagation();\n\n    // Double-tap: clear zoom lock and restore autoScale + default margins';
if (s.includes(downMarker) && !s.includes('const ACTIVE_SCALE_HANDLE_W = 8;')) {
  s = s.replace(
    downMarker,
    `    e.preventDefault();\n    e.stopPropagation();\n\n    // Only the chart/price-scale border is interactive. The numeric price\n    // labels remain completely inert for tap/drag.\n    const rect = handlerRef.current?.getBoundingClientRect();\n    const ACTIVE_SCALE_HANDLE_W = 8;\n    if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;\n\n    // Double-tap: clear zoom lock and restore autoScale + default margins`
  );
}

const wheelMarker = `        e.preventDefault();\n        e.stopPropagation();\n        const step = Math.max(-120, Math.min(120, e.deltaY));`;
if (s.includes(wheelMarker)) {
  s = s.replace(
    wheelMarker,
    `        e.preventDefault();\n        e.stopPropagation();\n        const rect = handlerRef.current?.getBoundingClientRect();\n        const ACTIVE_SCALE_HANDLE_W = 8;\n        // Wheel/scroll only works on the chart/price-scale border.\n        if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;\n        const step = Math.max(-120, Math.min(120, e.deltaY));`
  );
}

s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');
fs.writeFileSync(file, s);
console.log('[chart-fix] Pinch fix + price-scale border-only interaction applied.');
