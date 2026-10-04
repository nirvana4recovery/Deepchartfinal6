const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/charts/CustomIndicatorRenderer.tsx');
let s = fs.readFileSync(file, 'utf8');

// Always declare the state setter before using it. Use a line-based regex so
// harmless formatting changes cannot produce a runtime "refreshRender is not
// defined" error.
if (!s.includes('const [, refreshRender] = useState(0);')) {
  const pane = /(^\s*const paneRef = useRef\(1\);)/m;
  if (!pane.test(s)) throw new Error('Could not locate paneRef in CustomIndicatorRenderer.tsx');
  s = s.replace(pane, '$1\n  const [, refreshRender] = useState(0);');
}

// Normalize the main render effect dependency list.
const deps = /(^\s*\}, \[chart, barsLoaded, )(?:renderable|appliedIndicators)(, barsRef, replayBarCount\]\);)/m;
if (!deps.test(s)) throw new Error('Could not locate indicator render effect dependency list');
s = s.replace(deps, '$1appliedIndicators$2');

// Add the state bump exactly once immediately before that effect closes.
if (!s.includes('refreshRender(v => v + 1);')) {
  const close = /(^\s*\}, \[chart, barsLoaded, appliedIndicators, barsRef, replayBarCount\]\);)/m;
  if (!close.test(s)) throw new Error('Could not locate normalized indicator render effect');
  s = s.replace(close, '    refreshRender(v => v + 1);\n$1');
}

if (!s.includes('const [, refreshRender] = useState(0);')) {
  throw new Error('refreshRender state declaration was not inserted');
}
if (!s.includes('refreshRender(v => v + 1);')) {
  throw new Error('refreshRender call was not inserted');
}

fs.writeFileSync(file, s);
console.log('[indicator-settings-fix] indicator settings refresh is runtime-safe and idempotent');
