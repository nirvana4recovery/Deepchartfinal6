const fs = require("fs");

const file = "src/components/charts/CustomIndicatorRenderer.tsx";
let s = fs.readFileSync(file, "utf8");

if (!s.includes("forceSessionOverlayRender")) {
  s = s.replace(
    'import { useEffect, useRef, useState, memo } from "react";',
    'import { useEffect, useRef, useState, useMemo, memo } from "react";'
  );
  s = s.replace(
    'const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));',
    'const renderable = useMemo(() => appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode)), [appliedIndicators]);'
  );
  s = s.replace(
    'const paneRef = useRef(1);',
    'const paneRef = useRef(1);\n  const [, forceSessionOverlayRender] = useState(0);'
  );
  const marker = 'resultsRef.current.set(ind.id, result);';
  if (!s.includes(marker)) throw new Error("Indicator result marker not found");
  s = s.replace(marker, marker + '\n      forceSessionOverlayRender(v => v + 1);');
}

s = s.replace('y={Math.max(10, ry + 12)}', 'y={Math.max(44, ry + 12)}');
fs.writeFileSync(file, s);
console.log("Market Sessions render synchronization patch applied.");
