import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { usePositions } from "@/hooks/usePositions";
import { useBinanceBalance } from "@/hooks/useBinanceBalance";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import { useRealtimePortfolioSync } from "@/hooks/useRealtimePortfolioSync";
import { useRealtimePositionSync } from "@/hooks/useRealtimePositionSync";
import { useMemo } from "react";
import { formatPrice, formatPercent } from "@/lib/utils";
export const PortfolioMetrics = () => {
  const { positions, loading: positionsLoading } = usePositions();

  // Get live prices from shared context
  const { prices, priceVersion, connected, getPrice } = useRealtimePricesContext();

  const { riskParams, loading: riskLoading } = useRiskParameters();
  const { balance: binanceBalance, loading: balanceLoading } = useBinanceBalance();

  // Use cached portfolio metrics with React Query
  const { data: portfolioMetrics, isLoading: metricsLoading } = usePortfolioMetrics();

  // Enable real-time cache invalidation
  useRealtimePortfolioSync();
  useRealtimePositionSync();
  const loading = riskLoading || metricsLoading || positionsLoading || balanceLoading;
  // Compute live prices directly in metrics using priceVersion to trigger updates
  // Memoize expensive calculations - only recalculate when dependencies change
  const metrics = useMemo(() => {
    if (process.env.NODE_ENV === "development") {
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
    // Use Binance balance for live trading, database value for paper trading
    const basePortfolio =
      binanceBalance?.isPaperTrading === false ? (binanceBalance?.balance ?? 0) : riskParams?.portfolio_value || 0;

    // Get realized P&L from database view (pre-aggregated)
    const realizedPnL = portfolioMetrics?.realized_pnl ?? 0;

    // Calculate unrealized P&L from active positions using LIVE prices (same as RiskManagementControls)
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

    if (process.env.NODE_ENV === "development") {
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
  const metricsDisplay = [
    {
      label: "Portfolio Value",
      value: metrics.portfolioValue,
      change: metrics.totalReturn,
      isPositive: metrics.isPositiveReturn,
      icon: Wallet,
    },
    {
      label: "Total P&L",
      value: metrics.totalPnL,
      change: metrics.hasData ? "Realized + Unrealized" : "No trades yet",
      isPositive: metrics.isPositivePnL,
      icon: metrics.isPositivePnL ? TrendingUp : TrendingDown,
    },
    {
      label: "Realized P&L",
      value: metrics.realizedPnL,
      change: "From closed trades",
      isPositive: metrics.isPositiveRealizedPnL,
      icon: metrics.isPositiveRealizedPnL ? TrendingUp : TrendingDown,
    },
    {
      label: "Unrealized P&L",
      value: metrics.unrealizedPnL,
      change: "From active positions",
      isPositive: metrics.isPositiveUnrealizedPnL,
      icon: metrics.isPositiveUnrealizedPnL ? TrendingUp : TrendingDown,
    },
    {
      label: "Win Rate",
      value: metrics.winRate,
      change: metrics.hasData ? "From closed trades" : "No trades yet",
      isPositive: parseFloat(metrics.winRate) >= 50,
      icon: Target,
    },
    {
      label: "Open Positions",
      value: positions.length.toString(),
      change: `${riskParams?.current_open_trades || 0}/${riskParams?.max_open_trades || 0} trades`,
      isPositive: true,
      icon: Activity,
    },
  ];
  return (
    <Card className="h-full p-4 sm:p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">Portfolio Overview</h3>
        <div className="flex items-center gap-2 text-xs">
          <Activity
            className={`h-3 w-3 ${connected ? "text-success animate-pulse" : "text-muted-foreground"}`}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{loading ? "Loading..." : connected ? "Live" : "Connecting..."}</span>
        </div>
      </div>

      {/* Hero: Portfolio Value */}
      <div className="text-center py-3 mb-4 border-b border-border">
        <div className="text-xs text-muted-foreground mb-1">Portfolio Value</div>
        <div className="text-2xl sm:text-3xl font-bold text-foreground font-mono">{metrics.portfolioValue}</div>
        <div className={`text-xs sm:text-sm mt-1 flex items-center justify-center gap-1 ${metrics.isPositiveReturn ? "text-profit" : "text-loss"}`}>
          {metrics.isPositiveReturn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {metrics.totalReturn}
        </div>
      </div>

      {/* Metric rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Total P&L</span>
          </div>
          <span className={`text-sm font-bold font-mono ${metrics.isPositivePnL ? "text-profit" : "text-loss"}`}>{metrics.totalPnL}</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Realized P&L</span>
          </div>
          <span className={`text-sm font-bold font-mono ${metrics.isPositiveRealizedPnL ? "text-profit" : "text-loss"}`}>{metrics.realizedPnL}</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Unrealized P&L</span>
          </div>
          <span className={`text-sm font-bold font-mono ${metrics.isPositiveUnrealizedPnL ? "text-profit" : "text-loss"}`}>{metrics.unrealizedPnL}</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Win Rate</span>
          </div>
          <span className="text-sm font-bold font-mono text-foreground">{metrics.winRate}</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Open Positions</span>
          </div>
          <span className="text-sm font-bold font-mono text-foreground">
            {positions.length} <span className="text-xs text-muted-foreground font-normal">/ {riskParams?.max_open_trades || 0}</span>
          </span>
        </div>
      </div>
    </Card>
  );
};
