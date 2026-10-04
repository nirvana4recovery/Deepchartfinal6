const fs = require('fs');
const nodePath = require('path');

const repoRoot = nodePath.resolve(__dirname, '../..');
const file = nodePath.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomChart.tsx');
let s = fs.readFileSync(file, 'utf8');

// IMPORTANT: native Lightweight Charts pinch scales the chart as a whole and can
// therefore change the price scale. The requested behavior is different:
// two fingers inside the chart pane must zoom ONLY the horizontal/time axis.
s = s.replace(/pinch\s*:\s*(?:true|false)/g, 'pinch: false');

// The custom gesture engine must not treat the second finger as a normal chart
// pan. Replace its two-finger early-return with a marker that our dedicated
// pinch listener handles before the chart gesture listeners.
const oldPinchBlock = /      if \(e\.touches\.length >= 2\) \{\n        return;\n      \}\n\n/;
s = s.replace(oldPinchBlock, '');

// ── Two-finger chart-only pinch zoom ─────────────────────────────────────────
// Native LWC pinch is disabled above. This handler changes ONLY the visible
// logical time range. It never calls priceScale(), setVisibleRange(),
// autoscaleInfoProvider, or any vertical-pan code.
//
// Spread fingers  -> fewer bars visible  -> horizontal zoom IN.
// Pinch fingers   -> more bars visible   -> horizontal zoom OUT.
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

    const pinchDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const pinchMidX = (a, b) => (a.clientX + b.clientX) / 2;

    const logicalAtX = (range, x) => {
      const width = Math.max(1, container.clientWidth || 1);
      const ratio = Math.max(0, Math.min(1, x / width));
      return Number(range.from) + (Number(range.to) - Number(range.from)) * ratio;
    };

    const startTimeOnlyPinch = (e) => {
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
      timeOnlyPinch.anchorLogical = logicalAtX(range, midX);

      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const moveTimeOnlyPinch = (e) => {
      if (!timeOnlyPinch.active || e.touches.length < 2) return;
      const [a, b] = e.touches;
      const span = pinchDistance(a, b);
      if (!(span > 0) || !(timeOnlyPinch.startSpan > 0)) return;

      // span grows when fingers spread. Invert it so spreading zooms IN.
      const scale = timeOnlyPinch.startSpan / span;
      const startSpan = timeOnlyPinch.startTo - timeOnlyPinch.startFrom;
      if (!(startSpan > 0)) return;

      const maxSpan = Math.max(2, Math.max(2, barsRef.current.length) * 4);
      const newSpan = Math.min(maxSpan, Math.max(1, startSpan * scale));
      const anchor = timeOnlyPinch.anchorLogical;

      // Keep the zoom anchored under the midpoint of the fingers.
      const startMidRatio = (anchor - timeOnlyPinch.startFrom) / startSpan;
      let from = anchor - newSpan * startMidRatio;
      let to = from + newSpan;

      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

      try {
        // ONLY the horizontal/time axis is modified here.
        chart.timeScale().setVisibleLogicalRange({ from, to });
      } catch { /* chart may be disposing */ }

      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const endTimeOnlyPinch = (e) => {
      if (!timeOnlyPinch.active) return;
      if (e.touches && e.touches.length >= 2) return;
      timeOnlyPinch.active = false;
      timeOnlyPinch.startSpan = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // These listeners are registered immediately after createChart and before
    // the component's custom gesture listeners. Capture + stopImmediatePropagation
    // prevents the second finger from entering CHART_PAN/PINCH_ZOOM logic.
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
