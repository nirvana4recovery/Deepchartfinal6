import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, Loader2, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChartStore } from "@/store/chartStore";

type FeedStatus = {
  provider: string;
  status: string;
  tickCount: number;
  lastTickAt: number | null;
  subscribedOptions: Array<{ token: string; symbol: string; exchangeSegment?: string }>;
};

export function KotakNeoPanel() {
  const [, navigate] = useLocation();
  const [feed, setFeed] = useState<FeedStatus | null>(null);
  const [token, setToken] = useState("");
  const [symbol, setSymbol] = useState("");
  const [segment, setSegment] = useState<"nse_fo" | "bse_fo">("nse_fo");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/market/kotak-neo/status");
      if (response.ok) setFeed(await response.json() as FeedStatus);
    } catch { /* keep the last known status */ }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const subscribe = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/market/kotak-neo/options/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), symbol: symbol.trim().toUpperCase(), exchangeSegment: segment }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; subscribed?: { symbol: string } };
      if (!response.ok || !data.ok) {
        setMessage({ ok: false, text: data.error ?? "Subscription failed. Check the feed connection and instrument token." });
      } else {
        setMessage({ ok: true, text: `${data.subscribed?.symbol ?? symbol.toUpperCase()} subscription requested.` });
        setToken("");
        setSymbol("");
        await refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the DeepCharts API." });
    } finally {
      setLoading(false);
    }
  };

  const openOnChart = (optionSymbol: string) => {
    useChartStore.getState().setSymbol(optionSymbol);
    navigate("/charts");
  };

  const connected = feed?.status === "connected";
  const statusColor = connected ? "#60a5fa" : feed?.status === "connecting" || feed?.status === "reconnecting" ? "#fbbf24" : "#f87171";

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-white mb-0.5">Kotak Neo — NIFTY 50 + Options</p>
          <p className="text-[11px] text-muted-foreground">Live index feed and NSE F&amp;O CE/PE premiums through SFeed WebSocket.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} className="h-8 rounded-xl"
          style={{ border: "1px solid rgba(57,91,67,0.32)", background: "rgba(57,91,67,0.12)", color: "#94a3b8" }}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ color: statusColor, background: `${statusColor}14`, border: `1px solid ${statusColor}44` }}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {(feed?.status ?? "unknown").toUpperCase()}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
          style={{ color: "#94a3b8", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Activity className="w-3 h-3" /> {feed?.tickCount ?? 0} ticks received
        </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => openOnChart("NIFTY50")}
          className="h-8 rounded-xl" style={{ border: "1px solid rgba(57,91,67,0.32)", color: "#cbd5e1" }}>
          Open NIFTY 50 chart
        </Button>
      </div>

      {feed?.lastTickAt && (
        <p className="text-[11px] text-muted-foreground">Last tick: {new Date(feed.lastTickAt).toLocaleTimeString()}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Option symbol</Label>
          <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="NIFTY26OCT25000CE"
            className="rounded-xl h-9" style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.22)" }} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instrument token</Label>
          <Input value={token} onChange={e => setToken(e.target.value)} placeholder="Current NSE F&O token"
            className="rounded-xl h-9" style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.22)" }} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Exchange segment</Label>
          <select value={segment} onChange={e => setSegment(e.target.value as "nse_fo" | "bse_fo")}
            className="w-full h-9 rounded-xl px-3 text-sm text-white"
            style={{ background: "rgba(16,37,28,0.8)", border: "1px solid rgba(57,91,67,0.22)" }}>
            <option value="nse_fo">NSE F&amp;O</option>
            <option value="bse_fo">BSE F&amp;O</option>
          </select>
        </div>
      </div>

      <Button size="sm" onClick={() => void subscribe()} disabled={loading || !token.trim() || !symbol.trim()}
        className="rounded-xl h-9 px-4" style={{ background: "rgba(57,91,67,0.7)", color: "white" }}>
        {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
        Subscribe CE / PE
      </Button>

      {message && <p className={`text-[11px] ${message.ok ? "text-blue-300" : "text-red-300"}`}>{message.text}</p>}

      {feed?.subscribedOptions?.length ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Subscribed option contracts</p>
          {feed.subscribedOptions.map(option => (
            <div key={option.token} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-white truncate">{option.symbol}</p>
                <p className="text-[10px] text-muted-foreground">Token: {option.token}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openOnChart(option.symbol)}
                className="h-7 rounded-lg shrink-0" style={{ border: "1px solid rgba(57,91,67,0.32)", color: "#cbd5e1" }}>
                Open chart
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        The feed service and Neo API credentials must be configured on the backend first. Option subscriptions require the current instrument token from Kotak Neo's scrip master; this panel does not place orders.
      </p>
    </div>
  );
}
