import fs from "node:fs";

const p = "src/components/charts/CustomIndicatorRenderer.tsx";
if (!fs.existsSync(p)) throw new Error("CustomIndicatorRenderer.tsx not found");
let s = fs.readFileSync(p, "utf8");

if (!s.includes("MARKET_SESSIONS_SETTINGS_V3")) {
  const colorStart = s.indexOf("function zoneColor(");
  const colorEnd = s.indexOf("\nfunction levelColor(", colorStart);
  if (colorStart < 0 || colorEnd < 0) throw new Error("Market Sessions color markers not found");

  const colorBlock = `let marketSessionAppearance = {
  londonColor: "#4CAF4F",
  newYorkColor: "#2196F3",
  opacity: 1,
  borderWidth: 1,
  borderStyle: "dashed",
  colorBoxes: true,
  showLabels: true,
  sessionOC: true,
  halfline: false,
  labelsOnPriceScale: true,
};

function hexRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return [33, 149, 243];
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

function sessionColor(sessionId = "") {
  const hex = sessionId === "london" ? marketSessionAppearance.londonColor : marketSessionAppearance.newYorkColor;
  const [r, g, b] = hexRgb(hex);
  const a = Math.max(0, Math.min(1, Number(marketSessionAppearance.opacity) || 0));
  return { fill: \`rgba(\${r},\${g},\${b},\${0.16 * a})\`, stroke: \`rgba(\${r},\${g},\${b},\${0.8 * a})\` };
}

// MARKET_SESSIONS_SETTINGS_V3
function zoneColor(k: PineZone["kind"], label = "") {
  const n = label.toLowerCase();
  if (n.includes("london")) return sessionColor("london");
  if (n.includes("new york")) return sessionColor("newyork");
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
  s = s.slice(0, colorStart) + colorBlock + s.slice(colorEnd);
}

const bStart = s.indexOf("function buildMarketSessions(");
const bEnd = s.indexOf("\n\nconst SMCOverlay", bStart);
if (bStart < 0 || bEnd < 0) throw new Error("buildMarketSessions markers not found");

const fn = `function parseSessionTime(v: unknown, fallbackStart: number, fallbackEnd: number) {
  const m = /^(\\d{2})(\\d{2})-(\\d{2})(\\d{2})$/.exec(String(v ?? ""));
  if (!m) return { start: fallbackStart, end: fallbackEnd };
  return { start: Number(m[1]) * 60 + Number(m[2]), end: Number(m[3]) * 60 + Number(m[4]) };
}

function buildMarketSessions(bars: OHLCBar[], settings: Record<string, unknown>): ParsedPineResult {
  const daysBack = Math.max(1, Number(settings.daysBack) || 150);
  const cutoff = Date.now() / 1000 - daysBack * 86400;
  const hideWeekends = settings.hideWeekends !== false;
  const london = parseSessionTime(settings.LondonTime, 7 * 60, 16 * 60);
  const newYork = parseSessionTime(settings.NewYorkTime, 13 * 60, 22 * 60);
  const defs = [
    { id: "london", name: String(settings.stringLondon ?? "London"), start: london.start, end: london.end, enabled: settings.showLondon !== false },
    { id: "newyork", name: String(settings.stringNewYork ?? "New York"), start: newYork.start, end: newYork.end, enabled: settings.showNewYork !== false },
  ].filter(v => v.enabled && v.end > v.start);

  marketSessionAppearance = {
    londonColor: String(settings.londonColor ?? "#4CAF4F"),
    newYorkColor: String(settings.newYorkColor ?? "#2196F3"),
    opacity: Math.max(0, Math.min(1, Number(settings.opacity ?? 1))),
    borderWidth: Math.max(1, Math.min(4, Number(settings.borderWidth ?? 1))),
    borderStyle: String(settings.borderStyle ?? "dashed"),
    colorBoxes: settings.colorBoxes !== false,
    showLabels: settings.showLabels !== false,
    sessionOC: settings.sessionOC !== false,
    halfline: settings.halfline === true,
    labelsOnPriceScale: settings.labelsOnPriceScale !== false,
  };

  const groups = new Map<string, { id: string; name: string; start: number; end: number; top: number; bottom: number; open: number; close: number }>();
  for (const b of bars) {
    if (b.time < cutoff) continue;
    const d = new Date(b.time * 1000);
    const dow = d.getUTCDay();
    if (hideWeekends && (dow === 0 || dow === 6)) continue;
    const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const session of defs) {
      if (minute < session.start || minute >= session.end) continue;
      const startEpoch = day0 + session.start * 60;
      if (startEpoch < cutoff) continue;
      const endEpoch = day0 + session.end * 60;
      const key = session.id + ":" + startEpoch;
      const g = groups.get(key);
      if (g) {
        g.end = endEpoch;
        g.top = Math.max(g.top, b.high);
        g.bottom = Math.min(g.bottom, b.low);
        g.close = b.close;
      } else {
        groups.set(key, { id: session.id, name: session.name, start: startEpoch, end: endEpoch, top: b.high, bottom: b.low, open: b.open, close: b.close });
      }
    }
  }

  return {
    type: "UNKNOWN",
    overlay: true,
    plots: [],
    multiSeries: [],
    hlines: [],
    levels: [],
    zones: [...groups.values()].sort((a, b) => a.start - b.start).map(g => ({
      kind: "fvg_bull" as const,
      top: g.top,
      bottom: g.bottom,
      startTime: g.start,
      endTime: g.end,
      label: g.name,
      session: { id: g.id, open: g.open, close: g.close, mid: (g.top + g.bottom) / 2 },
    } as unknown as PineZone)),
  };
}
`;
s = s.slice(0, bStart) + fn + s.slice(bEnd);

const zonesStart = s.indexOf("{result.zones.map((z, i) => {");
const levelsStart = s.indexOf("{result.levels.map((l, i) => {", zonesStart);
if (zonesStart >= 0 && levelsStart > zonesStart) {
  const zonesBlock = `{result.zones.map((z, i) => {
          const x1 = x(z.startTime), x2 = x(z.endTime), y1 = y(z.top), y2 = y(z.bottom);
          if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
          const c = zoneColor(z.kind, z.label);
          const meta = (z as PineZone & { session?: { id: string; open: number; close: number; mid: number } }).session;
          const isSession = Boolean(meta);
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const dash = isSession ? (marketSessionAppearance.borderStyle === "dotted" ? "2 3" : marketSessionAppearance.borderStyle === "dashed" ? "6 4" : undefined) : undefined;
          return (
            <g key={\`\${z.label}-\${z.startTime}-\${i}\`}>
              <rect x={rx} y={ry} width={Math.max(1, Math.abs(x2 - x1))} height={Math.abs(y2 - y1)} fill={isSession && !marketSessionAppearance.colorBoxes ? "transparent" : c.fill} stroke={c.stroke} strokeWidth={isSession ? marketSessionAppearance.borderWidth : 1} strokeDasharray={dash} />
              {(!isSession || marketSessionAppearance.showLabels) && <text x={rx + 4} y={Math.max(10, ry + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>}
              {isSession && meta && marketSessionAppearance.sessionOC && <line x1={x1} y1={y(meta.open) ?? ry} x2={x2} y2={y(meta.close) ?? ry} stroke={c.stroke} strokeWidth={Math.max(1, marketSessionAppearance.borderWidth)} />}
              {isSession && meta && marketSessionAppearance.halfline && <line x1={x1} y1={y(meta.mid) ?? ry} x2={x2} y2={y(meta.mid) ?? ry} stroke={c.stroke} strokeWidth={1} strokeDasharray="4 4" />}
            </g>
          );
        })}
        `;
  s = s.slice(0, zonesStart) + zonesBlock + s.slice(levelsStart);
}

fs.writeFileSync(p, s);
console.log("[fix-market-sessions-settings] Market Sessions settings patch applied");
