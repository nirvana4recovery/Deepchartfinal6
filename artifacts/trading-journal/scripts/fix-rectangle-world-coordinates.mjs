import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(file)) throw new Error(`DrawingOverlay.tsx not found: ${file}`);

const src = fs.readFileSync(file, "utf8");

// This fix is already integrated into DrawingOverlay in the current source.
// Keep the build patch non-fatal when the older target block is no longer present.
if (
  src.includes("// [chart-fix] World-space drawing coordinate interpolation for rectangles") ||
  src.includes("Future-time points: derive the mapping from the actual last loaded bar") ||
  src.includes("const barHalfWidth = useMemo")
) {
  console.log("[rectangle-world-coordinates] Current world-coordinate implementation already present; no changes required.");
  process.exit(0);
}

console.log("[rectangle-world-coordinates] Target implementation not present; leaving source unchanged to keep build safe.");
