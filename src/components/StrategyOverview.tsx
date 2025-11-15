import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Zap, Shield } from "lucide-react";
import { useStrategyData } from "@/hooks/useStrategyData";

export const StrategyOverview = () => {
  const { strategies: strategyData, loading } = useStrategyData();
  
  const getIcon = (name: string) => {
    if (name.includes("Mean")) return Brain;
    if (name.includes("Momentum")) return Zap;
    return Shield;
  };
  
  const getColor = (status: string) => {
    if (status === "active") return "text-primary";
    if (status === "standby") return "text-muted-foreground";
    return "text-warning";
  };
  
  const strategies = strategyData.map(strategy => {
    // Calculate performance as percentage gain/loss
    const performance = strategy.total_profit;
    const performanceDisplay = performance >= 0 
      ? `+$${performance.toFixed(2)}`
      : `-$${Math.abs(performance).toFixed(2)}`;
    
    return {
      name: strategy.strategy_name,
      status: strategy.status,
      performance: performanceDisplay,
      trades: strategy.total_trades || 0,
      winRate: strategy.total_trades > 0 
        ? ((strategy.winning_trades / strategy.total_trades) * 100).toFixed(0)
        : "0",
      icon: getIcon(strategy.strategy_name),
      color: getColor(strategy.status),
    };
  });

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <h3 className="text-lg font-semibold text-foreground mb-4">Active Strategies</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Loading strategies...
          </div>
        ) : strategies.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No strategies available
          </div>
        ) : (
          strategies
            .filter(s => s.status === 'active')
            .map((strategy, idx) => (
          <div
            key={idx}
            className="p-4 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <strategy.icon className={`h-5 w-5 ${strategy.color}`} />
              <Badge
                variant="default"
                className="bg-success/20 text-success"
              >
                {strategy.status}
              </Badge>
            </div>
            
            <h4 className="font-semibold text-foreground mb-2">{strategy.name}</h4>
            
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Performance:</span>
                <span className={`font-semibold font-mono ${
                  strategy.performance.startsWith('+') ? 'text-profit' : 
                  strategy.performance.startsWith('-') ? 'text-loss' : 'text-foreground'
                }`}>
                  {strategy.performance}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Win Rate:</span>
                <span className="text-foreground font-mono">{strategy.winRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trades:</span>
                <span className="text-foreground font-mono">{strategy.trades}</span>
              </div>
            </div>
          </div>
          ))
        )}
      </div>
    </Card>
  );
};
