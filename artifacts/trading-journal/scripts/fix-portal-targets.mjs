import fs from "node:fs";

const file = "src/pages/trades.tsx";
let source = fs.readFileSync(file, "utf8");

// The custom mobile sheets are already fixed-position elements, so they do not
// need React portals. Portals were causing React #299 in production when their
// target was unavailable during an early render. Keep the UI identical while
// rendering the sheets in the normal React tree.
source = source.replace(
  'import { createPortal } from "react-dom";\n',
  "",
);

const openPattern = /return createPortal\(\n/g;
const closePattern = /\n\s*document\.body,\n\s*\);/g;

const openMatches = source.match(openPattern)?.length ?? 0;
const closeMatches = source.match(closePattern)?.length ?? 0;

source = source.replace(openPattern, "return (\n");
source = source.replace(closePattern, "\n  );");

if (openMatches > 0 || closeMatches > 0) {
  fs.writeFileSync(file, source);
  console.log(
    `Removed ${openMatches} custom portal call(s) and ${closeMatches} portal target(s).`,
  );
} else {
  console.log("Custom portal calls already removed; no changes needed.");
}
