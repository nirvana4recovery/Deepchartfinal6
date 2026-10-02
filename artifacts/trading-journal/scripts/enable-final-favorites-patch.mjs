import fs from 'node:fs';
const p='package.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
x.scripts=x.scripts||{};
x.scripts.build='node ./scripts/patch-favorites-drag-final.mjs && '+(x.scripts.build||'pnpm exec vite build --config vite.config.ts');
fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
