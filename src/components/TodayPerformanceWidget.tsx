import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Activity } from "lucide-react";
import { useClosedPositions } from "@/hooks/useClosedPositions";
import { useMemo } from "react";

export const TodayPerformanceWidget = () => {
  const { data: positions = [], isLoading } = useClosedPositions();

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    const todayPositions = positions.filter(p => 
      p.closed_at && p.closed_at.startsWith(today)
    );

    const totalPnL = todayPositions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const winningTrades = todayPositions.filter(p => (p.realized_pnl || 0) > 0).length;
    const totalTrades = todayPositions.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    return { totalPnL, winningTrades, totalTrades, winRate };
  }, [positions]);

  if (isLoading) {
    return (
      <Card className="p-4 bg-card border-border">
        <div className="animate-pulse h-16 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-card to-card/80 border-border">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4" />
        Today's Performance
      </h3>
      
      <div className="grid grid-cols-3 gap-4">
        {/* P&L */}
        <div className="text-center">
          <div className={`text-xl font-bold font-mono flex items-center justify-center gap-1 ${
            todayStats.totalPnL >= 0 ? 'text-profit' : 'text-loss'
          }`}>
            {todayStats.totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {todayStats.totalPnL >= 0 ? '+' : ''}${todayStats.totalPnL.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">P&L</div>
        </div>

        {/* Win Rate */}
        <div className="text-center">
          <div className={`text-xl font-bold font-mono flex items-center justify-center gap-1 ${
            todayStats.winRate >= 50 ? 'text-profit' : todayStats.totalTrades === 0 ? 'text-muted-foreground' : 'text-warning'
          }`}>
            <Target className="h-4 w-4" />
            {todayStats.winRate.toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Win Rate</div>
        </div>

        {/* Total Trades */}
        <div className="text-center">
          <div className="text-xl font-bold font-mono text-foreground">
            {todayStats.totalTrades}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {todayStats.winningTrades}W / {todayStats.totalTrades - todayStats.winningTrades}L
          </div>
        </div>
      </div>
    </Card>
  );
};
