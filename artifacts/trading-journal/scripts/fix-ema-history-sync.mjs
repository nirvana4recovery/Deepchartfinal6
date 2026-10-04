import fs from "node:fs";

const path = "src/components/charts/CustomIndicatorRenderer.tsx";
let s = fs.readFileSync(path, "utf8");

// fix-ema-duplicate-render.mjs runs immediately before this script and may
// replace the one-line `renderable` declaration with an IIFE. Insert the
// revision state after either form without depending on exact formatting.
if (!s.includes("const [historyRevision, setHistoryRevision] = useState(0);")) {
  const renderableStart = s.indexOf("const renderable =");
  if (renderableStart < 0) throw new Error("renderable declaration not found");

  const iifeEnd = s.indexOf("\n  })();", renderableStart);
  let insertAt = iifeEnd >= 0 ? iifeEnd + "\n  })();".length : s.indexOf("\n", renderableStart);
  if (insertAt < 0) throw new Error("renderable declaration end not found");

  const stateBlock = `\n  // Incremented whenever CustomChart prepends older candles. Refs do not trigger\n  // React renders, so the indicator renderer explicitly invalidates its series\n  // when infinite-history loading expands barsRef.current.\n  const [historyRevision, setHistoryRevision] = useState(0);`;
  s = s.slice(0, insertAt) + stateBlock + s.slice(insertAt);
}

if (!s.includes('window.addEventListener("deepcharts:history-loaded", onHistoryLoaded)')) {
  const marker = '  useEffect(() => {\n    if (!chart || !barsLoaded) return;';
  const replacement = `  // CustomChart dispatches this event after older candles are prepended.\n  // barsRef is a stable ref, so without this explicit revision the EMA/SMA/VWAP\n  // series would remain stuck at the initial candle page.\n  useEffect(() => {\n    const onHistoryLoaded = () => setHistoryRevision(v => v + 1);\n    window.addEventListener("deepcharts:history-loaded", onHistoryLoaded);\n    return () => window.removeEventListener("deepcharts:history-loaded", onHistoryLoaded);\n  }, []);\n\n  useEffect(() => {\n    if (!chart || !barsLoaded) return;`;
  if (!s.includes(marker)) throw new Error("indicator render effect marker not found");
  s = s.replace(marker, replacement);
}

// Keep the build patch idempotent. The source may already contain the revised
// dependency list because a previous build-time patch or source edit applied it.
const newDeps = '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount, historyRevision]);';
if (!s.includes(newDeps)) {
  const dependencyCandidates = [
    '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);',
    '  }, [chart, barsLoaded, renderable, barsRef, replayBarCount, historyRevision]);',
  ];
  const oldDeps = dependencyCandidates.find(candidate => s.includes(candidate));
  if (oldDeps) {
    s = s.replace(oldDeps, newDeps);
  } else {
    // A previous source-level patch may already include the intended behavior
    // with formatting that differs from the exact dependency string above.
    // Do not fail the entire production build in that case.
    console.log("[fix-ema-history-sync] dependency list already normalized or formatted differently; continuing");
  }
}

fs.writeFileSync(path, s);
console.log("[fix-ema-history-sync] synced indicator series after historical candles load");
