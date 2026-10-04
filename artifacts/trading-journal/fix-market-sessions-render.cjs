const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "src/components/charts/CustomIndicatorRenderer.tsx");
let s = fs.readFileSync(file, "utf8");

// Market Sessions must be driven by the indicator settings, not hard-coded
// London/New-York definitions. Build the session boxes from UTC timestamps,
// while supporting an IANA SessionZone and sessions that cross midnight.
const sessionFn = `function buildMarketSessions(bars: OHLCBar[], settings: Record<string, unknown>): ParsedPineResult {
  const daysBack = Math.max(1, Number(settings.daysBack) || 150);
  const cutoff = Date.now() / 1000 - daysBack * 86400;
  const hideWeekends = settings.hideWeekends !== false;
  const zone = String(settings.SessionZone || "UTC");
  const parseHM = (value: unknown, fallback: string) => {
    const m = String(value ?? fallback).match(/^(\\d{2})(\\d{2})$/);
    if (!m) return fallback === "0000" ? 0 : 0;
    return Math.min(1439, Number(m[1]) * 60 + Number(m[2]));
  };
  const enabled = (key: string, fallback: boolean) => settings[key] == null ? fallback : settings[key] === true;
  const defs = [
    { name: String(settings.stringTokyo || "Tokyo"), start: parseHM(settings.TokyoTime, "0000"), end: parseHM(String(settings.TokyoTime || "0000-0900").split("-")[1], "0900"), on: enabled("showTokyo", false), color: String(settings.tokyoColor || "#A461BB") },
    { name: String(settings.stringLondon || "London"), start: parseHM(settings.LondonTime, "0700"), end: parseHM(String(settings.LondonTime || "0700-1600").split("-")[1], "1600"), on: enabled("showLondon", true), color: String(settings.londonColor || "#4CAF4F") },
    { name: String(settings.stringNewYork || "New York"), start: parseHM(settings.NewYorkTime, "1300"), end: parseHM(String(settings.NewYorkTime || "1300-2200").split("-")[1], "2200"), on: enabled("showNewYork", true), color: String(settings.newYorkColor || "#2196F3") },
    { name: String(settings.stringSydney || "Sydney"), start: parseHM(settings.SydneyTime, "2100"), end: parseHM(String(settings.SydneyTime || "2100-0600").split("-")[1], "0600"), on: enabled("showSydney", false), color: String(settings.sydneyColor || "#A461BB") },
  ].filter(x => x.on);

  const localParts = (epoch: number) => {
    try {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epoch * 1000));
      const get = (k: string) => Number(p.find(x => x.type === k)?.value || 0);
      return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
    } catch {
      const d = new Date(epoch * 1000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
    }
  };
  const zonedEpoch = (y: number, m: number, d: number, minutes: number) => {
    const h = Math.floor(minutes / 60), min = minutes % 60;
    let guess = Date.UTC(y, m - 1, d, h, min, 0) / 1000;
    try {
      const p = localParts(guess);
      const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 1000;
      guess += Date.UTC(y, m - 1, d, h, min) / 1000 - asUtc;
    } catch {}
    return guess;
  };
  const dateKey = (y: number, m: number, d: number) => String(y) + "-" + String(m) + "-" + String(d);
  const addDays = (y: number, m: number, d: number, n: number) => {
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
  };
  const groups = new Map<string, any>();

  for (const b of bars) {
    if (b.time < cutoff) continue;
    const p = localParts(b.time);
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    if (hideWeekends && (dow === 0 || dow === 6)) continue;
    const minute = p.h * 60 + p.min;
    for (const def of defs) {
      const crossesMidnight = def.end <= def.start;
      let sessionDate = { y: p.y, m: p.m, d: p.d };
      const inSession = crossesMidnight ? (minute >= def.start || minute < def.end) : (minute >= def.start && minute < def.end);
      if (!inSession) continue;
      if (crossesMidnight && minute < def.end) sessionDate = addDays(p.y, p.m, p.d, -1);
      const startEpoch = zonedEpoch(sessionDate.y, sessionDate.m, sessionDate.d, def.start);
      const endDate = crossesMidnight ? addDays(sessionDate.y, sessionDate.m, sessionDate.d, 1) : sessionDate;
      const endEpoch = zonedEpoch(endDate.y, endDate.m, endDate.d, def.end);
      if (startEpoch < cutoff) continue;
      const key = String(def.name) + ":" + String(startEpoch);
      const g = groups.get(key);
      if (g) {
        g.top = Math.max(g.top, b.high);
        g.bottom = Math.min(g.bottom, b.low);
      } else {
        groups.set(key, { name: def.name, start: startEpoch, end: endEpoch, top: b.high, bottom: b.low, color: def.color, showLabel: settings.showLabels !== false, colorBox: settings.colorBoxes !== false });
      }
    }
  }
  return { type: "UNKNOWN", overlay: true, plots: [], multiSeries: [], hlines: [], levels: [], zones: [...groups.values()].sort((a,b) => a.start-b.start).map(g => ({ kind: "fvg_bull" as const, top:g.top, bottom:g.bottom, startTime:g.start, endTime:g.end, label:g.name, ...(g as any) })) };
}
`;
const fnRx = /function buildMarketSessions\([\s\S]*?\n\}\n\nconst SMCOverlay/;
if (fnRx.test(s)) s = s.replace(fnRx, `${sessionFn}\nconst SMCOverlay`);
else if (!s.includes("const sessionFn")) throw new Error("Unable to locate buildMarketSessions");

// Use the session's configured color/opacity and label settings.
s = s.replace(/function zoneColor\(k: PineZone\["kind"\], label = ""\) \{[\s\S]*?\n\}/, `function zoneColor(k: PineZone["kind"], label = "", customColor?: string) {
  const n = label.toLowerCase();
  const color = customColor || (n.includes("london") ? "#4CAF4F" : n.includes("new york") ? "#2196F3" : n.includes("tokyo") ? "#FF9900" : n.includes("sydney") ? "#A461BB" : "#22c55e");
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0,2),16) || 34, g = parseInt(hex.slice(2,4),16) || 197, b = parseInt(hex.slice(4,6),16) || 94;
  return { fill: \`rgba(\${r},\${g},\${b},.16)\`, stroke: \`rgba(\${r},\${g},\${b},.80)\` };
}`);
s = s.replace('const c = zoneColor(z.kind, z.label);', 'const c = zoneColor(z.kind, z.label, (z as any).color);');
s = s.replace('fill={c.fill} stroke={c.stroke}', 'fill={(z as any).colorBox === false ? "transparent" : c.fill} stroke={c.stroke}');
s = s.replace('<text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>', '{(z as any).showLabel !== false && <text x={rx + 4} y={Math.max(44, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>}');

// Never run a perpetual RAF render loop. Redraw only when chart geometry can change.
const oldRaf = /\n\s*\/\/ Lightweight Charts moves the canvas synchronously\.[\s\S]*?\n\s*\}, \[chart\]\);\n/;
const stableRaf = `
  useEffect(() => {
    if (!chart || !visible) return;
    let raf = 0;
    let queued = false;
    const scheduleRender = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(() => { queued = false; rerender(x => x + 1); });
    };
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(scheduleRender);
    ts.subscribeVisibleTimeRangeChange(scheduleRender);
    const el = ref.current;
    const ro = new ResizeObserver(scheduleRender);
    if (el) ro.observe(el);
    const host = el?.parentElement;
    host?.addEventListener("pointermove", scheduleRender, { passive: true });
    host?.addEventListener("pointerup", scheduleRender, { passive: true });
    host?.addEventListener("wheel", scheduleRender, { passive: true });
    return () => {
      try { ts.unsubscribeVisibleLogicalRangeChange(scheduleRender); ts.unsubscribeVisibleTimeRangeChange(scheduleRender); } catch {}
      ro.disconnect();
      host?.removeEventListener("pointermove", scheduleRender);
      host?.removeEventListener("pointerup", scheduleRender);
      host?.removeEventListener("wheel", scheduleRender);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [chart, visible]);
`;
if (oldRaf.test(s)) s = s.replace(oldRaf, stableRaf);

// Ensure unrelated indicator renders don't create a new array reference every render.
s = s.replace('import { useEffect, useRef, useState, memo } from "react";', 'import { useEffect, useRef, useState, useMemo, memo } from "react";');
s = s.replace('const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));', 'const renderable = useMemo(() => appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode)), [appliedIndicators]);');

fs.writeFileSync(file, s);
console.log("Market Sessions fixed: settings-driven boxes, timezone-aware times, stable event-driven rendering.");
