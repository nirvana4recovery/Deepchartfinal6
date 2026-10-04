const fs = require('fs');
const nodePath = require('path');

const repoRoot = nodePath.resolve(__dirname, '../..');
const file = nodePath.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomChart.tsx');
let s = fs.readFileSync(file, 'utf8');

// Native LWC pinch can scale the chart vertically as well as horizontally.
// We need two-finger zoom inside the chart pane to affect ONLY candle spacing.
s = s.replace(/pinch\s*:\s*(?:true|false)/g, 'pinch: false');

// The custom gesture engine must not process a two-finger gesture as normal pan.
const oldPinchBlock = /      if \(e\.touches\.length >= 2\) \{\n        return;\n      \}\n\n/;
s = s.replace(oldPinchBlock, '');

// ── Two-finger chart-only pinch zoom ─────────────────────────────────────────
// Spread fingers -> horizontal zoom IN (fewer bars, larger candles).
// Pinch fingers  -> horizontal zoom OUT (more bars, smaller candles).
const pinchMarker = '    const main = makeSeries(chart, ctRef.current, settings);';
if (!s.includes('DEEPCHARTS_TIME_ONLY_PINCH')) {
  const pinchCode = String.raw`    // DEEPCHARTS_TIME_ONLY_PINCH
    const timeOnlyPinch = {
      active: false,
      startSpan: 0,
      startFrom: 0,
      startTo: 0,
      anchorLogical: 0,
    };

    const pinchDistance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const pinchMidX = (a: Touch, b: Touch) => (a.clientX + b.clientX) / 2;

    const logicalAtX = (range: { from: number; to: number }, x: number) => {
      const width = Math.max(1, container.clientWidth || 1);
      const ratio = Math.max(0, Math.min(1, x / width));
      return Number(range.from) + (Number(range.to) - Number(range.from)) * ratio;
    };

    const startTimeOnlyPinch = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;

      const span = pinchDistance(a, b);
      if (!(span > 0)) return;

      const midX = pinchMidX(a, b);
      timeOnlyPinch.active = true;
      timeOnlyPinch.startSpan = span;
      timeOnlyPinch.startFrom = Number(range.from);
      timeOnlyPinch.startTo = Number(range.to);
      timeOnlyPinch.anchorLogical = logicalAtX({ from: Number(range.from), to: Number(range.to) }, midX);

      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const moveTimeOnlyPinch = (e: TouchEvent) => {
      if (!timeOnlyPinch.active || e.touches.length < 2) return;
      const [a, b] = e.touches;
      const span = pinchDistance(a, b);
      if (!(span > 0) || !(timeOnlyPinch.startSpan > 0)) return;

      const scale = timeOnlyPinch.startSpan / span;
      const startSpan = timeOnlyPinch.startTo - timeOnlyPinch.startFrom;
      if (!(startSpan > 0)) return;

      const maxSpan = Math.max(2, Math.max(2, barsRef.current.length) * 4);
      const newSpan = Math.min(maxSpan, Math.max(1, startSpan * scale));
      const anchor = timeOnlyPinch.anchorLogical;
      const startMidRatio = (anchor - timeOnlyPinch.startFrom) / startSpan;

      const from = anchor - newSpan * startMidRatio;
      const to = from + newSpan;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

      try {
        // ONLY the horizontal/time axis is modified. Price scale is untouched.
        chart.timeScale().setVisibleLogicalRange({ from, to });
      } catch { /* chart may be disposing */ }

      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const endTimeOnlyPinch = (e: TouchEvent) => {
      if (!timeOnlyPinch.active) return;
      if (e.touches.length >= 2) return;
      timeOnlyPinch.active = false;
      timeOnlyPinch.startSpan = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // Registered before the custom one-finger gesture listeners below.
    // Capture + stopImmediatePropagation keeps the second finger out of the
    // chart-pan state machine while the pinch is active.
    container.addEventListener('touchstart', startTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchmove', moveTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchend', endTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchcancel', endTimeOnlyPinch, { capture: true, passive: false });

`;
  s = s.replace(pinchMarker, pinchCode + pinchMarker);
}

// ── PRICE-SCALE HANDLE ───────────────────────────────────────────────────────
// The actual right price-axis border is container.right - measured scale width.
// Keep only a narrow handle over that border. Price labels remain inert.
s = s.replace(
  /const touchW\s*=\s*PRICE_SCALE_TOUCH_W;/,
  'const scaleW = Math.max(0, overrideWidth ?? PRICE_SCALE_TOUCH_W);\n  const touchW = 12;'
);
s = s.replace(
  /right:\s*0,\n\s*bottom:\s*0,\n\s*width:\s*touchW,/,
  'right:         scaleW,\n        bottom:        0,\n        width:         touchW,'
);

// Remove stale coordinate guards: the handle itself is already positioned on
// the exact measured border, so a second hit-test only introduces rounding bugs.
s = s.replace(
  /\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = (?:8|10);\n\s*if \(!rect \|\| e\.clientX (?:>|<) rect\.(?:left|right) [^\n]+\) return;/g,
  ''
);

fs.writeFileSync(file, s);
console.log('[chart-fix] Two-finger pinch now scales time/candles only; price scale is excluded.');
