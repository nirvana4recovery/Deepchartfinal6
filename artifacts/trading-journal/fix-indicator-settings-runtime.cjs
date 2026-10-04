const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/charts/CustomIndicatorRenderer.tsx');
let s = fs.readFileSync(file, 'utf8');

if (!s.includes('const [, refreshRender] = useState(0);')) {
  s = s.replace(
    '  const paneRef = useRef(1);\n  const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));',
    '  const paneRef = useRef(1);\n  const [, refreshRender] = useState(0);\n  const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));'
  );
}

const oldDeps = '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);';
const newDeps = '    refreshRender(v => v + 1);\n  }, [chart, barsLoaded, appliedIndicators, barsRef, replayBarCount]);';
if (s.includes(oldDeps) && !s.includes(newDeps)) {
  s = s.replace(oldDeps, newDeps);
}

if (!s.includes('refreshRender(v => v + 1);')) {
  throw new Error('Could not patch indicator settings refresh effect');
}

fs.writeFileSync(file, s);
console.log('[indicator-settings-fix] settings changes now force overlay result refresh');
