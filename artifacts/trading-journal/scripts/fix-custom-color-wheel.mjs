import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../src/components/ColorPickerGlass.tsx');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('CUSTOM_COLOR_WHEEL_PATCH_V1')) process.exit(0);

const helperMarker = 'function alphaFromValue(val: string): number {';
const helper = `// CUSTOM_COLOR_WHEEL_PATCH_V1
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return '#' + [r, g, b].map(v => toH2((v + m) * 255)).join('');
}

`;
if (!s.includes(helperMarker)) throw new Error('alphaFromValue marker missing');
s = s.replace(helperMarker, helper + helperMarker);

const stateNeedle = 'const [showHexInput, setShowHexInput] = useState(false);';
if (!s.includes(stateNeedle)) throw new Error('state marker missing');
s = s.replace(stateNeedle, stateNeedle + '\n  const [showCustomWheel, setShowCustomWheel] = useState(false);');

const callbackNeedle = `  const applyHexInput = useCallback((raw: string) => {`;
const callback = `  const handleWheelPick = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    const hue = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    const h6 = hslToHex(hue, 1, 0.5).replace('#', '').toUpperCase();
    setHex6(h6);
    setHexIn(h6);
    setAlpha(1);
    setRecents(prev => pushRecent(prev, h6));
    emit(h6, 1);
  }, [emit]);

`;
if (!s.includes(callbackNeedle)) throw new Error('callback marker missing');
s = s.replace(callbackNeedle, callback + callbackNeedle);

const plusNeedle = 'onClick={e => { e.stopPropagation(); addCurrentToRecents(); }}';
if (!s.includes(plusNeedle)) throw new Error('plus handler marker missing');
s = s.replace(plusNeedle, 'onClick={e => { e.stopPropagation(); setShowCustomWheel(v => !v); }}');

const sep = '        {/* ── Separator ──────────────────────────────────────────────────────── */}';
const wheel = `        {showCustomWheel && (
          <div
            style={{
              margin: '4px 0 10px', padding: 10, borderRadius: 10,
              background: 'rgba(12,15,20,0.96)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div
              role="slider"
              aria-label="Custom color wheel"
              onPointerDown={handleWheelPick}
              style={{
                width: 150, height: 150, borderRadius: '50%', cursor: 'crosshair',
                background: 'conic-gradient(#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)',
                padding: 12, boxSizing: 'border-box',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: currentHex, border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
              }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
              <div style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.72)', fontFamily: 'monospace' }}>{currentHex}</div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); addCurrentToRecents(); setShowCustomWheel(false); }}
                onPointerDown={e => e.stopPropagation()}
                style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 9px', background: 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 11 }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowCustomWheel(false); }}
                onPointerDown={e => e.stopPropagation()}
                style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 9px', background: 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 11 }}
              >
                Done
              </button>
            </div>
          </div>
        )}

`;
if (!s.includes(sep)) throw new Error('separator marker missing');
s = s.replace(sep, wheel + sep);
fs.writeFileSync(file, s);
console.log('CUSTOM_COLOR_WHEEL_PATCH_V1 applied');
