import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/MobileChartLayout.tsx");
let s = fs.readFileSync(file, "utf8");

s = s.replace("Pencil, Plug, MoreHorizontal, Maximize2, Minimize2,", "Pencil, MoreHorizontal, Maximize2, Minimize2,");

const miniProps = `  const MiniControlBar = memo(function MiniControlBar({
  activeKey, badge, interval, watchlistItems,
  onSelectSymbol, onTF, onTrade, onDraw, onBroker, onMore, onPrev, onNext, onFullscreen, isFullscreen,
  brokerConnected,
}: {`;
const miniPropsNew = `const MiniControlBar = memo(function MiniControlBar({
  activeKey, badge, interval, watchlistItems,
  onSelectSymbol, onTF, onTrade, onDraw, onBroker, onMore, onPrev, onNext, onFullscreen, isFullscreen,
  brokerConnected,
}: {`;
if (s.includes(miniProps)) s = s.replace(miniProps, miniPropsNew);

const currentPencil = `        {/* Pencil / drawing tools */}
        <CtrlBtn onClick={onDraw}>
          <Pencil style={{ width:17, height:17, color: GL_TEAL }} />
        </CtrlBtn>`;

const oldPencilWithBroker = `        {/* Pencil / drawing tools */}
        <CtrlBtn onClick={onDraw}>
          <Pencil style={{ width:17, height:17, color: GL_TEAL }} />
        </CtrlBtn>

        {/* Broker connect */}
        <CtrlBtn onClick={onBroker}>
          <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Plug style={{ width:17, height:17, color: brokerConnected ? "#B7FF5A" : GL_TEAL }} />
            <div style={{
              position:"absolute", top:-3, right:-4,
              width:7, height:7, borderRadius:"50%",
              background: brokerConnected ? "#22C55E" : "rgba(167,184,169,0.35)",
              border: "1.5px solid rgba(11,16,23,0.9)",
              boxShadow: brokerConnected ? "0 0 6px rgba(34,197,94,0.7)" : "none",
              transition: "background 0.3s, box-shadow 0.3s",
            }} />
          </div>
        </CtrlBtn>`;

const newDrawingButton = `        {/* Tools — simple orange action, no glow */}
        <button
          onClick={onDraw}
          aria-label="Tools"
          style={{
            height:42, minWidth:148, padding:"0 18px",
            borderRadius:22,
            display:"inline-flex", alignItems:"center", justifyContent:"center", gap:9,
            flexShrink:0, cursor:"pointer", outline:"none",
            color:"#ffffff",
            background:"linear-gradient(180deg,#ff7a00 0%,#ff5a00 100%)",
            border:"1px solid rgba(255,191,122,0.38)",
            boxShadow:"none",
            fontSize:15, fontWeight:700, letterSpacing:"-0.1px",
            touchAction:"manipulation",
            transition:"transform .12s ease",
          }}
          onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform="scale(0.97)"; }}
          onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform="scale(1)"; }}
          onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform="scale(1)"; }}
        >
          <Pencil style={{ width:18, height:18, color:"#ffffff", strokeWidth:2.2 }} />
          <span>Tools</span>
        </button>`;

let changed = false;
if (s.includes(oldPencilWithBroker)) {
  s = s.replace(oldPencilWithBroker, newDrawingButton);
  changed = true;
} else if (s.includes(currentPencil)) {
  s = s.replace(currentPencil, newDrawingButton);
  changed = true;
} else if (s.includes('<span>Tools</span>') && s.includes('aria-label="Tools"')) {
  changed = true;
}

fs.writeFileSync(file, s, "utf8");
console.log(changed ? "Applied mobile Tools CTA." : "Mobile Tools CTA already applied; no changes needed.");
