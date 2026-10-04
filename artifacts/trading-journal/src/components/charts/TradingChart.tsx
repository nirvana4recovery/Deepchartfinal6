/**
 * TradingChart — clean public API wrapper around the internal CustomChart engine.
 *
 * CustomChart reads symbol + interval from chartStore internally. TradingChart
 * accepts them as props and syncs them into chartStore + marketStore so callers
 * don't need to touch the store directly.
 */
import { useEffect, memo } from "react";
import { useChartStore } from "@/store/chartStore";
import { useMarketStore } from "@/store/marketStore";
import CustomChart from "@/components/charts/CustomChart";
import SessionBackgroundOverlay from "@/components/charts/SessionBackgroundOverlay";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import type { OHLCBar } from "@/store/chartStore";

interface TradingChartProps {
  symbol:       string;
  interval:     string;
  settings?:    ChartSettings;
  replayBars?:  OHLCBar[] | null;
  children?:    React.ReactNode;
}

export const TradingChart = memo(function TradingChart({
  symbol,
  interval,
  settings,
  replayBars,
  children,
}: TradingChartProps) {
  const { setSymbol, setInterval } = useChartStore();
  const { setActiveSymbol, setActiveTimeframe } = useMarketStore();

  useEffect(() => {
    setSymbol(symbol);
    setActiveSymbol(symbol);
  }, [symbol, setSymbol, setActiveSymbol]);

  useEffect(() => {
    setInterval(interval);
    setActiveTimeframe(interval);
  }, [interval, setInterval, setActiveTimeframe]);

  return (
    <CustomChart settings={settings} replayBars={replayBars ?? null}>
      <SessionBackgroundOverlay />
      {children}
    </CustomChart>
  );
});

export default TradingChart;
