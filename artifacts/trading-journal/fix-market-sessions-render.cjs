const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "src/components/charts/CustomIndicatorRenderer.tsx");
let s = fs.readFileSync(file, "utf8");

// Keep the source patch deterministic and idempotent. The overlay must be
// calculated from the current indicator settings and committed to React state
// so a settings change is immediately visible; refs alone do not trigger paint.
const start = s.indexOf("function buildMarketSessions(");
const endMarker = "\n\nconst SMCOverlay";
const end = start >= 0 ? s.indexOf(endMarker, start) : -1;
if (start < 0 || end < 0) throw new Error("Unable to locate buildMarketSessions block");

const sessionFn = `function buildMarketSessions(bars: OHLCBar[], settings: Record<string, unknown>): ParsedPineResult {
  const boolSetting = (key: string, fallback: boolean) => {
    const v = settings[key];
    if (v == null) return fallback;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return String(v).toLowerCase() !== "false" && String(v).toLowerCase() !== "0";
  };
  const textSetting = (key: string, fallback: string) => {
    const v = settings[key];
    return v == null || String(v).trim() === "" ? fallback : String(v);
  };
  const parseRange = (key: string, fallback: string) => {
    const raw = textSetting(key, fallback);
    const parts = raw.split("-");
    const parse = (v: string, fb: string) => {
      const m = String(v || fb).match(/^(\\d{2})(\\d{2})$/);
      return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : 0;
    };
    return { start: parse(parts[0], fallback.slice(0, 4)), end: parse(parts[1], fallback.slice(5)) };
  };

  const daysBack = Math.max(1, Number(settings.daysBack) || 150);
  const cutoff = Date.now() / 1000 - daysBack * 86400;
  const hideWeekends = boolSetting("hideWeekends", true);
  const zone = textSetting("SessionZone", "UTC");
  const defs = [
    { name: textSetting("stringTokyo", "Tokyo"), range: parseRange("TokyoTime", "0000-0900"), on: boolSetting("showTokyo", false), color: textSetting("tokyoColor", "#A461BB") },
    { name: textSetting("stringLondon", "London"), range: parseRange("LondonTime", "0700-1600"), on: boolSetting("showLondon", true), color: textSetting("londonColor", "#4CAF4F") },
    { name: textSetting("stringNewYork", "New York"), range: parseRange("NewYorkTime", "1300-2200"), on: boolSetting("showNewYork", true), color: textSetting("newYorkColor", "#2196F3") },
    { name: textSetting("stringSydney", "Sydney"), range: parseRange("SydneyTime", "2100-0600"), on: boolSetting("showSydney", false), color: textSetting("sydneyColor", "#A461BB") },
  ].filter(d => d.on);

  const parts = (epoch: number) => {
    try {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epoch * 1000));
      const get = (k: string) => Number(p.find(x => x.type === k)?.value || 0);
      return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
    } catch {
      const d = new Date(epoch * 1000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
    }
  };
  const zonedEpoch = (y: number, m: number, d: number, minute: number) => {
    const h = Math.floor(minute / 60), min = minute % 60;
    let guess = Date.UTC(y, m - 1, d, h, min, 0) / 1000;
    const p = parts(guess);
    const asLocalUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 1000;
    guess += Date.UTC(y, m - 1, d, h, min) / 1000 - asLocalUtc;
    return guess;
  };
  const addDays = (y: number, m: number, d: number, n: number) => {
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
  };

  const groups = new Map<string, any>();
  for (const b of bars) {
    if (!Number.isFinite(b.time) || b.time < cutoff) continue;
    const p = parts(b.time);
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    if (hideWeekends && (dow === 0 || dow === 6)) continue;
    const minute = p.h * 60 + p.min;
    for (const def of defs) {
      const crosses = def.range.end <= def.range.start;
      const inside = crosses ? minute >= def.range.start || minute < def.range.end : minute >= def.range.start && minute < def.range.end;
      if (!inside) continue;
      const sessionDate = crosses && minute < def.range.end ? addDays(p.y, p.m, p.d, -1) : { y: p.y, m: p.m, d: p.d };
      const endDate = crosses ? addDays(sessionDate.y, sessionDate.m, sessionDate.d, 1) : sessionDate;
      const startEpoch = zonedEpoch(sessionDate.y, sessionDate.m, sessionDate.d, def.range.start);
      const endEpoch = zonedEpoch(endDate.y, endDate.m, endDate.d, def.range.end);
      if (startEpoch < cutoff) continue;
      const key = def.name + ":" + startEpoch;
      const old = groups.get(key);
      if (old) {
        old.top = Math.max(old.top, b.high);
        old.bottom = Math.min(old.bottom, b.low);
      } else {
        groups.set(key, { name: def.name, start: startEpoch, end: endEpoch, top: b.high, bottom: b.low, color: def.color, showLabel: boolSetting("showLabels", true), colorBox: boolSetting("colorBoxes", true) });
      }
    }
  }

  return { type: "UNKNOWN", overlay: true, plots: [], multiSeries: [], hlines: [], levels: [], zones: [...groups.values()].sort((a,b) => a.start - b.start).map(g => ({ kind: "fvg_bull" as const, top: g.top, bottom: g.bottom, startTime: g.start, endTime: g.end, label: g.name, ...(g as any) })) };
}
`;
s = s.slice(0, start) + sessionFn + s.slice(end);

// Settings-driven colors, labels and box visibility.
s = s.replace(/function zoneColor\(k: PineZone\["kind"\], label = ""\) \{[\s\S]*?\n\}/, `function zoneColor(k: PineZone["kind"], label = "", customColor?: string) {
  const n = label.toLowerCase();
  const color = customColor || (n.includes("london") ? "#4CAF4F" : n.includes("new york") ? "#2196F3" : n.includes("tokyo") ? "#FF9900" : n.includes("sydney") ? "#A461BB" : "#22c55e");
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0,2),16) || 34, g = parseInt(hex.slice(2,4),16) || 197, b = parseInt(hex.slice(4,6),16) || 94;
  return { fill: \`rgba(\${r},\${g},\${b},.16)\`, stroke: \`rgba(\${r},\${g},\${b},.80)\` };
}`);
s = s.replaceAll('const c = zoneColor(z.kind, z.label);', 'const c = zoneColor(z.kind, z.label, (z as any).color);');
s = s.replaceAll('fill={c.fill} stroke={c.stroke}', 'fill={(z as any).colorBox === false ? "transparent" : c.fill} stroke={c.stroke}');
s = s.replaceAll('<text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>', '{(z as any).showLabel !== false && <text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>}');

// Remove the 60fps render loop. Repaint only on actual chart geometry changes.
const rafStart = s.indexOf('  // Lightweight Charts moves the canvas synchronously.');
const rafEnd = rafStart >= 0 ? s.indexOf('\n\n  useEffect(() => {', rafStart) : -1;
if (rafStart >= 0 && rafEnd > rafStart) {
  const stable = `  // Event-driven overlay rendering: keep sessions locked to candle coordinates without a perpetual RAF loop.\n  useEffect(() => {\n    if (!chart || !visible) return;\n    let raf = 0;\n    let queued = false;\n    const schedule = () => {\n      if (queued) return;\n      queued = true;\n      raf = requestAnimationFrame(() => { queued = false; rerender(x => x + 1); });\n    };\n    const ts = chart.timeScale();\n    ts.subscribeVisibleLogicalRangeChange(schedule);\n    ts.subscribeVisibleTimeRangeChange(schedule);\n    const el = ref.current;\n    const ro = new ResizeObserver(schedule);\n    if (el) ro.observe(el);\n    const host = el?.parentElement;\n    host?.addEventListener("pointermove", schedule, { passive: true });\n    host?.addEventListener("pointerup", schedule, { passive: true });\n    host?.addEventListener("wheel", schedule, { passive: true });\n    return () => {\n      try { ts.unsubscribeVisibleLogicalRangeChange(schedule); ts.unsubscribeVisibleTimeRangeChange(schedule); } catch {}\n      ro.disconnect();\n      host?.removeEventListener("pointermove", schedule);\n      host?.removeEventListener("pointerup", schedule);\n      host?.removeEventListener("wheel", schedule);\n      if (raf) cancelAnimationFrame(raf);\n    };\n  }, [chart, visible]);`;
  s = s.slice(0, rafStart) + stable + s.slice(rafEnd);
}

// The results map is a cache, not React state. Force one render after computing
// the result so newly-added sessions and settings changes are actually painted.
s = s.replace('const paneRef = useRef(1);\n  const renderable', 'const paneRef = useRef(1);\n  const [, forceRender] = useState(0);\n  const renderable');
s = s.replace('      resultsRef.current.set(ind.id, result);', '      resultsRef.current.set(ind.id, result);');
const effectEnd = '\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);';
s = s.replace(effectEnd, '\n    forceRender(x => x + 1);\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);');
s = s.replace('import { useEffect, useRef, useState, memo } from "react";', 'import { useEffect, useRef, useState, useMemo, memo } from "react";');
s = s.replace('const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));', 'const renderable = useMemo(() => appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode)), [appliedIndicators]);');

fs.writeFileSync(file, s);
console.log("[market-session-fix] applied: settings -> render, both London/New York, stable event-driven overlay, no RAF loop");
