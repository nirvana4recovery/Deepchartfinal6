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

s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');
fs.writeFileSync(file, s);
console.log('[chart-fix] Pinch fix applied: native Lightweight Charts pinch is the sole zoom owner.');
