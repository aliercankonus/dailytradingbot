import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { usePositions } from "@/hooks/usePositions";
import { useBinanceBalance } from "@/hooks/useBinanceBalance";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PortfolioMetrics = () => {
  const { positions, loading: positionsLoading } = usePositions();
  
  // Get live prices for all active position symbols
  const symbols = positions.map(p => p.symbol);
  const { connected, getPrice } = useRealtimePrices(symbols);
  
  const { riskParams, loading: riskLoading } = useRiskParameters();
  const { balance: binanceBalance, loading: balanceLoading } = useBinanceBalance();
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);

  // Fetch ALL trades for accurate P&L calculation
  useEffect(() => {
    const fetchAllTrades = async () => {
      try {
        const { data, error } = await supabase
          .from('trades')
          .select('*')
          .order('executed_at', { ascending: false });
        
        if (error) throw error;
        setAllTrades(data || []);
      } catch (err) {
        console.error('Error fetching all trades:', err);
      } finally {
        setTradesLoading(false);
      }
    };

    fetchAllTrades();
    const interval = setInterval(fetchAllTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  const loading = riskLoading || tradesLoading || positionsLoading || balanceLoading;

  // Calculate metrics from real portfolio data
  const calculateMetrics = () => {
    // Use Binance balance for live trading, database value for paper trading
    const basePortfolio = binanceBalance?.isPaperTrading === false 
      ? binanceBalance.balance 
      : (riskParams?.portfolio_value || 0);
    
    // Calculate realized P&L from ALL closed trades (not limited to 50)
    const realizedPnL = allTrades
      .filter(t => t.status === 'closed' && t.profit_loss !== null)
      .reduce((sum, trade) => sum + (trade.profit_loss || 0), 0);
    
    // Calculate unrealized P&L from open positions using LIVE prices
    const unrealizedPnL = positions
      .filter(p => p.status === 'active')
      .reduce((sum, pos) => {
        const livePrice = getPrice(pos.symbol);
        const currentPrice = livePrice ? parseFloat(livePrice.price) : pos.current_price || pos.entry_price;
        
        // Calculate live P&L
        const pnl = pos.side === 'BUY'
          ? (currentPrice - pos.entry_price) * pos.quantity
          : (pos.entry_price - currentPrice) * pos.quantity;
        
        return sum + pnl;
      }, 0);
    
    const totalPnL = realizedPnL + unrealizedPnL;
    const currentValue = basePortfolio + totalPnL;
    const totalReturn = basePortfolio > 0 ? ((totalPnL / basePortfolio) * 100) : 0;
    
    // Calculate win rate from ALL closed trades
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => (t.profit_loss || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? ((winningTrades / closedTrades.length) * 100) : 0;
    
    return {
      portfolioValue: `$${currentValue.toFixed(2)}`,
      totalPnL: `${totalPnL >= 0 ? '+' : ''}$${Math.abs(totalPnL).toFixed(2)}`,
      realizedPnL: `${realizedPnL >= 0 ? '+' : ''}$${Math.abs(realizedPnL).toFixed(2)}`,
      unrealizedPnL: `${unrealizedPnL >= 0 ? '+' : ''}$${Math.abs(unrealizedPnL).toFixed(2)}`,
      totalReturn: `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`,
      winRate: `${winRate.toFixed(1)}%`,
      isPositivePnL: totalPnL >= 0,
      isPositiveRealizedPnL: realizedPnL >= 0,
      isPositiveUnrealizedPnL: unrealizedPnL >= 0,
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
    <Card className="h-full p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Portfolio Overview</h3>
        <div className="flex items-center gap-2 text-xs">
          <Activity className={`h-3 w-3 ${connected ? 'text-success animate-pulse' : 'text-muted-foreground'}`} />
          <span className="text-muted-foreground">
            {loading ? 'Loading...' : connected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
