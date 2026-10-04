import { useEffect, useRef } from "react";
import { useChartContext } from "@/contexts/ChartContext";

const SESSIONS = [
  { name: "London", timeZone: "Europe/London", startHour: 8, endHour: 17, color: [76, 175, 80] as const },
  { name: "New York", timeZone: "America/New_York", startHour: 8, endHour: 17, color: [66, 133, 244] as const },
];

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

function localToUtcMs(y: number, m: number, d: number, hour: number, timeZone: string) {
  const localAsUtc = Date.UTC(y, m - 1, d, hour, 0, 0);
  let guess = localAsUtc;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, timeZone);
    const zonedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += localAsUtc - zonedAsUtc;
  }
  return guess;
}

function dayKey(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function drawSessionBands(canvas: HTMLCanvasElement, chart: any) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  let range: any = null;
  try { range = chart.timeScale().getVisibleRange(); } catch { return; }
  if (!range) return;
  const from = Number(range.from);
  const to = Number(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

  const startDay = dayKey((from - 172800) * 1000);
  const endDay = dayKey((to + 172800) * 1000);

  for (let day = startDay; day <= endDay; day += 86400000) {
    const base = new Date(day);
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth() + 1;
    const d = base.getUTCDate();

    for (const session of SESSIONS) {
      const startSec = localToUtcMs(y, m, d, session.startHour, session.timeZone) / 1000;
      const endSec = localToUtcMs(y, m, d, session.endHour, session.timeZone) / 1000;
      const x1 = chart.timeScale().timeToCoordinate(startSec);
      const x2 = chart.timeScale().timeToCoordinate(endSec);
      if (x1 == null && x2 == null) continue;

      const left = Math.max(0, Math.min(width, Number(x1 ?? 0)));
      const right = Math.max(0, Math.min(width, Number(x2 ?? width)));
      if (right <= 0 || left >= width || right <= left) continue;

      const [r, g, b] = session.color;
      const span = right - left;
      const edge = Math.min(0.22, Math.max(0.06, 36 / Math.max(1, span)));
      const grad = ctx.createLinearGradient(left, 0, right, 0);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(edge, `rgba(${r},${g},${b},0.075)`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},0.105)`);
      grad.addColorStop(1 - edge, `rgba(${r},${g},${b},0.075)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(left, 0, span, height);
    }
  }
}

export default function SessionBackgroundOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { chart } = useChartContext();

  useEffect(() => {
    if (!chart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawSessionBands(canvas, chart);
    redraw();

    const ro = new ResizeObserver(redraw);
    ro.observe(canvas.parentElement ?? canvas);
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(redraw);
    const timer = window.setInterval(redraw, 60000);

    return () => {
      ro.disconnect();
      ts.unsubscribeVisibleLogicalRangeChange(redraw);
      window.clearInterval(timer);
    };
  }, [chart]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}
