import fs from 'node:fs';

const p = 'src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(p, 'utf8');

const old = `        const totalDx    = e.clientX - g.startX;\n        const startBars  = g.panMax;\n        const startRange = ch.timeScale().getVisibleLogicalRange();\n        if (!startRange) return;\n        // Preserve the viewport center while changing the visible span.\n        // Pinning the right edge made landscape zoom-out pull the candles left.\n        const center     = ((startRange.from as number) + (startRange.to as number)) / 2;\n        const newBars    = startBars * Math.pow(2, totalDx / (w * 0.2));\n        const safeBars   = Math.max(3, Math.min(2_000_000, newBars));\n        try {\n          ch.timeScale().setVisibleLogicalRange({\n            from: center - safeBars / 2,\n            to: center + safeBars / 2,\n          });`;

const replacement = `        const totalDx    = e.clientX - g.startX;\n        const startBars  = g.panMax;\n        const startRange = ch.timeScale().getVisibleLogicalRange();\n        if (!startRange) return;\n\n        // Zoom around the actual gesture anchor instead of pinning either edge.\n        // Pinning the right edge/viewport center causes the complete candle series\n        // to drift left on wide landscape displays when zooming out.\n        const rect = chRef.current?.getBoundingClientRect();\n        const pointerRatio = rect && rect.width > 0\n          ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))\n          : 0.5;\n        const startSpan = Math.max(1, (startRange.to as number) - (startRange.from as number));\n        const anchorLogical = (startRange.from as number) + startSpan * pointerRatio;\n        const newBars = startBars * Math.pow(2, totalDx / (w * 0.2));\n        const safeBars = Math.max(3, Math.min(2_000_000, newBars));\n        try {\n          ch.timeScale().setVisibleLogicalRange({\n            from: anchorLogical - safeBars * pointerRatio,\n            to: anchorLogical + safeBars * (1 - pointerRatio),\n          });`;

if (s.includes(old)) {
  s = s.replace(old, replacement);
  console.log('Landscape zoom anchor fix applied');
} else if (s.includes('const pointerRatio = rect && rect.width > 0')) {
  console.log('Landscape zoom anchor fix already present');
} else {
  // Handle the original unpatched source as well, so a clean checkout is fixed.
  const original = `        const totalDx   = e.clientX - g.startX;\n        const toEdge    = g.panMin;\n        const startBars = g.panMax;\n        const newBars   = startBars * Math.pow(2, totalDx / (w * 0.2));\n        const safeBars  = Math.max(3, Math.min(2_000_000, newBars));\n        try {\n          ch.timeScale().setVisibleLogicalRange({ from: toEdge - safeBars, to: toEdge });`;
  if (s.includes(original)) {
    s = s.replace(original, replacement);
    console.log('Landscape zoom anchor fix applied to original source');
  } else {
    console.warn('Landscape zoom block not found; leaving chart source unchanged');
  }
}

fs.writeFileSync(p, s);
