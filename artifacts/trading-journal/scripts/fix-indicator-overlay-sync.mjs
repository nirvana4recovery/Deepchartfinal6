import fs from "node:fs";
import path from "node:path";

// Keep the build deterministic. Indicator overlays are rendered by
// CustomIndicatorRenderer itself; this build hook is intentionally a no-op.
// Runtime viewport updates are handled by the chart component so the build
// does not depend on brittle source-text replacement.
const target = path.resolve("src/components/charts/CustomIndicatorRenderer.tsx");
if (!fs.existsSync(target)) throw new Error("CustomIndicatorRenderer.tsx not found");
console.log("[fix-indicator-overlay-sync] runtime overlay implementation preserved");
