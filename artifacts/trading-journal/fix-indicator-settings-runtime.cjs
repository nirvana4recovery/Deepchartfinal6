const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/charts/CustomIndicatorRenderer.tsx');
let s = fs.readFileSync(file, 'utf8');

// Ensure the refresh state setter is always declared. The previous patch used
// one brittle multi-line replacement, so a formatting change could leave the
// call in the effect without the declaration and crash the app at runtime.
if (!s.includes('const [, refreshRender] = useState(0);')) {
  const pane = /(^\s*const paneRef = useRef\(1\);)/m;
  if (!pane.test(s)) throw new Error('Could not locate paneRef in CustomIndicatorRenderer.tsx');
  s = s.replace(pane, '$1\n  const [, refreshRender] = useState(0);');
}

// Make the main render effect respond to indicator-setting changes and force
// React to consume the freshly computed result. Keep this idempotent.
const oldDeps = /(^\s*\}, \[chart, barsLoaded, renderable, barsRef, replayBarCount\]\);)/m;
if (!s.includes('refreshRender(v => v + 1);')) {
  if (!oldDeps.test(s)) throw new Error('Could not locate indicator render effect dependency list');
  s = s.replace(oldDeps, '    refreshRender(v => v + 1);\n$1'.replace('replayBarCount', 'appliedIndicators, barsRef, replayBarCount'));
} else {
  // If a previous partial patch left the call behind, repair the dependency
  // list without duplicating the call.
  s = s.replace(
    /(^\s*\}, \[chart, barsLoaded, renderable, barsRef, replayBarCount\]\);)/m,
    '    refreshRender(v => v + 1);\n  }, [chart, barsLoaded, appliedIndicators, barsRef, replayBarCount]);'
  );
}

if (!s.includes('const [, refreshRender] = useState(0);')) {
  throw new Error('refreshRender state declaration was not inserted');
}
if (!s.includes('refreshRender(v => v + 1);')) {
  throw new Error('refreshRender call was not inserted');
}

fs.writeFileSync(file, s);
console.log('[indicator-settings-fix] indicator settings refresh is now runtime-safe');
