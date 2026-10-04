const fs = require('fs');
const nodePath = require('path');

const repoRoot = nodePath.resolve(__dirname, '../..');
const file = nodePath.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomChart.tsx');
let s = fs.readFileSync(file, 'utf8');

// Native LWC pinch can scale the chart vertically as well as horizontally.
// Disable it so our chart-only pinch owns the gesture.
s = s.replace(/pinch\s*:\s*(?:true|false)/g, 'pinch: false');

// The custom gesture engine must not process a two-finger gesture as normal pan.
const oldPinchBlock = /      if \(e\.touches\.length >= 2\) \{\n        return;\n      \}\n\n/;
s = s.replace(oldPinchBlock, '');

// ── Two-finger chart-only pinch zoom ─────────────────────────────────────────
const pinchMarker = '    const main = makeSeries(chart, ctRef.current, settings);';
const pinchCode = String.raw`    // DEEPCHARTS_TIME_ONLY_PINCH
    const timeOnlyPinch = {
      active: false,
      startSpan: 0,
      startFrom: 0,
      startTo: 0,
      anchorLogical: 0,
      lockedPriceRange: null as { from: number; to: number } | null,
    };

    const pinchDistance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const pinchMidX = (a: Touch, b: Touch) => (a.clientX + b.clientX) / 2;

    const logicalAtX = (range: { from: number; to: number }, x: number) => {
      const width = Math.max(1, chart.timeScale().width() || container.clientWidth || 1);
      const ratio = Math.max(0, Math.min(1, x / width));
      return Number(range.from) + (Number(range.to) - Number(range.from)) * ratio;
    };

    const lockCurrentPriceScale = () => {
      try {
        const ps = chart.priceScale('right');
        const range = ps.getVisibleRange();
        if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to)) && Number(range.from) !== Number(range.to)) {
          timeOnlyPinch.lockedPriceRange = { from: Number(range.from), to: Number(range.to) };
          ps.setAutoScale(false);
        }
      } catch { }
    };

    const restoreLockedPriceScale = () => {
      const r = timeOnlyPinch.lockedPriceRange;
      if (!r) return;
      try {
        const ps = chart.priceScale('right');
        ps.setAutoScale(false);
        ps.setVisibleRange({ from: r.from, to: r.to });
      } catch { }
    };

    const startTimeOnlyPinch = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      const span = pinchDistance(a, b);
      if (!(span > 0)) return;
      lockCurrentPriceScale();
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
        chart.timeScale().setVisibleLogicalRange({ from, to });
        restoreLockedPriceScale();
      } catch { }
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const endTimeOnlyPinch = (e: TouchEvent) => {
      if (!timeOnlyPinch.active || e.touches.length >= 2) return;
      restoreLockedPriceScale();
      timeOnlyPinch.active = false;
      timeOnlyPinch.startSpan = 0;
      timeOnlyPinch.lockedPriceRange = null;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    container.addEventListener('touchstart', startTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchmove', moveTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchend', endTimeOnlyPinch, { capture: true, passive: false });
    container.addEventListener('touchcancel', endTimeOnlyPinch, { capture: true, passive: false });

`;
const existingPinch = /    \/\/ DEEPCHARTS_TIME_ONLY_PINCH[\s\S]*?\n    const main = makeSeries\(chart, ctRef\.current, settings\);/;
if (existingPinch.test(s)) s = s.replace(existingPinch, pinchCode + pinchMarker);
else s = s.replace(pinchMarker, pinchCode + pinchMarker);

// ── PRICE-SCALE INTERACTION ──────────────────────────────────────────────────
// The complete visible right price-scale column is the vertical scaling zone.
// Previous builds incorrectly placed a 12px strip at the chart/scale boundary.
s = s.replace(
  /const scaleW = Math\.max\(0, overrideWidth \?\? PRICE_SCALE_TOUCH_W\);\n\s*const touchW = 12;/,
  'const scaleW = Math.max(0, overrideWidth ?? PRICE_SCALE_TOUCH_W);\n  const touchW = scaleW;'
);
// Put the interaction overlay over the actual price-scale column, not beside it.
s = s.replace(/right:\s*scaleW,\n\s*bottom:\s*0,\n\s*width:\s*touchW,/, 'right: 0,\n        bottom: 0,\n        width: touchW,');
// Remove any secondary border-only wheel hit test.
s = s.replace(/\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = (?:8|10);\n\s*\/\/[^\n]*\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/, '');
s = s.replace(/\n\s*const rect = handlerRef\.current\?\.getBoundingClientRect\(\);\n\s*const ACTIVE_SCALE_HANDLE_W = (?:8|10);\n\s*if \(!rect \|\| e\.clientX > rect\.left \+ ACTIVE_SCALE_HANDLE_W\) return;/, '');

fs.writeFileSync(file, s);
console.log('[chart-fix] Price-scale scroll zone = entire right price-scale column; chart pane cannot trigger it.');
