import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";

export const PortfolioMetrics = () => {
  const metrics = [
    {
      label: "Portfolio Value",
      value: "$12,458.32",
      change: "+8.4%",
      isPositive: true,
      icon: Wallet,
    },
    {
      label: "Total P&L",
      value: "$2,148.23",
      change: "+24.6%",
      isPositive: true,
      icon: TrendingUp,
    },
    {
      label: "Win Rate",
      value: "68.4%",
      change: "+2.1%",
      isPositive: true,
      icon: Target,
    },
  ];

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <h3 className="text-lg font-semibold text-foreground mb-4">Portfolio Overview</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((metric, idx) => (
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
