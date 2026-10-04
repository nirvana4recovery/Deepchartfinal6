import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/components/charts/CustomIndicatorRenderer.tsx");
let source = fs.readFileSync(file, "utf8");
const start = source.indexOf("const SMCOverlay=memo(function SMCOverlay");
const end = source.indexOf("\n\ninterface IndSeries", start);
if (start < 0 || end < 0) throw new Error("SMCOverlay block not found");

const replacement = [
  'const SMCOverlay=memo(function SMCOverlay({result,visible}:{result:ParsedPineResult;visible:boolean}){',
  '  const {chart,candle}=useChartContext();',
  '  const ref=useRef<HTMLDivElement>(null);',
  '  const [size,setSize]=useState({w:0,h:0});',
  '  useEffect(()=>{',
  '    const el=ref.current;if(!el)return;',
  '    const ro=new ResizeObserver(es=>{const e=es[0];if(e)setSize({w:e.contentRect.width,h:e.contentRect.height})});',
  '    ro.observe(el);setSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect();',
  '  },[]);',
  '  useEffect(()=>{',
  '    if(!chart||!visible)return;let raf=0;',
  '    const tick=()=>{',
  '      const root=ref.current;const ts=chart.timeScale();const series=candle;',
  '      if(root&&series){',
  '        const w=root.clientWidth||size.w||800;',
  '        const svg=root.querySelector("svg[data-synced-indicator-overlay]");',
  '        if(svg){',
  '          svg.setAttribute("width",String(w));svg.setAttribute("height",String(root.clientHeight||size.h||500));',
  '          const zones=svg.querySelectorAll("[data-zone]");',
  '          zones.forEach(node=>{',
  '            const g=node as SVGGElement;',
  '            const x1Time=Number(g.getAttribute("data-x1-time"));const x2Time=Number(g.getAttribute("data-x2-time"));',
  '            const top=Number(g.getAttribute("data-top-price"));const bottom=Number(g.getAttribute("data-bottom-price"));',
  '            let x1=ts.timeToCoordinate(x1Time as Time);let x2=ts.timeToCoordinate(x2Time as Time);',
  '            const y1=series.priceToCoordinate(top);const y2=series.priceToCoordinate(bottom);',
  '            const vr=ts.getVisibleRange();',
  '            if(x1==null&&vr){const from=typeof vr.from==="number"?vr.from:0;const to=typeof vr.to==="number"?vr.to:0;x1=x1Time<=from?0:x1Time>=to?w:null;}',
  '            if(x2==null&&vr){const from=typeof vr.from==="number"?vr.from:0;const to=typeof vr.to==="number"?vr.to:0;x2=x2Time<=from?0:x2Time>=to?w:null;}',
  '            if(x1==null||x2==null||y1==null||y2==null){g.setAttribute("visibility","hidden");return;}',
  '            g.setAttribute("visibility","visible");const rx=Math.min(Number(x1),Number(x2));const ry=Math.min(Number(y1),Number(y2));',
  '            const rect=g.querySelector("[data-zone-rect]") as SVGRectElement|null;const text=g.querySelector("[data-zone-label]") as SVGTextElement|null;',
  '            if(rect){rect.setAttribute("x",String(rx));rect.setAttribute("y",String(ry));rect.setAttribute("width",String(Math.max(1,Math.abs(Number(x2)-Number(x1)))));rect.setAttribute("height",String(Math.abs(Number(y2)-Number(y1))));}',
  '            if(text){text.setAttribute("x",String(rx+4));text.setAttribute("y",String(Math.max(10,ry+12)));}',
  '          });',
  '          const levels=svg.querySelectorAll("[data-level]");',
  '          levels.forEach(node=>{',
  '            const g=node as SVGGElement;const t=Number(g.getAttribute("data-level-time"));const p=Number(g.getAttribute("data-level-price"));',
  '            const x=ts.timeToCoordinate(t as Time);const y=series.priceToCoordinate(p);',
  '            if(x==null||y==null){g.setAttribute("visibility","hidden");return;}g.setAttribute("visibility","visible");',
  '            const line=g.querySelector("[data-level-line]") as SVGLineElement|null;const bg=g.querySelector("[data-level-bg]") as SVGRectElement|null;const label=g.querySelector("[data-level-label]") as SVGTextElement|null;',
  '            if(line){line.setAttribute("x1",String(x));line.setAttribute("y1",String(y));line.setAttribute("x2",String(w));line.setAttribute("y2",String(y));}',
  '            if(bg){bg.setAttribute("x",String(w-36));bg.setAttribute("y",String(Number(y)-8));}',
  '            if(label){label.setAttribute("x",String(w-19));label.setAttribute("y",String(Number(y)+4));}',
  '          });',
  '        }',
  '      }',
  '      raf=requestAnimationFrame(tick);',
  '    };',
  '    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);',
  '  },[chart,candle,visible,size.w,size.h]);',
  '  if(!visible)return null;const W=size.w||800,H=size.h||500;',
  '  return <div ref={ref} style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:15,overflow:"hidden"}}><svg data-synced-indicator-overlay width={W} height={H} style={{position:"absolute",inset:0}}>',
  '    {result.zones.map((z,i)=>{const c=zoneColor(z.kind,z.label);return <g key={i} data-zone data-x1-time={z.startTime} data-x2-time={z.endTime} data-top-price={z.top} data-bottom-price={z.bottom}><rect data-zone-rect fill={c.fill} stroke={c.stroke}/><text data-zone-label fontSize={9} fill={c.stroke}>{z.label}</text></g>})}',
  '    {result.levels.map((l,i)=>{const c=levelColor(l.kind);return <g key={i} data-level data-level-time={l.time} data-level-price={l.price}><line data-level-line stroke={c} strokeDasharray="6 4"/><rect data-level-bg width={34} height={14} rx={3} fill={c}/><text data-level-label fontSize={8.5} fill="#111" textAnchor="middle">{l.label}</text></g>})}',
  '  </svg></div>',
  '});',
].join("\n");

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log("[fix-indicator-overlay-sync] patched CustomIndicatorRenderer.tsx");
