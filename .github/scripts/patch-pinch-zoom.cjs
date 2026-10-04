const fs = require('fs');
const nodePath = require('path');

// Resolve from this script, not process.cwd(). Railway runs the workspace
// package build from /app/artifacts/trading-journal.
const repoRoot = nodePath.resolve(__dirname, '../..');
const file = nodePath.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomChart.tsx');
let s = fs.readFileSync(file, 'utf8');

// Lightweight Charts native two-finger pinch is the sole pinch owner.
s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');

// Disable the custom time-scale mutation that was fighting native pinch.
const start = s.indexOf('    const applyPinchZoom = (t0: Touch, t1: Touch) => {');
const end = s.indexOf('    // ── touchstart capture', start);
if (start >= 0 && end > start) {
  const replacement = `    // Native Lightweight Charts owns two-finger pinch zoom.\n    const applyPinchZoom = (_t0: Touch, _t1: Touch) => {};\n\n`;
  s = s.slice(0, start) + replacement + s.slice(end);
}

// Do not intercept two-finger touchmove; let the native chart listener receive it.
const pinchMoveStart = s.indexOf('      if (e.touches.length >= 2) {');
if (pinchMoveStart >= 0) {
  const pinchMoveEnd = s.indexOf('      if (!ig) return;', pinchMoveStart);
  if (pinchMoveEnd > pinchMoveStart) {
    s = s.slice(0, pinchMoveStart) + `      if (e.touches.length >= 2) {\n        return;\n      }\n\n` + s.slice(pinchMoveEnd);
  }
}

// ── PRICE-SCALE ROOT-CAUSE FIX ──────────────────────────────────────────────
// The previous implementation used a fixed 72px overlay anchored to `right:0`.
// That is NOT the price-scale border: the actual border is at
//   container.right - chart.priceScale('right').width()
// and the measured width is already passed to this component as overrideWidth.
// Therefore the 10px handle was often several pixels away from the real border,
// especially when label width changed. Pointer/wheel events consequently never
// reached the active handler.
//
// Fix: make the overlay ONLY a 12px strip and place that strip exactly at the
// measured left edge of the right price scale. Numeric labels are outside the
// overlay, so they cannot trigger our handler. No coordinate hit-test is needed.
s = s.replace(
  /const touchW\s*=\s*PRICE_SCALE_TOUCH_W;/,
  'const scaleW = Math.max(0, overrideWidth ?? PRICE_SCALE_TOUCH_W);\n  const touchW = 12;'
);
s = s.replace(
  /right:\s*0,\n\s*bottom:\s*0,\n\s*width:\s*touchW,/,
  'right:         scaleW,\n        bottom:        0,\n        width:         touchW,'
);

// The handler itself is now exactly over the border, so remove stale left/right
// coordinate guards that could reject valid events due to rounding/sub-pixel layout.
s = s.replace(
  /\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = 10;\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/g,
  ''
);
s = s.replace(
  /\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = 8;\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/g,
  ''
);
s = s.replace(
  /\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = 8;\n\s*if \(!rect \|\| e\.clientX < rect\.right - ACTIVE_SCALE_HANDLE_W\) return;/g,
  ''
);

// Also remove any stale right-edge wheel guard left by an older patch.
s = s.replace(
  /\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = 10;\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/g,
  ''
);

s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');
fs.writeFileSync(file, s);
console.log('[chart-fix] Price-scale handle is anchored to the measured LWC right-axis border; numeric labels are inert.');
