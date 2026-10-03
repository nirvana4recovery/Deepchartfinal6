const fs = require('fs');

const path = 'artifacts/trading-journal/src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('    const applyPinchZoom = (t0: Touch, t1: Touch) => {');
const end = s.indexOf('    // ── touchstart capture', start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Pinch zoom patch target not found');
}

const replacement = `    // Keep one immutable logical/screen anchor for the entire pinch gesture.
    // Recomputing the anchor from the already-zoomed range causes viewport drift,
    // especially when the midpoint is in the future/blank area.
    let pinchAnchorLogical: number | null = null;
    let pinchAnchorX = 0;

    const applyPinchZoom = (t0: Touch, t1: Touch) => {
      if (!ig || ig.mode !== 'PINCH_ZOOM') return;
      const span = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (span < 1) return;
      const ch = chartRef.current;
      const range = ch?.timeScale().getVisibleLogicalRange();
      if (!ch || !range) return;

      // Capture the first midpoint and its logical position exactly once.
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
          // Future whitespace has no candle coordinate. Extrapolate from the
          // current visible range instead of falling back to the range midpoint.
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

      // Preserve the same logical bar under the original finger midpoint.
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
console.log('Robust pinch zoom anchor patch applied.');
