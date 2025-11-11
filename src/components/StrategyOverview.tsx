import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Zap, Shield } from "lucide-react";

export const StrategyOverview = () => {
  const strategies = [
    {
      name: "Mean Reversion",
      status: "active",
      performance: "+12.4%",
      trades: 24,
      icon: Brain,
      color: "text-primary",
    },
    {
      name: "Momentum Trading",
      status: "active",
      performance: "+8.7%",
      trades: 18,
      icon: Zap,
      color: "text-warning",
    },
    {
      name: "Grid Trading",
      status: "standby",
      performance: "+5.2%",
      trades: 12,
      icon: Shield,
      color: "text-muted-foreground",
    },
  ];

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <h3 className="text-lg font-semibold text-foreground mb-4">Active Strategies</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {strategies.map((strategy, idx) => (
          <div
            key={idx}
            className="p-4 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <strategy.icon className={`h-5 w-5 ${strategy.color}`} />
              <Badge
                variant={strategy.status === "active" ? "default" : "secondary"}
                className={strategy.status === "active" ? "bg-success/20 text-success" : ""}
              >
                {strategy.status}
              </Badge>
            </div>
            
            <h4 className="font-semibold text-foreground mb-2">{strategy.name}</h4>
            
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Performance:</span>
                <span className="text-profit font-semibold font-mono">{strategy.performance}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trades:</span>
                <span className="text-foreground font-mono">{strategy.trades}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
