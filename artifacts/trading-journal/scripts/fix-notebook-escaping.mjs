import fs from "node:fs";

const file = "src/pages/trades.tsx";
let source = fs.readFileSync(file, "utf8");

// apply-notebook-add-trade.mjs uses String.raw, so escaped template literals
// are intentionally present in the generated source. Convert them back to
// valid TypeScript template literals before Vite compiles the file.
source = source.replaceAll("\\`", "`").replaceAll("\\${", "${");

fs.writeFileSync(file, source);
console.log("Fixed notebook template-literal escaping");
