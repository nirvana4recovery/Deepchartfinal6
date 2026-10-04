const fs = require('fs');
const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');
const sourcePath = path.join(repoRoot, 'artifacts/trading-journal/src/components/charts/CustomIndicatorRenderer.tsx');
let s = fs.readFileSync(sourcePath, 'utf8');
const start = s.indexOf('const SMCOverlay = memo(function SMCOverlay');
const endMarker = '\n\ninterface IndSeries';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('SMCOverlay block not found');
const replacement = String.raw`const SMCOverlay = memo(function SMCOverlay({ result, visible }: { result: ParsedPineResult; visible: boolean }) {
  const { chart, candle } = useChartContext();
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Keep SVG nodes stable and update only their geometry in RAF. React state
  // rerenders can commit behind Lightweight Charts during touch scrolling,
  // making session/SMC drawings visibly trail the candles.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visible) return;

    host.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.display = 'block';
    svg.style.pointerEvents = 'none';
    host.appendChild(svg);
    svgRef.current = svg;

    const groups = result.zones.map((z, i) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const c = zoneColor(z.kind, z.label);
      rect.setAttribute('fill', c.fill);
      rect.setAttribute('stroke', c.stroke);
      text.setAttribute('font-size', '9');
      text.setAttribute('fill', c.stroke);
      text.textContent = z.label;
      g.append(rect, text);
      svg.appendChild(g);
      return { z, rect, text };
    });

    const levels = result.levels.map((l) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const c = levelColor(l.kind);
      line.setAttribute('stroke', c);
      line.setAttribute('stroke-dasharray', '6 4');
      rect.setAttribute('fill', c);
      rect.setAttribute('rx', '3');
      text.setAttribute('font-size', '8.5');
      text.setAttribute('fill', '#111');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = l.label;
      g.append(line, rect, text);
      svg.appendChild(g);
      return { l, line, rect, text };
    });

    let raf = 0;
    let active = true;
    const render = () => {
      if (!active || !chart || !candle || !svgRef.current) return;
      const hostHeight = host.clientHeight || 500;
      let W = host.clientWidth || 1;
      try {
        const w = chart.timeScale().width();
        if (Number.isFinite(w) && w > 0) W = w;
      } catch {}

      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(hostHeight));
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + hostHeight);
      host.style.width = String(W) + 'px';
      host.style.height = String(hostHeight) + 'px';

      const timeToX = (t) => {
        try {
          const c = chart.timeScale().timeToCoordinate(t);
          return c != null && Number.isFinite(c) ? Math.max(0, Math.min(W, c)) : null;
        } catch { return null; }
      };
      const priceToY = (p) => {
        try {
          const c = candle.priceToCoordinate(p);
          return c != null && Number.isFinite(c) ? Math.max(0, Math.min(hostHeight, c)) : null;
        } catch { return null; }
      };

      for (const item of groups) {
        const x1 = timeToX(item.z.startTime);
        const x2 = timeToX(item.z.endTime);
        const y1 = priceToY(item.z.top);
        const y2 = priceToY(item.z.bottom);
        if (x1 == null || x2 == null || y1 == null || y2 == null) {
          item.rect.style.display = 'none';
          item.text.style.display = 'none';
          continue;
        }
        item.rect.style.display = '';
        item.text.style.display = '';
        const rx = Math.min(x1, x2);
        const ry = Math.min(y1, y2);
        item.rect.setAttribute('x', String(rx));
        item.rect.setAttribute('y', String(ry));
        item.rect.setAttribute('width', String(Math.max(1, Math.abs(x2 - x1))));
        item.rect.setAttribute('height', String(Math.abs(y2 - y1)));
        item.text.setAttribute('x', String(rx + 4));
        item.text.setAttribute('y', String(Math.max(10, ry + 12)));
      }

      for (const item of levels) {
        const x = timeToX(item.l.time);
        const y = priceToY(item.l.price);
        if (x == null || y == null) {
          item.line.style.display = 'none';
          item.rect.style.display = 'none';
          item.text.style.display = 'none';
          continue;
        }
        item.line.style.display = '';
        item.rect.style.display = '';
        item.text.style.display = '';
        item.line.setAttribute('x1', String(x));
        item.line.setAttribute('y1', String(y));
        item.line.setAttribute('x2', String(W));
        item.line.setAttribute('y2', String(y));
        item.rect.setAttribute('x', String(W - 36));
        item.rect.setAttribute('y', String(y - 8));
        item.rect.setAttribute('width', '34');
        item.rect.setAttribute('height', '14');
        item.text.setAttribute('x', String(W - 19));
        item.text.setAttribute('y', String(y + 4));
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      svgRef.current = null;
      host.replaceChildren();
    };
  }, [chart, candle, result, visible]);

  if (!visible) return null;
  return <div ref={hostRef} style={{ position: 'absolute', left: 0, top: 0, height: '100%', pointerEvents: 'none', zIndex: 15, overflow: 'hidden' }} />;
});`;
s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(sourcePath, s);
