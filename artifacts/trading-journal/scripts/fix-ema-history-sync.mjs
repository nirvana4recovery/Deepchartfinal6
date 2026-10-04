import fs from "node:fs";

const path = "src/components/charts/CustomIndicatorRenderer.tsx";
let s = fs.readFileSync(path, "utf8");

const stateMarker = '  const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));';
const stateInsert = `  const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));\n  // Incremented whenever CustomChart prepends older candles. Refs do not trigger\n  // React renders, so the indicator renderer must explicitly invalidate its data\n  // when infinite-history loading expands barsRef.current.\n  const [historyRevision, setHistoryRevision] = useState(0);`;

if (!s.includes("const [historyRevision, setHistoryRevision] = useState(0);")) {
  if (!s.includes(stateMarker)) throw new Error("renderable marker not found");
  s = s.replace(stateMarker, stateInsert);
}

const listenerMarker = '  useEffect(() => {\n    if (!chart || !barsLoaded) return;';
const listenerBlock = `  // CustomChart dispatches this event after older candles are prepended.\n  // barsRef is intentionally a stable ref, so without this explicit revision\n  // the EMA/SMA/VWAP series would remain stuck at the initial candle page.\n  useEffect(() => {\n    const onHistoryLoaded = () => setHistoryRevision(v => v + 1);\n    window.addEventListener("deepcharts:history-loaded", onHistoryLoaded);\n    return () => window.removeEventListener("deepcharts:history-loaded", onHistoryLoaded);\n  }, []);\n\n  useEffect(() => {\n    if (!chart || !barsLoaded) return;`;

if (!s.includes('window.addEventListener("deepcharts:history-loaded", onHistoryLoaded)')) {
  if (!s.includes(listenerMarker)) throw new Error("indicator render effect marker not found");
  s = s.replace(listenerMarker, listenerBlock);
}

const depsOld = '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);';
const depsNew = '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount, historyRevision]);';
if (!s.includes(depsNew)) {
  if (!s.includes(depsOld)) throw new Error("indicator render dependency list not found");
  s = s.replace(depsOld, depsNew);
}

fs.writeFileSync(path, s);
console.log("[fix-ema-history-sync] synced indicator series after historical candles load");
