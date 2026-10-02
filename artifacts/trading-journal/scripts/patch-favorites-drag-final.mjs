import fs from 'node:fs';
const p='src/pages/trades.tsx';
let s=fs.readFileSync(p,'utf8');
// Final guard: keep the favorites toolbar in a stable viewport coordinate system.
s=s.replace(/transform:\s*`translate3d\([^`]+\)`/g,'transform: "none"');
s=s.replace(/const\s+nextX\s*=\s*e\.clientX[^;]*;/g,'const nextX = Math.max(8, Math.min(window.innerWidth - 64, e.clientX));');
s=s.replace(/const\s+nextY\s*=\s*e\.clientY[^;]*;/g,'const nextY = Math.max(8, Math.min(window.innerHeight - 64, e.clientY));');
fs.writeFileSync(p,s);
console.log('Applied final favorites drag stabilization');
