import { Router } from "express";
import { z } from "zod";
import { kotakNeoBridge } from "../services/KotakNeoBridge.js";

const router = Router();

router.get("/market/kotak-neo/status", (_req, res) => {
  res.json(kotakNeoBridge.getStatus());
});

router.post("/market/kotak-neo/options/subscribe", (req, res) => {
  const parsed = z.object({
    token: z.string().trim().min(1).max(30),
    symbol: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9._-]+$/),
    exchangeSegment: z.enum(["nse_fo", "bse_fo"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid option instrument token and display symbol", details: parsed.error.flatten() });
    return;
  }
  const ok = kotakNeoBridge.subscribeOption(parsed.data);
  if (!ok) {
    res.status(503).json({ error: "Kotak Neo bridge is not connected. Check KOTAK_NEO_BRIDGE_URL and sidecar status." });
    return;
  }
  res.json({ ok: true, subscribed: { ...parsed.data, symbol: parsed.data.symbol.toUpperCase() } });
});

router.post("/market/kotak-neo/options/unsubscribe", (req, res) => {
  const parsed = z.object({ token: z.string().trim().min(1).max(30) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid option instrument token is required" });
    return;
  }
  const ok = kotakNeoBridge.unsubscribeOption(parsed.data.token);
  if (!ok) {
    res.status(404).json({ error: "Option token was not subscribed" });
    return;
  }
  res.json({ ok: true, unsubscribedToken: parsed.data.token });
});

export default router;
