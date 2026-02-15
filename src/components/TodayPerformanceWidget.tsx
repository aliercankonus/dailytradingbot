import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Target, Activity, Trophy, BarChart3, Zap } from "lucide-react";
import { useClosedPositions } from "@/hooks/useClosedPositions";
import { useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";
import { cn } from "@/lib/utils";

interface PeriodStats {
  totalPnL: number;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
}

const StatRow = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color?: string }) => (
  <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
    <div className="flex items-center gap-2">
      <Icon className={cn("h-3.5 w-3.5", color || "text-muted-foreground")} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <span className={cn("text-sm font-bold font-mono", color || "text-foreground")}>{value}</span>
  </div>
);

const StatsDisplay = ({ stats }: { stats: PeriodStats }) => (
  <div className="space-y-2">
    {/* Hero P&L */}
    <div className="text-center py-2 border-b border-border">
      <div className={cn(
        "text-2xl sm:text-3xl font-bold font-mono flex items-center justify-center gap-1.5",
        stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'
      )}>
        {stats.totalPnL >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
        {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
      </div>
      <div className="text-xs text-muted-foreground mt-1">Total P&L</div>
    </div>

    {/* Key metrics grid */}
    <div className="grid grid-cols-3 gap-2">
      <div className="text-center p-1.5 bg-muted/20 rounded-lg">
        <div className={cn("text-sm font-bold font-mono", stats.winRate >= 50 ? 'text-profit' : stats.totalTrades === 0 ? 'text-muted-foreground' : 'text-warning')}>
          {stats.winRate.toFixed(0)}%
        </div>
        <div className="text-[10px] text-muted-foreground">Win Rate</div>
      </div>
      <div className="text-center p-1.5 bg-muted/20 rounded-lg">
        <div className="text-sm font-bold font-mono text-foreground">{stats.totalTrades}</div>
        <div className="text-[10px] text-muted-foreground">{stats.winningTrades}W / {stats.losingTrades}L</div>
      </div>
      <div className="text-center p-1.5 bg-muted/20 rounded-lg">
        <div className={cn("text-sm font-bold font-mono", stats.profitFactor >= 1 ? 'text-profit' : stats.totalTrades === 0 ? 'text-muted-foreground' : 'text-loss')}>
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
        <div className="text-[10px] text-muted-foreground">Profit Factor</div>
      </div>
    </div>

    {/* Detail rows */}
    <div className="space-y-1.5">
      <StatRow label="Best Trade" value={`+$${stats.bestTrade.toFixed(2)}`} icon={Trophy} color="text-profit" />
      <StatRow label="Worst Trade" value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`} icon={TrendingDown} color="text-loss" />
      <StatRow label="Avg Win" value={`+$${stats.avgWin.toFixed(2)}`} icon={Zap} color="text-profit" />
      <StatRow label="Avg Loss" value={`-$${Math.abs(stats.avgLoss).toFixed(2)}`} icon={BarChart3} color="text-loss" />
    </div>
  </div>
);

export const TodayPerformanceWidget = () => {
  const { data: positions = [], isLoading } = useClosedPositions();

  const { todayStats, weekStats, monthStats } = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const calculateStats = (startDate: Date): PeriodStats => {
      const filtered = positions.filter(p => {
        if (!p.closed_at) return false;
        const closedDate = new Date(p.closed_at);
        return isAfter(closedDate, startDate) || closedDate.getTime() === startDate.getTime();
      });

      const totalPnL = filtered.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
      const wins = filtered.filter(p => (p.realized_pnl || 0) > 0);
      const losses = filtered.filter(p => (p.realized_pnl || 0) < 0);
      const winningTrades = wins.length;
      const losingTrades = losses.length;
      const totalTrades = filtered.length;
      const decisiveTrades = winningTrades + losingTrades;
      const winRate = decisiveTrades > 0 ? (winningTrades / decisiveTrades) * 100 : 0;

      const totalWins = wins.reduce((s, p) => s + (p.realized_pnl || 0), 0);
      const totalLosses = losses.reduce((s, p) => s + Math.abs(p.realized_pnl || 0), 0);
      const avgWin = winningTrades > 0 ? totalWins / winningTrades : 0;
      const avgLoss = losingTrades > 0 ? totalLosses / losingTrades : 0;
      const bestTrade = filtered.length > 0 ? Math.max(...filtered.map(p => p.realized_pnl || 0)) : 0;
      const worstTrade = filtered.length > 0 ? Math.min(...filtered.map(p => p.realized_pnl || 0)) : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

      return { totalPnL, winningTrades, losingTrades, totalTrades, winRate, avgWin, avgLoss, bestTrade, worstTrade, profitFactor };
    };

    return {
      todayStats: calculateStats(todayStart),
      weekStats: calculateStats(weekStart),
      monthStats: calculateStats(monthStart),
    };
  }, [positions]);

  if (isLoading) {
    return (
      <Card className="h-full p-4 sm:p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-muted rounded w-1/2" />
          <div className="h-16 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full p-4 sm:p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Performance
          </h3>
          <Target className="h-4 w-4 text-muted-foreground" />
        </div>

        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-7 mb-3">
            <TabsTrigger value="today" className="text-xs py-1">Today</TabsTrigger>
            <TabsTrigger value="week" className="text-xs py-1">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-xs py-1">Month</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="mt-0">
            <StatsDisplay stats={todayStats} />
          </TabsContent>
          <TabsContent value="week" className="mt-0">
            <StatsDisplay stats={weekStats} />
          </TabsContent>
          <TabsContent value="month" className="mt-0">
            <StatsDisplay stats={monthStats} />
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};
