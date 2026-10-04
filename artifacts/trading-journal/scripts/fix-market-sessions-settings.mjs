import fs from "fs";
const p = "artifacts/trading-journal/src/components/charts/CustomIndicatorRenderer.tsx";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("function zoneColor(");
const end = s.indexOf("function levelColor(", start);
if (start < 0 || end < 0) throw new Error("Market Sessions color markers not found");
const newBlock = `let marketSessionAppearance = {
  londonColor: "#4CAF4F", newYorkColor: "#2196F3", opacity: 0.16,
  borderWidth: 1, borderStyle: "dashed", colorBoxes: true, showLabels: true,
};

function sessionColor(label = "") {
  const n = label.toLowerCase();
  const hex = n.includes("london") ? marketSessionAppearance.londonColor : marketSessionAppearance.newYorkColor;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const rgb = m ? [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)] : [33,149,243];
  const [r,g,b] = rgb;
  return { fill: "rgba(" + r + "," + g + "," + b + "," + marketSessionAppearance.opacity + ")", stroke: hex };
}

function zoneColor(k: PineZone["kind"], label = "") {
  const n = label.toLowerCase();
  if (n.includes("london") || n.includes("new york")) return sessionColor(label);
  if (n.includes("tokyo")) return { fill: "rgba(255,153,0,.16)", stroke: "rgba(255,153,0,.80)" };
  if (n.includes("sydney")) return { fill: "rgba(164,97,187,.16)", stroke: "rgba(164,97,187,.80)" };
  switch (k) {
    case "fvg_bull": return { fill: "rgba(34,197,94,.10)", stroke: "rgba(34,197,94,.5)" };
    case "fvg_bear": return { fill: "rgba(239,68,68,.10)", stroke: "rgba(239,68,68,.5)" };
    case "ob_bull": return { fill: "rgba(34,197,94,.14)", stroke: "rgba(34,197,94,.65)" };
    default: return { fill: "rgba(239,68,68,.14)", stroke: "rgba(239,68,68,.65)" };
  }
}

`;
s = s.slice(0, start) + newBlock + s.slice(end);
const bStart = s.indexOf("function buildMarketSessions(");
const bEnd = s.indexOf("\nconst SMCOverlay", bStart);
if (bStart < 0 || bEnd < 0) throw new Error("buildMarketSessions markers not found");
const fn = `function parseSessionTime(v, fallbackStart, fallbackEnd) {
  const m = /^(\\d{2})(\\d{2})-(\\d{2})(\\d{2})$/.exec(String(v ?? ""));
  if (!m) return { start: fallbackStart, end: fallbackEnd };
  return { start: Number(m[1]) * 60 + Number(m[2]), end: Number(m[3]) * 60 + Number(m[4]) };
}

function buildMarketSessions(bars: OHLCBar[], settings: Record<string, unknown>): ParsedPineResult {
  const daysBack = Math.max(1, Number(settings.daysBack) || 150);
  const cutoff = Date.now() / 1000 - daysBack * 86400;
  const hideWeekends = settings.hideWeekends !== false;
  const defs = [
    { name: String(settings.stringLondon ?? "London"), enabled: settings.showLondon !== false, ...parseSessionTime(settings.LondonTime, 7*60, 16*60) },
    { name: String(settings.stringNewYork ?? "New York"), enabled: settings.showNewYork !== false, ...parseSessionTime(settings.NewYorkTime, 13*60, 22*60) },
  ].filter(s => s.enabled && s.end > s.start);
  marketSessionAppearance = {
    londonColor: String(settings.londonColor ?? "#4CAF4F"), newYorkColor: String(settings.newYorkColor ?? "#2196F3"),
    opacity: Math.max(0, Math.min(1, Number(settings.opacity ?? 0.16))),
    borderWidth: Math.max(1, Math.min(4, Number(settings.borderWidth ?? 1))), borderStyle: String(settings.borderStyle ?? "dashed"),
    colorBoxes: settings.colorBoxes !== false, showLabels: settings.showLabels !== false,
  };
  const groups = new Map<string, { name: string; start: number; end: number; top: number; bottom: number }>();
  for (const b of bars) {
    if (b.time < cutoff) continue;
    const d = new Date(b.time * 1000), dow = d.getUTCDay();
    if (hideWeekends && (dow === 0 || dow === 6)) continue;
    const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const session of defs) {
      if (minute < session.start || minute >= session.end) continue;
      const startEpoch = day0 + session.start * 60;
      if (startEpoch < cutoff) continue;
      const sessionEnd = day0 + session.end * 60;
      const key = session.name + ":" + startEpoch;
      const g = groups.get(key);
      if (g) { g.end = sessionEnd; g.top = Math.max(g.top, b.high); g.bottom = Math.min(g.bottom, b.low); }
      else groups.set(key, { name: session.name, start: startEpoch, end: sessionEnd, top: b.high, bottom: b.low });
    }
  }
  return { type: "UNKNOWN", overlay: true, plots: [], multiSeries: [], hlines: [], levels: [], zones: [...groups.values()].sort((a,b)=>a.start-b.start).map(g => ({ kind: "fvg_bull" as const, top:g.top, bottom:g.bottom, startTime:g.start, endTime:g.end, label:g.name })) };
}
`;
s = s.slice(0, bStart) + fn + s.slice(bEnd);
const marker = "const isSession = /london|new york/i.test(z.label);";
const old = `const c = zoneColor(z.kind, z.label);\n          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);`;
const repl = `const c = zoneColor(z.kind, z.label);\n          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);\n          ${marker}`;
if (!s.includes(marker) && s.includes(old)) s = s.replace(old, repl);
const oldRect = `<rect x={rx} y={ry} width={Math.max(1, Math.abs(x2 - x1))} height={Math.abs(y2 - y1)} fill={c.fill} stroke={c.stroke} />\n              <text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>`;
const replRect = `<rect x={rx} y={ry} width={Math.max(1, Math.abs(x2 - x1))} height={Math.abs(y2 - y1)} fill={isSession && !marketSessionAppearance.colorBoxes ? "transparent" : c.fill} stroke={c.stroke} strokeWidth={isSession ? marketSessionAppearance.borderWidth : 1} strokeDasharray={isSession && marketSessionAppearance.borderStyle === "dashed" ? "6 4" : isSession && marketSessionAppearance.borderStyle === "dotted" ? "2 3" : undefined} />\n              {(!isSession || marketSessionAppearance.showLabels) && <text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>`;
if (s.includes(oldRect)) s = s.replace(oldRect, replRect);
fs.writeFileSync(p, s);
