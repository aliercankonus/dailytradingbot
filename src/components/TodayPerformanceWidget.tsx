import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Target, Activity } from "lucide-react";
import { useClosedPositions } from "@/hooks/useClosedPositions";
import { useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

interface PeriodStats {
  totalPnL: number;
  winningTrades: number;
  totalTrades: number;
  winRate: number;
}

const StatsDisplay = ({ stats, label }: { stats: PeriodStats; label: string }) => (
  <div className="grid grid-cols-3 gap-3">
    {/* P&L */}
    <div className="text-center">
      <div className={`text-lg font-bold font-mono flex items-center justify-center gap-1 ${
        stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'
      }`}>
        {stats.totalPnL >= 0 ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">P&L</div>
    </div>

    {/* Win Rate */}
    <div className="text-center">
      <div className={`text-lg font-bold font-mono flex items-center justify-center gap-1 ${
        stats.winRate >= 50 ? 'text-profit' : stats.totalTrades === 0 ? 'text-muted-foreground' : 'text-warning'
      }`}>
        <Target className="h-3 w-3" />
        {stats.winRate.toFixed(0)}%
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">Win Rate</div>
    </div>

    {/* Total Trades */}
    <div className="text-center">
      <div className="text-lg font-bold font-mono text-foreground">
        {stats.totalTrades}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {stats.winningTrades}W / {stats.totalTrades - stats.winningTrades}L
      </div>
    </div>
  </div>
);

export const TodayPerformanceWidget = () => {
  const { data: positions = [], isLoading } = useClosedPositions();

  const { todayStats, weekStats, monthStats } = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const monthStart = startOfMonth(now);

    const calculateStats = (startDate: Date): PeriodStats => {
      const filteredPositions = positions.filter(p => {
        if (!p.closed_at) return false;
        const closedDate = new Date(p.closed_at);
        return isAfter(closedDate, startDate) || closedDate.getTime() === startDate.getTime();
      });

      const totalPnL = filteredPositions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
      const winningTrades = filteredPositions.filter(p => (p.realized_pnl || 0) > 0).length;
      const totalTrades = filteredPositions.length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      return { totalPnL, winningTrades, totalTrades, winRate };
    };

    return {
      todayStats: calculateStats(todayStart),
      weekStats: calculateStats(weekStart),
      monthStats: calculateStats(monthStart),
    };
  }, [positions]);

  if (isLoading) {
    return (
      <Card className="p-4 bg-card border-border">
        <div className="animate-pulse h-24 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-card to-card/80 border-border">
      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4" />
        Performance
      </h3>
      
      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-7 mb-3">
          <TabsTrigger value="today" className="text-xs py-1">Today</TabsTrigger>
          <TabsTrigger value="week" className="text-xs py-1">Week</TabsTrigger>
          <TabsTrigger value="month" className="text-xs py-1">Month</TabsTrigger>
        </TabsList>
        
        <TabsContent value="today" className="mt-0">
          <StatsDisplay stats={todayStats} label="Today" />
        </TabsContent>
        
        <TabsContent value="week" className="mt-0">
          <StatsDisplay stats={weekStats} label="This Week" />
        </TabsContent>
        
        <TabsContent value="month" className="mt-0">
          <StatsDisplay stats={monthStats} label="This Month" />
        </TabsContent>
      </Tabs>
    </Card>
  );
};
