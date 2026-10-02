import fs from "node:fs";
const p = "scripts/apply-notebook-add-trade.mjs";
let s = fs.readFileSync(p, "utf8");
const bt = String.fromCharCode(96);
const token = (name, label) => name + " && " + bt + label + ": \\${" + name + "}" + bt + ",";
const replacements = [
  [token("watchlist", "Watchlist"), 'watchlist && "Watchlist: " + watchlist,'],
  [token("observations", "My Observations"), 'observations && "My Observations: " + observations,'],
  [token("infoNotes", "Information / Notes"), 'infoNotes && "Information / Notes: " + infoNotes,'],
  [token("day", "Day"), 'day && "Day: " + day,'],
  [token("startingBalance", "Starting A/C Balance"), 'startingBalance !== "" && "Starting A/C Balance: " + startingBalance,'],
  [token("brokerage", "Total Brokerage"), 'brokerage !== "" && "Total Brokerage: " + brokerage,'],
  [token("closingBalance", "Closing A/C Balance"), 'closingBalance !== "" && "Closing A/C Balance: " + closingBalance,'],
];
for (const [from, to] of replacements) s = s.replace(from, to);
fs.writeFileSync(p, s);
