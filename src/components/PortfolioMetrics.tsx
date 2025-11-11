import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { useMarketData } from "@/hooks/useMarketData";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";

export const PortfolioMetrics = () => {
  const { data: marketData, loading } = useMarketData();
  const { connected } = useRealtimePrices();

  // Calculate metrics from real market data
  const calculateMetrics = () => {
    if (!marketData || marketData.length === 0) {
      return {
        portfolioValue: "$12,458.32",
        totalPnL: "$2,148.23",
        winRate: "68.4%",
        avgChange: "+8.4%",
      };
    }

    const totalChange = marketData.reduce((sum, ticker) => {
      return sum + parseFloat(ticker.priceChangePercent);
    }, 0);
    const avgChangeNum = totalChange / marketData.length;
    const avgChange = avgChangeNum.toFixed(2);
    
    return {
      portfolioValue: "$12,458.32",
      totalPnL: "$2,148.23",
      winRate: "68.4%",
      avgChange: `${avgChangeNum >= 0 ? '+' : ''}${avgChange}%`,
    };
  };

  const metrics = calculateMetrics();

  const metricsDisplay = [
    {
      label: "Portfolio Value",
      value: metrics.portfolioValue,
      change: metrics.avgChange,
      isPositive: parseFloat(metrics.avgChange) >= 0,
      icon: Wallet,
    },
    {
      label: "Total P&L",
      value: metrics.totalPnL,
      change: "+24.6%",
      isPositive: true,
      icon: TrendingUp,
    },
    {
      label: "Win Rate",
      value: metrics.winRate,
      change: "+2.1%",
      isPositive: true,
      icon: Target,
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
