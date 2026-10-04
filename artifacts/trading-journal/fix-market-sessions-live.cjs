const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "src/components/charts/CustomIndicatorRenderer.tsx");
let s = fs.readFileSync(file, "utf8");

// resultsRef is updated inside an effect. Force exactly one React render after
// that calculation so settings changes become visible immediately. This is
// event-driven and does not create a render loop because the force state is not
// part of the calculation effect dependencies.
if (!s.includes("forceIndicatorOverlayRender")) {
  s = s.replace(
    '  const paneRef = useRef(1);\n',
    '  const paneRef = useRef(1);\n  const [, forceIndicatorOverlayRender] = useState(0);\n'
  );
  const marker = '  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [chart, barsLoaded, renderable, barsRef, replayBarCount]);';
  if (!s.includes(marker)) throw new Error("Unable to locate indicator calculation effect");
  s = s.replace(marker, '    forceIndicatorOverlayRender(x => x + 1);\n' + marker);
  fs.writeFileSync(file, s);
}
console.log("Market Sessions overlay refresh is now immediate after calculation/settings changes.");
