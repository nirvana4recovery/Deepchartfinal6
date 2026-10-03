import fs from 'node:fs';
const p = 'src/components/charts/CustomChart.tsx';
let s = fs.readFileSync(p, 'utf8');
const old = `        const totalDx   = e.clientX - g.startX;\n        const toEdge    = g.panMin;\n        const startBars = g.panMax;\n        const newBars   = startBars * Math.pow(2, totalDx / (w * 0.2));\n        const safeBars  = Math.max(3, Math.min(2_000_000, newBars));\n        try {\n          ch.timeScale().setVisibleLogicalRange({ from: toEdge - safeBars, to: toEdge });`;
const replacement = `        const totalDx    = e.clientX - g.startX;\n        const startBars  = g.panMax;\n        const startRange = ch.timeScale().getVisibleLogicalRange();\n        if (!startRange) return;\n        // Preserve the viewport center while changing the visible span.\n        // Pinning the right edge made landscape zoom-out pull the candles left.\n        const center     = ((startRange.from as number) + (startRange.to as number)) / 2;\n        const newBars    = startBars * Math.pow(2, totalDx / (w * 0.2));\n        const safeBars   = Math.max(3, Math.min(2_000_000, newBars));\n        try {\n          ch.timeScale().setVisibleLogicalRange({\n            from: center - safeBars / 2,\n            to: center + safeBars / 2,\n          });`;
if (!s.includes(old)) throw new Error('Expected time-scale zoom block not found');
s = s.replace(old, replacement);
fs.writeFileSync(p, s);
console.log('Landscape time-scale zoom center fix applied');
