import fs from 'node:fs';
const p = 'src/components/charts/DrawingToolbar.tsx';
let s = fs.readFileSync(p, 'utf8');
// The favorites bar is a plain div. A previous drag patch accidentally left a motion.div closing tag.
s = s.replace(/<\/motion\.div>(,\s*\n\s*document\.body)/g, '</div>$1');
fs.writeFileSync(p, s);
console.log('[favorites-fix] normalized favorites bar closing tag');
