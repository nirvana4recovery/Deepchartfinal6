import fs from "node:fs";
const p = "scripts/apply-notebook-add-trade.mjs";
let s = fs.readFileSync(p, "utf8");
const replacements = [
  [/watchlist && \\`Watchlist: \\${watchlist}\\`,/, 'watchlist && "Watchlist: " + watchlist,'],
  [/observations && \\`My Observations: \\${observations}\\`,/, 'observations && "My Observations: " + observations,'],
  [/infoNotes && \\`Information \/ Notes: \\${infoNotes}\\`,/, 'infoNotes && "Information / Notes: " + infoNotes,'],
  [/day && \\`Day: \\${day}\\`,/, 'day && "Day: " + day,'],
  [/startingBalance !== "" && \\`Starting A\/C Balance: \\${startingBalance}\\`,/, 'startingBalance !== "" && "Starting A/C Balance: " + startingBalance,'],
  [/brokerage !== "" && \\`Total Brokerage: \\${brokerage}\\`,/, 'brokerage !== "" && "Total Brokerage: " + brokerage,'],
  [/closingBalance !== "" && \\`Closing A\/C Balance: \\${closingBalance}\\`,/, 'closingBalance !== "" && "Closing A/C Balance: " + closingBalance,'],
];
for (const [pattern, value] of replacements) s = s.replace(pattern, value);
fs.writeFileSync(p, s);
