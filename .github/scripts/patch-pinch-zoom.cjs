const fs = require('fs');

const path = 'artifacts/trading-journal/src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(path, 'utf8');

// ROOT FIX: Lightweight Charts 5.2 already has native two-finger pinch.
// The previous build-time patch disabled it and continuously called
// setVisibleLogicalRange() from a custom touch loop, which caused jitter and
// could prevent visible zoom. Native LWC pinch is now the sole zoom owner.
s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');

// Disable the custom time-scale mutation while keeping the rest of the
// single-finger gesture engine intact.
const start = s.indexOf('    const applyPinchZoom = (t0: Touch, t1: Touch) => {');
const end = s.indexOf('    // ── touchstart capture', start);
if (start >= 0 && end > start) {
  const replacement = `    // Native Lightweight Charts owns two-finger pinch zoom.
    const applyPinchZoom = (_t0: Touch, _t1: Touch) => {};

`;
  s = s.slice(0, start) + replacement + s.slice(end);
}

// Do not intercept the two-finger touchmove; let the native LWC listener
// receive the complete gesture stream.
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

// Runtime orientation recovery must preserve native pinch.
s = s.replace(/pinch\s*:\s*false/g, 'pinch: true');

fs.writeFileSync(path, s);
console.log('Pinch fix applied: native Lightweight Charts pinch is the sole zoom owner.');
