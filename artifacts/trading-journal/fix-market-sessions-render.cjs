const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "src/components/charts/CustomIndicatorRenderer.tsx");
let s = fs.readFileSync(file, "utf8");

// Keep the session renderer event-driven. A perpetual requestAnimationFrame loop
// caused unnecessary React renders and made the session boxes flicker/drift while
// candles were updating. Lightweight Charts already exposes the viewport events;
// pointer/wheel events cover price-scale drag/zoom, so redraw only when geometry can change.
const rafBlock = /\n\s*\/\/ Lightweight Charts moves the canvas synchronously\.[\s\S]*?\n\s*\}, \[chart\]\);\n\n\s*useEffect\(\(\) => \{\n\s*if \(!chart\) return;\n/;
const stableEffect = `\n\n  useEffect(() => {\n    if (!chart || !visible) return;\n\n    let raf = 0;\n    let queued = false;\n    const scheduleRender = () => {\n      if (queued) return;\n      queued = true;\n      raf = requestAnimationFrame(() => {\n        queued = false;\n        rerender(x => x + 1);\n      });\n    };\n\n    const timeScale = chart.timeScale();\n    timeScale.subscribeVisibleLogicalRangeChange(scheduleRender);\n    timeScale.subscribeVisibleTimeRangeChange(scheduleRender);\n    chart.subscribeCrosshairMove(scheduleRender);\n\n    const ro = new ResizeObserver(scheduleRender);\n    const el = ref.current;\n    if (el) ro.observe(el);\n\n    // Price-scale dragging/zooming does not reliably emit a time-scale event.\n    // Listen only during real pointer/wheel interaction and coalesce updates to\n    // one animation frame, instead of rendering continuously at 60fps.\n    const host = el?.parentElement;\n    const onPointerMove = () => scheduleRender();\n    const onPointerUp = () => scheduleRender();\n    const onWheel = () => scheduleRender();\n    host?.addEventListener("pointermove", onPointerMove, { passive: true });\n    host?.addEventListener("pointerup", onPointerUp, { passive: true });\n    host?.addEventListener("pointercancel", onPointerUp, { passive: true });\n    host?.addEventListener("wheel", onWheel, { passive: true });\n\n    return () => {\n      try {\n        timeScale.unsubscribeVisibleLogicalRangeChange(scheduleRender);\n        timeScale.unsubscribeVisibleTimeRangeChange(scheduleRender);\n        chart.unsubscribeCrosshairMove(scheduleRender);\n      } catch {}\n      ro.disconnect();\n      host?.removeEventListener("pointermove", onPointerMove);\n      host?.removeEventListener("pointerup", onPointerUp);\n      host?.removeEventListener("pointercancel", onPointerUp);\n      host?.removeEventListener("wheel", onWheel);\n      if (raf) cancelAnimationFrame(raf);\n      queued = false;\n    };\n  }, [chart, visible]);\n\n  useEffect(() => {\n    if (!chart) return;\n`;

if (rafBlock.test(s)) {
  s = s.replace(rafBlock, stableEffect);
} else if (!s.includes('const scheduleRender = () => {') || !s.includes('chart.subscribeCrosshairMove(scheduleRender);')) {
  throw new Error("Unable to locate the existing session overlay render effect");
}

// Keep the indicator array referentially stable between store updates. This stops
// the main calculation effect from being retriggered by unrelated chart renders.
s = s.replace(
  'import { useEffect, useRef, useState, memo } from "react";',
  'import { useEffect, useRef, useState, useMemo, memo } from "react";'
);
s = s.replace(
  'import { useEffect, useRef, useState, useMemo, memo } from "react";',
  'import { useEffect, useRef, useState, useMemo, memo } from "react";'
);
s = s.replace(
  'const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));',
  'const renderable = useMemo(() => appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode)), [appliedIndicators]);'
);

// Remove the older force-render hook if a previous build script version added it.
s = s.replace(/\n\s*const \[, forceSessionOverlayRender\] = useState\(0\);/, "");
s = s.replace(/\n\s*forceSessionOverlayRender\(v => v \+ 1\);/, "");

// Keep labels inside the visible plot area without changing session geometry.
s = s.replace('y={Math.max(10, ry + 12)}', 'y={Math.max(44, ry + 12)}');

fs.writeFileSync(file, s);
console.log("Market Sessions renderer stabilized: event-driven sync, no perpetual RAF loop.");
