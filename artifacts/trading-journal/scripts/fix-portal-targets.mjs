import fs from "node:fs";

const file = "src/pages/trades.tsx";
let source = fs.readFileSync(file, "utf8");

const needle = "return createPortal(";
const guard = "if (typeof document === \"undefined\" || !document.body) return null;\n  return createPortal(";

let count = 0;
let offset = 0;
while (true) {
  const index = source.indexOf(needle, offset);
  if (index === -1) break;
  source = source.slice(0, index) + guard + source.slice(index + needle.length);
  offset = index + guard.length;
  count += 1;
}

if (count > 0) {
  fs.writeFileSync(file, source);
  console.log(`Guarded ${count} React portal target(s).`);
} else {
  console.log("React portal targets already guarded; no changes needed.");
}
