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

// Price-scale interaction: the numeric price-label area is blocked, while ONLY
// the chart/price-scale border (the LEFT edge of the right-side price axis) is
// an active vertical-scale handle. Keep the full overlay so native axis gestures
// cannot leak through from the numeric labels.
s = s.replace(/const PRICE_SCALE_TOUCH_W = 72;[^\n]*/,
  'const PRICE_SCALE_TOUCH_W = 72; // blocker width; only the leftmost 10px is the active scale handle');

// IMPORTANT: earlier revisions accidentally used the RIGHT edge for pointer
// drag. Normalize both old and new variants to the LEFT-edge handle.
s = s.replace(
  /const ACTIVE_SCALE_HANDLE_W = 8;\s*\n\s*if \(!rect \|\| e\.clientX < rect\.right - ACTIVE_SCALE_HANDLE_W\) return;/g,
  'const ACTIVE_SCALE_HANDLE_W = 10;\n    if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;'
);
s = s.replace(
  /const ACTIVE_SCALE_HANDLE_W = 8;\s*\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/g,
  'const ACTIVE_SCALE_HANDLE_W = 10;\n    if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;'
);

// Normalize wheel handling too: wheel/trackpad scrolling is accepted only on
// the same LEFT-edge handle, with both scroll directions preserved via deltaY.
s = s.replace(
  /const ACTIVE_SCALE_HANDLE_W = 8;\s*\n\s*\/\/ Wheel\/scroll only works on the chart\/price-scale border\.\s*\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/g,
  'const ACTIVE_SCALE_HANDLE_W = 10;\n        // Wheel/scroll only works on the chart/price-scale border.\n        if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;'
);

// If the source contains the old right-edge wheel guard, normalize it as well.
s = s.replace(
  /const ACTIVE_SCALE_HANDLE_W = 8;\s*\n\s*if \(!rect \|\| e\.clientX > rect\.right - ACTIVE_SCALE_HANDLE_W\) return;/g,
  'const ACTIVE_SCALE_HANDLE_W = 10;\n        if (!rect || e.clientX > rect.left + ACTIVE_SCALE_HANDLE_W) return;'
);

s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');
fs.writeFileSync(file, s);
console.log('[chart-fix] Price-scale vertical zoom normalized to the LEFT border handle; numeric labels remain inert.');
