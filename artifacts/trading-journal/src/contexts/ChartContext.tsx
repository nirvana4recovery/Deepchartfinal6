import { createContext, useContext } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface ChartContextValue {
  chart:  IChartApi | null;
  candle: ISeriesApi<"Candlestick"> | null;
  /** Unique pan scope so multi-chart layout gestures never affect sibling charts. */
  panScope: string;
}

export const ChartContext = createContext<ChartContextValue>({ chart: null, candle: null, panScope: "main" });

export function useChartContext(): ChartContextValue {
  return useContext(ChartContext);
}
