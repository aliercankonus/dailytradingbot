import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { useRiskParametersContext } from "@/contexts/RiskParametersContext";
import { usePositions } from "@/hooks/usePositions";
import { useBinanceBalance } from "@/hooks/useBinanceBalance";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";

import { useMemo } from "react";
import { formatPrice, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";

const MetricRow = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
  <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("text-xs font-bold font-mono", valueClass || "text-foreground")}>{value}</span>
  </div>
);

export const PortfolioMetrics = () => {
  const { positions, loading: positionsLoading } = usePositions();
  const { prices, priceVersion, connected, getPrice } = useRealtimePricesContext();
  const { riskParams, loading: riskLoading } = useRiskParametersContext();
  const { balance: binanceBalance, loading: balanceLoading } = useBinanceBalance();
  const { data: portfolioMetrics, isLoading: metricsLoading } = usePortfolioMetrics();

  // Real-time position sync is handled at page level (Index.tsx)

  const loading = riskLoading || metricsLoading || positionsLoading || balanceLoading;

  const metrics = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log("[PortfolioMetrics] Recalculating metrics, positions:", positions.length);
    }

    if (!portfolioMetrics) {
      return {
        portfolioValue: "$0.00",
        totalPnL: "+$0.00",
        realizedPnL: "+$0.00",
        unrealizedPnL: "+$0.00",
        totalReturn: "+0.00%",
        winRate: "0.0%",
        isPositivePnL: true,
        isPositiveRealizedPnL: true,
        isPositiveUnrealizedPnL: true,
        isPositiveReturn: true,
        hasData: false,
      };
    }

    const basePortfolio =
      binanceBalance?.isPaperTrading === false ? (binanceBalance?.balance ?? 0) : riskParams?.portfolio_value || 0;

    const realizedPnL = portfolioMetrics?.realized_pnl ?? 0;

    const unrealizedPnL = positions
      .filter((p) => p.status === "active")
      .reduce((sum, pos) => {
        const livePrice = getPrice(pos.symbol);
        const currentPrice = livePrice
          ? parseFloat(livePrice.price)
          : pos.current_price ?? pos.entry_price ?? 0;

        const pnl =
          pos.side === "BUY"
            ? (currentPrice - (pos.entry_price ?? 0)) * (pos.quantity ?? 0)
            : ((pos.entry_price ?? 0) - currentPrice) * (pos.quantity ?? 0);

        return sum + pnl;
      }, 0);

    if (import.meta.env.DEV) {
      console.log("[PortfolioMetrics] Unrealized P&L:", unrealizedPnL, "Realized P&L:", realizedPnL);
    }

    const totalPnL = realizedPnL + unrealizedPnL;
    const currentValue = basePortfolio + totalPnL;
    const totalReturn = basePortfolio > 0 ? (totalPnL / basePortfolio) * 100 : 0;

    return {
      portfolioValue: formatPrice(currentValue, 2, '$'),
      totalPnL: `${totalPnL >= 0 ? "+" : "-"}${formatPrice(Math.abs(totalPnL), 2, '$')}`,
      realizedPnL: `${realizedPnL >= 0 ? "+" : "-"}${formatPrice(Math.abs(realizedPnL), 2, '$')}`,
      unrealizedPnL: `${unrealizedPnL >= 0 ? "+" : "-"}${formatPrice(Math.abs(unrealizedPnL), 2, '$')}`,
      totalReturn: formatPercent(totalReturn, 2, true),
      winRate: formatPercent(portfolioMetrics?.win_rate ?? 0, 1),
      isPositivePnL: totalPnL >= 0,
      isPositiveRealizedPnL: realizedPnL >= 0,
      isPositiveUnrealizedPnL: unrealizedPnL >= 0,
      isPositiveReturn: totalReturn >= 0,
      hasData: (portfolioMetrics?.total_closed_trades ?? 0) > 0 || positions.length > 0,
    };
  }, [portfolioMetrics, positions, priceVersion, binanceBalance, riskParams, prices]);

  const now = new Date();
  const timestamp = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')} UTC`;

  return (
    <Card className="h-full p-4 border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-foreground">Portfolio Overview</h3>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
          <div className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-profit" : "bg-muted-foreground")} />
          {loading ? "Loading..." : timestamp}
        </div>
      </div>

      {/* Hero: Portfolio Value — increased size */}
      <div className="text-center py-2.5 mb-3 border-b border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Portfolio Value</div>
        <div className="text-[28px] sm:text-[32px] font-bold text-foreground font-mono leading-none">{metrics.portfolioValue}</div>
        <div className={cn("text-xs mt-1.5 flex items-center justify-center gap-1 font-mono", metrics.isPositiveReturn ? "text-profit" : "text-loss")}>
          {metrics.isPositiveReturn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {metrics.totalReturn}
        </div>
      </div>

      {/* Metric rows — right-aligned values, thin dividers */}
      <div className="px-1">
        <MetricRow label="Total P&L" value={metrics.totalPnL} valueClass={metrics.isPositivePnL ? "text-profit" : "text-loss"} />
        <MetricRow label="Realized P&L" value={metrics.realizedPnL} valueClass={metrics.isPositiveRealizedPnL ? "text-profit" : "text-loss"} />
        <MetricRow label="Unrealized P&L" value={metrics.unrealizedPnL} valueClass={metrics.isPositiveUnrealizedPnL ? "text-profit" : "text-loss"} />
        <MetricRow label="Win Rate" value={metrics.winRate} />
        <MetricRow
          label="Open Positions"
          value={`${positions.length} / ${riskParams?.max_open_trades || 0}`}
        />
      </div>
    </Card>
  );
};
