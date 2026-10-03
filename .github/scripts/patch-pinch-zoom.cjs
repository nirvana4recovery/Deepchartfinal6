const fs = require('fs');

const path = 'artifacts/trading-journal/src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('    const applyPinchZoom = (t0: Touch, t1: Touch) => {');
const end = s.indexOf('    // ── touchstart capture', start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Pinch zoom patch target not found');
}

// The app has its own pinch handler. Lightweight Charts also has a native
// pinch handler by default; running both causes the visible shake/jitter and
// makes each frame fight over the visible logical range. Disable only the
// native pinch gesture and keep wheel/mouse scaling untouched.
const nativePinchOption = /handleScale\s*:\s*\{([^}]*)\}/m;
if (nativePinchOption.test(s)) {
  s = s.replace(nativePinchOption, (m, body) => {
    const cleaned = body.replace(/\bpinch\s*:\s*[^,}]+,?/g, '');
    return `handleScale: { pinch: false,${cleaned}`;
  });
} else {
  const marker = 'createChart(container, {';
  const pos = s.indexOf(marker);
  if (pos >= 0) {
    s = s.slice(0, pos + marker.length) + '\n      handleScale: { pinch: false },' + s.slice(pos + marker.length);
  } else {
    throw new Error('createChart options target not found');
  }
}

const replacement = `    // Keep one immutable logical/screen anchor for the entire pinch gesture.
    // Native Lightweight Charts pinch is disabled above; this handler is the
    // single owner of two-finger scaling, preventing frame-to-frame fighting.
    let pinchAnchorLogical: number | null = null;
    let pinchAnchorX = 0;

    const applyPinchZoom = (t0: Touch, t1: Touch) => {
      if (!ig || ig.mode !== 'PINCH_ZOOM') return;
      const span = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (span < 1) return;
      const ch = chartRef.current;
      const range = ch?.timeScale().getVisibleLogicalRange();
      if (!ch || !range) return;

      if (ig.pinchPrevSpan === null || pinchAnchorLogical === null) {
        ig.pinchPrevSpan = span;
        const rect = container.getBoundingClientRect();
        const w = Math.max(1, container.clientWidth);
        pinchAnchorX = Math.max(0, Math.min(w - 1,
          ((t0.clientX + t1.clientX) / 2) - rect.left));
        const bars = (range.to as number) - (range.from as number);
        if (!(bars > 0)) return;
        pinchAnchorLogical = ch.timeScale().coordinateToLogical(pinchAnchorX);
        if (pinchAnchorLogical === null) {
          pinchAnchorLogical = (range.from as number) + (pinchAnchorX / w) * bars;
        }
        return;
      }

      const prevSpan = ig.pinchPrevSpan;
      ig.pinchPrevSpan = span;
      if (prevSpan === span) return;
      const currentBars = (range.to as number) - (range.from as number);
      if (!(currentBars > 0)) return;

      manualViewportLockRef.current = true;
      const ratio = prevSpan / span;
      const newBars = Math.max(3, Math.min(500_000, currentBars * ratio));
      if (Math.abs(newBars - currentBars) < 0.0001) return;

      const w = Math.max(1, container.clientWidth);
      const anchorFrac = Math.max(0, Math.min(1, pinchAnchorX / w));
      const newFrom = (pinchAnchorLogical as number) - newBars * anchorFrac;
      const newTo = newFrom + newBars;
      if (!Number.isFinite(newFrom) || !Number.isFinite(newTo)) return;
      try {
        ch.timeScale().setVisibleLogicalRange({ from: newFrom, to: newTo });
      } catch { /* ignore range-clamp errors */ }
    };

`;

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(path, s);
console.log('Pinch zoom anchor patch applied; native pinch disabled to prevent jitter.');
