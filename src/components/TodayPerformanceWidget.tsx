import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Trophy, Zap } from "lucide-react";
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
  avgHoldTimeMin: number;
  maxDrawdown: number;
}

const StatRow = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={cn("text-xs font-bold font-mono", valueClass || "text-foreground")}>{value}</span>
  </div>
);

const StatsDisplay = ({ stats }: { stats: PeriodStats }) => (
  <div className="space-y-1">
    {/* Hero P&L */}
    <div className="text-center py-2 border-b border-border">
      <div className={cn(
        "text-xl sm:text-2xl font-bold font-mono flex items-center justify-center gap-1",
        stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'
      )}>
        {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">Total P&L</div>
    </div>

    {/* Key metrics — 3 column grid */}
    <div className="grid grid-cols-3 gap-1.5 py-2 border-b border-border">
      <div className="text-center">
        <div className={cn("text-xs font-bold font-mono", stats.winRate >= 50 ? 'text-profit' : stats.totalTrades === 0 ? 'text-muted-foreground' : 'text-warning')}>
          {stats.winRate.toFixed(0)}%
        </div>
        <div className="text-[9px] text-muted-foreground">Win Rate</div>
      </div>
      <div className="text-center">
        <div className="text-xs font-bold font-mono text-foreground">{stats.totalTrades}</div>
        <div className="text-[9px] text-muted-foreground">{stats.winningTrades}W / {stats.losingTrades}L</div>
      </div>
      <div className="text-center">
        <div className={cn("text-xs font-bold font-mono", stats.profitFactor >= 1 ? 'text-profit' : stats.totalTrades === 0 ? 'text-muted-foreground' : 'text-loss')}>
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
        <div className="text-[9px] text-muted-foreground">Profit Factor</div>
      </div>
    </div>

    {/* Detail rows */}
    <div className="px-0.5">
      <StatRow label="Best Trade" value={`+$${stats.bestTrade.toFixed(2)}`} valueClass="text-profit" />
      <StatRow label="Worst Trade" value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`} valueClass="text-loss" />
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

      // Max drawdown calculation
      let peak = 0;
      let maxDD = 0;
      let running = 0;
      for (const p of filtered.sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())) {
        running += (p.realized_pnl || 0);
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
      }

      // Avg hold time
      let totalHoldMin = 0;
      let holdCount = 0;
      for (const p of filtered) {
        if (p.opened_at && p.closed_at) {
          totalHoldMin += (new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / 60000;
          holdCount++;
        }
      }
      const avgHoldTimeMin = holdCount > 0 ? totalHoldMin / holdCount : 0;

      return { totalPnL, winningTrades, losingTrades, totalTrades, winRate, avgWin, avgLoss, bestTrade, worstTrade, profitFactor, avgHoldTimeMin, maxDrawdown: maxDD };
    };

    return {
      todayStats: calculateStats(todayStart),
      weekStats: calculateStats(weekStart),
      monthStats: calculateStats(monthStart),
    };
  }, [positions]);

  if (isLoading) {
    return (
      <Card className="h-full p-4 border-border">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-12 bg-muted rounded" />
          <div className="h-6 bg-muted rounded" />
          <div className="h-6 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full p-4 border-border">
      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">Performance</h3>

        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-7 mb-2">
            <TabsTrigger value="today" className="text-[11px] py-0.5">Today</TabsTrigger>
            <TabsTrigger value="week" className="text-[11px] py-0.5">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-[11px] py-0.5">Month</TabsTrigger>
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
