import { EventEmitter } from "events";
import WebSocket from "ws";
import type { ProviderTick } from "./providers/BaseProvider.js";
import { logger } from "../lib/logger.js";

export interface KotakOptionContract {
  token: string;
  symbol: string;
  exchangeSegment?: "nse_fo" | "bse_fo";
}

type BridgeStatus = "disabled" | "connecting" | "connected" | "reconnecting" | "error";

const DEFAULT_OPTION_CONTRACTS = (): KotakOptionContract[] => {
  try {
    const raw = process.env["KOTAK_NEO_OPTION_CONTRACTS"]?.trim();
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is KotakOptionContract =>
      !!x && typeof x === "object" &&
      typeof (x as KotakOptionContract).token === "string" &&
      typeof (x as KotakOptionContract).symbol === "string",
    );
  } catch {
    logger.warn("KOTAK_NEO_OPTION_CONTRACTS is not valid JSON; no options will be subscribed at startup");
    return [];
  }
};

/**
 * Node-side adapter for the official Kotak Neo SFeed SDK sidecar.
 * The Python sidecar handles Neo authentication and SFeed binary decoding;
 * this class routes normalized ticks into the existing app market pipeline.
 */
export class KotakNeoBridge extends EventEmitter {
  private socket: WebSocket | null = null;
  private status: BridgeStatus = "disabled";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2_000;
  private stopped = false;
  private contracts = new Map<string, KotakOptionContract>();
  private lastTickAt: number | null = null;
  private tickCount = 0;

  constructor() {
    super();
    for (const contract of DEFAULT_OPTION_CONTRACTS()) this.contracts.set(contract.token, contract);
  }

  start(): void {
    const url = process.env["KOTAK_NEO_BRIDGE_URL"]?.trim();
    if (!url) {
      this.status = "disabled";
      return;
    }
    this.stopped = false;
    this.connect(url);
  }

  private connect(url: string): void {
    if (this.stopped) return;
    this.status = "connecting";
    this.emit("status", this.getStatus());
    const token = process.env["KOTAK_NEO_BRIDGE_TOKEN"]?.trim();
    const wsUrl = new URL(url);
    if (token) wsUrl.searchParams.set("token", token);
    const socket = new WebSocket(wsUrl.toString());
    this.socket = socket;

    socket.on("open", () => {
      this.status = "connected";
      this.reconnectDelay = 2_000;
      this.emit("status", this.getStatus());
      logger.info("Kotak Neo SFeed bridge connected");
      this.send({
        type: "subscribe",
        index: true,
        contracts: [...this.contracts.values()],
      });
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (message["type"] === "status") {
          this.status = String(message["status"] ?? "connected") as BridgeStatus;
          this.emit("status", this.getStatus(), message["message"]);
          return;
        }
        if (message["type"] !== "tick") return;
        const symbol = String(message["symbol"] ?? "").trim().toUpperCase();
        const price = Number(message["price"]);
        if (!symbol || !Number.isFinite(price) || price <= 0) return;
        const timestamp = Number(message["timestamp"]) || Date.now();
        const tick: ProviderTick = {
          symbol,
          providerSymbol: String(message["providerSymbol"] ?? symbol),
          provider: "kotakneo",
          price,
          volume: Number(message["volume"]) || 1,
          timestamp: timestamp < 1e12 ? timestamp * 1000 : timestamp,
          receivedAt: Date.now(),
          tickType: "trade",
        };
        this.tickCount++;
        this.lastTickAt = tick.receivedAt;
        this.emit("tick", tick);
      } catch (error) {
        logger.warn({ error }, "Kotak Neo bridge ignored an invalid message");
      }
    });

    socket.on("error", (error) => {
      this.status = "error";
      this.emit("status", this.getStatus(), error.message);
      logger.warn({ error }, "Kotak Neo bridge WebSocket error");
    });

    socket.on("close", () => {
      this.socket = null;
      if (this.stopped) return;
      this.status = "reconnecting";
      this.emit("status", this.getStatus());
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.7, 30_000);
      this.reconnectTimer = setTimeout(() => this.connect(url), delay);
    });
  }

  subscribeOption(contract: KotakOptionContract): boolean {
    const token = contract.token.trim();
    const symbol = contract.symbol.trim().toUpperCase();
    if (!token || !symbol || !/^[A-Z0-9._-]{2,50}$/.test(symbol)) return false;
    const normalized = { token, symbol, exchangeSegment: contract.exchangeSegment ?? "nse_fo" };
    this.contracts.set(token, normalized);
    this.send({ type: "subscribe", index: false, contracts: [normalized] });
    return true;
  }

  unsubscribeOption(token: string): boolean {
    const existing = this.contracts.get(token);
    if (!existing) return false;
    this.contracts.delete(token);
    this.send({ type: "unsubscribe", contracts: [existing] });
    return true;
  }

  getStatus() {
    return {
      provider: "kotakneo",
      status: this.status,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      subscribedOptions: [...this.contracts.values()],
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.status = "disabled";
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }
}

export const kotakNeoBridge = new KotakNeoBridge();
