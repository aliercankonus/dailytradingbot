import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { useTrades } from "@/hooks/useTrades";
import { usePositions } from "@/hooks/usePositions";
import { useBinanceBalance } from "@/hooks/useBinanceBalance";

export const PortfolioMetrics = () => {
  const { connected } = useRealtimePrices();
  const { riskParams, loading: riskLoading } = useRiskParameters();
  const { trades, loading: tradesLoading } = useTrades();
  const { positions, loading: positionsLoading } = usePositions();
  const { balance: binanceBalance, loading: balanceLoading } = useBinanceBalance();

  const loading = riskLoading || tradesLoading || positionsLoading || balanceLoading;

  // Calculate metrics from real portfolio data
  const calculateMetrics = () => {
    // Use Binance balance for live trading, database value for paper trading
    const basePortfolio = binanceBalance?.isPaperTrading === false 
      ? binanceBalance.balance 
      : (riskParams?.portfolio_value || 0);
    
    // Calculate realized P&L from closed trades
    const realizedPnL = trades
      .filter(t => t.status === 'closed' && t.profit_loss !== null)
      .reduce((sum, trade) => sum + (trade.profit_loss || 0), 0);
    
    // Calculate unrealized P&L from open positions
    const unrealizedPnL = positions
      .filter(p => p.status === 'active' && p.unrealized_pnl !== null)
      .reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
    
    const totalPnL = realizedPnL + unrealizedPnL;
    const currentValue = basePortfolio + totalPnL;
    const totalReturn = basePortfolio > 0 ? ((totalPnL / basePortfolio) * 100) : 0;
    
    // Calculate win rate from closed trades
    const closedTrades = trades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => (t.profit_loss || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? ((winningTrades / closedTrades.length) * 100) : 0;
    
    return {
      portfolioValue: `$${currentValue.toFixed(2)}`,
      totalPnL: `${totalPnL >= 0 ? '+' : ''}$${Math.abs(totalPnL).toFixed(2)}`,
      totalReturn: `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`,
      winRate: `${winRate.toFixed(1)}%`,
      isPositivePnL: totalPnL >= 0,
      isPositiveReturn: totalReturn >= 0,
      hasData: closedTrades.length > 0 || positions.length > 0,
    };
  };

  const metrics = calculateMetrics();

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
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Portfolio Overview</h3>
        <div className="flex items-center gap-2 text-xs">
          <Activity className={`h-3 w-3 ${connected ? 'text-success animate-pulse' : 'text-muted-foreground'}`} />
          <span className="text-muted-foreground">
            {loading ? 'Loading...' : connected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricsDisplay.map((metric, idx) => (
          <div key={idx} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <metric.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-foreground font-mono">
                {metric.value}
              </div>
              <div className={`text-sm flex items-center gap-1 ${
                metric.isPositive ? "text-profit" : "text-loss"
              }`}>
                {metric.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {metric.change}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
