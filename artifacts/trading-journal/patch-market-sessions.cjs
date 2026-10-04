const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "src/components/charts/CustomIndicatorRenderer.tsx");
let s = fs.readFileSync(file, "utf8");

function replaceBlock(source, start, end, replacement) {
  const a = source.indexOf(start);
  if (a < 0) throw new Error(`Patch start not found: ${start}`);
  const b = source.indexOf(end, a);
  if (b < 0) throw new Error(`Patch end not found: ${end}`);
  return source.slice(0, a) + replacement + source.slice(b);
}

const newZoneColor = `function hexToRgba(hex, alpha) {
  const h = String(hex || "#4CAF4F").replace("#", "");
  const full = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return \`rgba(76,175,79,\${alpha})\`;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return \`rgba(\${r},\${g},\${b},\${Math.max(0, Math.min(1, alpha))})\`;
}

function zoneColor(k: PineZone["kind"], label = "", sessionColor, sessionOpacity = 1) {
  if (sessionColor) return {
    fill: hexToRgba(sessionColor, 0.16 * sessionOpacity),
    stroke: hexToRgba(sessionColor, 0.80 * sessionOpacity),
  };
  const n = label.toLowerCase();
  if (n.includes("london")) return { fill: "rgba(76,175,79,.16)", stroke: "rgba(76,175,79,.80)" };
  if (n.includes("new york")) return { fill: "rgba(33,149,243,.16)", stroke: "rgba(33,149,243,.80)" };
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
s = replaceBlock(s, "function zoneColor(", "function levelColor", newZoneColor + "function levelColor");

const newBuild = `function parseSessionMinutes(value, fallbackStart, fallbackEnd) {
  const m = String(value ?? "").match(/^(\\d{2})(\\d{2})-(\\d{2})(\\d{2})$/);
  if (!m) return { start: fallbackStart, end: fallbackEnd };
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return { start: Math.max(0, Math.min(1439, start)), end: Math.max(0, Math.min(1440, end)) };
}

function buildMarketSessions(bars: OHLCBar[], settings: Record<string, unknown>): ParsedPineResult {
  const daysBack = Math.max(1, Number(settings.daysBack) || 150);
  const cutoff = Date.now() / 1000 - daysBack * 86400;
  const hideWeekends = settings.hideWeekends !== false;
  const defs = [];
  if (settings.showLondon !== false) {
    const t = parseSessionMinutes(settings.LondonTime, 420, 960);
    defs.push({ name: String(settings.stringLondon || "London"), color: String(settings.londonColor || "#4CAF4F"), start: t.start, end: t.end });
  }
  if (settings.showNewYork !== false) {
    const t = parseSessionMinutes(settings.NewYorkTime, 780, 1320);
    defs.push({ name: String(settings.stringNewYork || "New York"), color: String(settings.newYorkColor || "#2196F3"), start: t.start, end: t.end });
  }
  const opacity = Math.max(0, Math.min(1, Number(settings.opacity ?? 1)));
  const borderWidth = Math.max(1, Math.min(4, Number(settings.borderWidth ?? 1)));
  const borderStyle = String(settings.borderStyle || "dashed");
  const displayType = String(settings.displayType || "Boxes");
  const showLabels = settings.showLabels !== false;
  const colorBoxes = settings.colorBoxes !== false;
  const showOC = settings.sessionOC !== false;
  const halfline = settings.halfline === true;
  const groups = new Map<string, any>();

  for (const b of bars) {
    if (b.time < cutoff) continue;
    const d = new Date(b.time * 1000);
    const dow = d.getUTCDay();
    if (hideWeekends && (dow === 0 || dow === 6)) continue;
    const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const session of defs) {
      let startEpoch = day0 + session.start * 60;
      let endEpoch = day0 + session.end * 60;
      if (session.end <= session.start) endEpoch += 86400;
      let inSession = false;
      if (session.end > session.start) inSession = minute >= session.start && minute < session.end;
      else inSession = minute >= session.start || minute < session.end;
      if (!inSession) continue;
      if (startEpoch < cutoff) continue;
      if (minute < session.start && session.end <= session.start) startEpoch -= 86400;
      if (minute < session.start && session.end <= session.start) endEpoch = day0 + session.end * 60;
      const key = `${session.name}:${startEpoch}`;
      const g = groups.get(key);
      if (g) {
        g.end = Math.max(g.end, Math.min(endEpoch, b.time));
        g.top = Math.max(g.top, b.high);
        g.bottom = Math.min(g.bottom, b.low);
        g.close = b.close;
      } else {
        groups.set(key, {
          name: session.name,
          color: session.color,
          start: startEpoch,
          end: endEpoch,
          top: b.high,
          bottom: b.low,
          open: b.open,
          close: b.close,
        });
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
      sessionColor: g.color,
      sessionOpacity: opacity,
      borderWidth,
      borderStyle,
      displayType,
      showLabel: showLabels,
      colorBoxes,
      showOC,
      openPrice: g.open,
      closePrice: g.close,
      showHalfline: halfline,
      midpoint: (g.top + g.bottom) / 2,
    } as any)),
  };
}

`;
s = replaceBlock(s, "function buildMarketSessions(", "const SMCOverlay", newBuild + "const SMCOverlay");

s = s.replace('const c = zoneColor(z.kind, z.label);', 'const c = zoneColor(z.kind, z.label, (z as any).sessionColor, Number((z as any).sessionOpacity ?? 1));');

const oldZoneMap = /        \{result\.zones\.map\(\(z, i\) => \{[\s\S]*?        \}\)\}\n        \{result\.levels\.map/;
const newZoneMap = `        {result.zones.map((z, i) => {
          const x1 = x(z.startTime), x2 = x(z.endTime), y1 = y(z.top), y2 = y(z.bottom);
          if (x1 == null || x2 == null) return null;
          const c = zoneColor(z.kind, z.label, (z as any).sessionColor, Number((z as any).sessionOpacity ?? 1));
          const mode = String((z as any).displayType || "Boxes");
          const rx = Math.min(x1, x2);
          const ry = y1 == null ? 0 : Math.min(y1, y2 ?? y1);
          const boxTop = mode === "Zones" ? 0 : mode === "Timeline" ? H - 10 : ry;
          const boxBottom = mode === "Zones" ? H : mode === "Timeline" ? H : (y2 == null ? H : Math.max(y1 ?? 0, y2));
          const strokeWidth = Number((z as any).borderWidth ?? 1);
          const dash = (z as any).borderStyle === "dotted" ? "2 4" : (z as any).borderStyle === "dashed" ? "6 4" : undefined;
          const fill = (z as any).colorBoxes === false || mode === "Timeline" ? "transparent" : c.fill;
          const showLabel = (z as any).showLabel !== false && mode !== "Timeline";
          const openY = y(Number((z as any).openPrice));
          const closeY = y(Number((z as any).closePrice));
          const midY = y(Number((z as any).midpoint));
          return (
            <g key={\`${z.label}-${z.startTime}-${i}\`}>
              {mode !== "Candles" && <rect x={rx} y={boxTop} width={Math.max(1, Math.abs(x2 - x1))} height={Math.max(1, Math.abs(boxBottom - boxTop))} fill={fill} stroke={c.stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />}
              {showLabel && <text x={rx + 4} y={Math.max(10, boxTop + 12)} fontSize={9} fill={c.stroke}>{z.label}</text>}
              {(z as any).showOC && openY != null && closeY != null && <line x1={x1} y1={openY} x2={x2} y2={closeY} stroke={c.stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />}
              {(z as any).showHalfline && midY != null && <line x1={x1} y1={midY} x2={x2} y2={midY} stroke={c.stroke} strokeWidth={strokeWidth} strokeDasharray="2 4" />}
            </g>
          );
        })}
        {result.levels.map`;
if (!oldZoneMap.test(s)) throw new Error("Session zone renderer block not found");
s = s.replace(oldZoneMap, newZoneMap);

fs.writeFileSync(file, s);
console.log("Market Sessions renderer patched for live Inputs/Style settings.");
