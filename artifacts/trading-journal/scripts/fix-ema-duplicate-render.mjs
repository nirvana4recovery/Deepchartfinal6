import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../src/components/charts/CustomIndicatorRenderer.tsx");
let src = fs.readFileSync(file, "utf8");

const marker = 'const renderable = appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode));';
const replacement = `const renderable = (() => {
    const seen = new Set<string>();
    return appliedIndicators.filter(i => i.type === "CUSTOM" || Boolean(i.pineCode)).filter(i => {
      // Prevent the same built-in indicator from being rendered twice when
      // duplicate persisted entries exist (legacy migration + manual add, etc.).
      // Different periods/sources remain independent indicators.
      const parsed = i.pineCode ? parsePineScript(i.pineCode) : null;
      const isBuiltin = i.type === "EMA" || i.type === "SMA" || i.type === "RSI" || i.type === "VWAP";
      if (!isBuiltin || !parsed) return true;
      const settings = i.settings ?? {};
      const signature = JSON.stringify({
        type: i.type,
        parsedType: parsed.type,
        period: settings.period ?? null,
        source: settings.source ?? "close",
      });
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  })();`;

if (!src.includes(marker)) {
  if (src.includes("const renderable = (() => {")) {
    console.log("[fix-ema-duplicate-render] already applied");
    process.exit(0);
  }
  throw new Error("CustomIndicatorRenderer renderable marker not found");
}

src = src.replace(marker, replacement);
fs.writeFileSync(file, src);
console.log("[fix-ema-duplicate-render] applied");
