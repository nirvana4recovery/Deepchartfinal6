import type { ReactNode } from "react";

interface FreeChartEmbedProps {
  children?: ReactNode;
  settings?: unknown;
  replayBars?: unknown;
}

/**
 * Hosts the exact Free Chart panel while the market-data bridge is kept outside
 * the chart UI. The legacy CustomChart renderer is intentionally not used here.
 */
export default function FreeChartEmbed(_props: FreeChartEmbedProps) {
  return (
    <div
      data-free-chart-panel="true"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <iframe
        title="The Free Chart"
        src="https://thefreechart.com/chart/NAS100USD-oanda"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          background: "#000",
        }}
        allow="fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
