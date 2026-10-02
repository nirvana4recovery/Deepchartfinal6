import fs from "node:fs";

const file = "src/pages/trades.tsx";
let source = fs.readFileSync(file, "utf8");
const start = source.indexOf("const AddTradeSheet = memo(function AddTradeSheet(");
const end = source.indexOf("export default function Trades()");
if (start < 0 || end < 0 || end <= start) throw new Error("Could not locate AddTradeSheet boundaries");

const replacement = String.raw`const AddTradeSheet = memo(function AddTradeSheet({
  open, onClose, form, onSubmit, isPending,
}: AddTradeSheetProps) {
  const watchedSymbol = form.watch("symbol");
  const watchedSide = form.watch("side");
  const entryPrice = Number(form.watch("entryPrice") || 0);
  const exitPrice = Number(form.watch("exitPrice") || 0);
  const quantity = Number(form.watch("quantity") || 0);
  const entryDate = form.watch("entryDate") || "";
  const exitDate = form.watch("exitDate") || "";
  const stopLoss = form.watch("stopLoss");
  const takeProfit = form.watch("takeProfit");
  const [day, setDay] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [watchlist, setWatchlist] = useState("");
  const [observations, setObservations] = useState("");
  const [infoNotes, setInfoNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setDay(entryDate ? new Date(entryDate).toLocaleDateString(undefined, { weekday: "long" }) : "");
    setStartingBalance("");
    setBrokerage("");
    setWatchlist("");
    setObservations("");
    setInfoNotes("");
  }, [open]);

  const pnl = watchedSide === "short"
    ? (entryPrice - exitPrice) * quantity
    : (exitPrice - entryPrice) * quantity;
  const brokerageValue = Number(brokerage || 0);
  const closingBalance = startingBalance === "" ? "" : (Number(startingBalance) + pnl - brokerageValue).toFixed(2);
  const pnlText = Number.isFinite(pnl) ? pnl.toFixed(2) : "0.00";

  const submitNotebookTrade = (data: TradeFormValues) => {
    const sections = [
      watchlist && \`Watchlist: \${watchlist}\`,
      observations && \`My Observations: \${observations}\`,
      infoNotes && \`Information / Notes: \${infoNotes}\`,
      day && \`Day: \${day}\`,
      startingBalance !== "" && \`Starting A/C Balance: \${startingBalance}\`,
      brokerage !== "" && \`Total Brokerage: \${brokerage}\`,
      closingBalance !== "" && \`Closing A/C Balance: \${closingBalance}\`,
    ].filter(Boolean).join("\\n");
    onSubmit({ ...data, notes: sections || data.notes });
  };

  const paperInput = {
    width: "100%", minWidth: 0, height: 38, boxSizing: "border-box" as const,
    border: "1px solid #9ca3af", borderRadius: 4, background: "#fff", color: "#111827",
    padding: "7px 8px", fontSize: 13, outline: "none",
  };
  const smallInput = { ...paperInput, height: 32, fontSize: 12 };
  const cell = { borderRight: "1px solid #6b7280", borderBottom: "1px dashed #9ca3af", padding: 6, minWidth: 0 };
  const sectionTitle = { fontSize: 12, fontWeight: 700, color: "#374151", textAlign: "center" as const, padding: "7px 6px", borderBottom: "1px solid #6b7280" };
  const label = { display: "block", fontSize: 10, fontWeight: 700, color: "#4b5563", marginBottom: 4 };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 501, background: "#0b0b0d", display: "flex", flexDirection: "column", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .18s ease", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
      <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,.08)", position: "relative", color: "#fff" }}>
        <button type="button" onClick={onClose} aria-label="Back" style={{ width: 40, height: 40, border: 0, background: "transparent", color: "#d1d5db", display: "grid", placeItems: "center", cursor: "pointer" }}><ArrowLeft size={24} /></button>
        <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 17, fontWeight: 700 }}>Trading Journal</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 10px 24px" }}>
        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", background: "#fff", color: "#111827", border: "1px solid #d1d5db", borderRadius: 3, boxShadow: "0 12px 30px rgba(0,0,0,.35)", overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 30, background: "repeating-linear-gradient(to bottom, transparent 0 22px, rgba(107,114,128,.28) 23px 24px)", borderRight: "1px solid #d1d5db", pointerEvents: "none" }} />
          <div style={{ marginLeft: 30, padding: "18px 14px 20px" }}>
            <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-.03em", color: "#374151", marginBottom: 14 }}>Trading Journal</div>

            <Form {...form}>
              <form id="tradeForm" onSubmit={form.handleSubmit(submitNotebookTrade)}>
                <div style={{ border: "1px solid #6b7280", marginBottom: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                    <div style={{ padding: 8, borderRight: "1px solid #6b7280", borderBottom: "1px solid #6b7280" }}><label style={label}>Date</label><input type="datetime-local" value={entryDate} onChange={e => form.setValue("entryDate", e.target.value)} style={smallInput} /></div>
                    <div style={{ padding: 8, borderBottom: "1px solid #6b7280" }}><label style={label}>Closed P/L</label><input value={pnlText} readOnly style={{ ...smallInput, fontWeight: 700, color: pnl >= 0 ? "#047857" : "#b91c1c" }} /></div>
                    <div style={{ padding: 8, borderRight: "1px solid #6b7280", borderBottom: "1px solid #6b7280" }}><label style={label}>Day</label><input value={day} onChange={e => setDay(e.target.value)} placeholder="Monday" style={smallInput} /></div>
                    <div style={{ padding: 8, borderBottom: "1px solid #6b7280" }}><label style={label}>Total Brokerage</label><input type="number" step="0.01" value={brokerage} onChange={e => setBrokerage(e.target.value)} placeholder="0.00" style={smallInput} /></div>
                    <div style={{ padding: 8, borderRight: "1px solid #6b7280" }}><label style={label}>Starting A/C Balance</label><input type="number" step="0.01" value={startingBalance} onChange={e => setStartingBalance(e.target.value)} placeholder="0.00" style={smallInput} /></div>
                    <div style={{ padding: 8 }}><label style={label}>Closing A/C Balance</label><input value={closingBalance} readOnly placeholder="Auto" style={{ ...smallInput, fontWeight: 700 }} /></div>
                  </div>
                </div>

                <div style={{ overflowX: "auto", border: "1px solid #6b7280", marginBottom: 14 }}>
                  <div style={{ minWidth: 540, display: "grid", gridTemplateColumns: "1.15fr .9fr .9fr .9fr .9fr .75fr 1fr" }}>
                    {["Name", "Buy", "Sell", "Quantity", "Target", "SL", "P/L"].map(head => <div key={head} style={{ ...cell, borderBottom: "1px solid #6b7280", fontSize: 11, fontWeight: 700, textAlign: "center", color: "#374151", background: "#f3f4f6" }}>{head}</div>)}
                    <div style={cell}><select value={watchedSymbol} onChange={e => form.setValue("symbol", e.target.value)} style={smallInput}>{ALL_SYMBOLS.map(sym => <option key={sym} value={sym}>{sym}</option>)}</select></div>
                    <div style={cell}><input type="number" step="0.0001" value={entryPrice || ""} onChange={e => form.setValue("entryPrice", Number(e.target.value))} style={smallInput} /></div>
                    <div style={cell}><input type="number" step="0.0001" value={exitPrice || ""} onChange={e => form.setValue("exitPrice", Number(e.target.value))} style={smallInput} /></div>
                    <div style={cell}><input type="number" step="0.01" value={quantity || ""} onChange={e => form.setValue("quantity", Number(e.target.value))} style={smallInput} /></div>
                    <div style={cell}><input type="number" step="0.0001" value={takeProfit ?? ""} onChange={e => form.setValue("takeProfit", e.target.value === "" ? null : Number(e.target.value))} style={smallInput} /></div>
                    <div style={cell}><input type="number" step="0.0001" value={stopLoss ?? ""} onChange={e => form.setValue("stopLoss", e.target.value === "" ? null : Number(e.target.value))} style={smallInput} /></div>
                    <div style={{ ...cell, borderRight: 0 }}><input value={pnlText} readOnly style={{ ...smallInput, fontWeight: 700, color: pnl >= 0 ? "#047857" : "#b91c1c" }} /></div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #6b7280", marginBottom: 14 }}>
                  <div style={{ borderRight: "1px solid #6b7280" }}><div style={sectionTitle}>After Trade Close</div><div style={{ padding: 8, borderBottom: "1px dashed #9ca3af" }}><label style={label}>Profit</label><input value={pnl > 0 ? pnlText : ""} readOnly placeholder="Auto" style={smallInput} /></div><div style={{ padding: 8 }}><label style={label}>Loss</label><input value={pnl < 0 ? Math.abs(pnl).toFixed(2) : ""} readOnly placeholder="Auto" style={smallInput} /></div></div>
                  <div><div style={sectionTitle}>Watchlist</div><div style={{ padding: 8 }}><textarea value={watchlist} onChange={e => setWatchlist(e.target.value)} placeholder="Symbols / levels to watch" rows={4} style={{ ...paperInput, height: 84, resize: "vertical" }} /></div></div>
                </div>

                <div style={{ border: "1px solid #6b7280", marginBottom: 14 }}><div style={sectionTitle}>My Observations</div><div style={{ padding: 8 }}><textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="What did you observe before, during and after the trade?" rows={5} style={{ ...paperInput, height: 105, resize: "vertical" }} /></div></div>
                <div style={{ border: "1px solid #6b7280" }}><div style={sectionTitle}>Information / Notes</div><div style={{ padding: 8 }}><textarea value={infoNotes} onChange={e => setInfoNotes(e.target.value)} placeholder="Rules, setup, mistakes, lessons, links or other notes" rows={5} style={{ ...paperInput, height: 105, resize: "vertical" }} /></div></div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                  <div><label style={label}>Direction</label><select value={watchedSide} onChange={e => form.setValue("side", e.target.value as "long" | "short")} style={paperInput}><option value="long">Long (Buy)</option><option value="short">Short (Sell)</option></select></div>
                  <div><label style={label}>Exit Date & Time</label><input type="datetime-local" value={exitDate} onChange={e => form.setValue("exitDate", e.target.value)} style={paperInput} /></div>
                </div>

                <button type="submit" disabled={isPending} style={{ width: "100%", height: 46, marginTop: 14, borderRadius: 7, border: "1px solid #111827", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? .6 : 1 }}>{isPending ? "Saving Trade…" : "Save Trade"}</button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
});

`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log("Applied notebook-style Add Trade form");
