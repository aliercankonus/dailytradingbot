import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface LateGrindStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  avgPositionSize: number;
  totalPnl: number;
  symbolBreakdown: Record<string, {
    trades: number;
    winRate: number;
    avgPnl: number;
  }>;
  recentTrades: Array<{
    id: string;
    symbol: string;
    side: string;
    pnl: number;
    pnlPercent: number;
    enteredAt: string | null;
    closedAt: string | null;
  }>;
}

export function useLateGrindAnalytics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['late-grind-analytics', user?.id],
    queryFn: async (): Promise<LateGrindStats> => {
      if (!user?.id) throw new Error("Not authenticated");

      // Fetch all Late Grind positions
      const { data: positions, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('entry_exception_type', 'LATE_GRIND_ACCEPTANCE')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });

      if (error) throw error;

      if (!positions || positions.length === 0) {
        return {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          avgProfit: 0,
          avgLoss: 0,
          profitFactor: 0,
          avgPositionSize: 0,
          totalPnl: 0,
          symbolBreakdown: {},
          recentTrades: [],
        };
      }

      // Calculate stats (excluding breakeven trades from win rate)
      const winners = positions.filter(p => (p.realized_pnl || 0) > 0);
      const losers = positions.filter(p => (p.realized_pnl || 0) < 0);
      const breakeven = positions.filter(p => (p.realized_pnl || 0) === 0);
      
      const totalProfit = winners.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
      const totalLoss = Math.abs(losers.reduce((sum, p) => sum + (p.realized_pnl || 0), 0));
      const totalPnl = positions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
      
      // Win rate excludes breakeven trades
      const decisiveTrades = winners.length + losers.length;
      
      // Symbol breakdown
      const symbolBreakdown: Record<string, { trades: number; wins: number; losses: number; totalPnl: number }> = {};
      positions.forEach(p => {
        if (!symbolBreakdown[p.symbol]) {
          symbolBreakdown[p.symbol] = { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
        }
        symbolBreakdown[p.symbol].trades++;
        if ((p.realized_pnl || 0) > 0) symbolBreakdown[p.symbol].wins++;
        else if ((p.realized_pnl || 0) < 0) symbolBreakdown[p.symbol].losses++;
        symbolBreakdown[p.symbol].totalPnl += p.realized_pnl || 0;
      });

      return {
        totalTrades: positions.length,
        winningTrades: winners.length,
        losingTrades: losers.length,
        winRate: decisiveTrades > 0 ? (winners.length / decisiveTrades) * 100 : 0,
        avgProfit: winners.length > 0 ? totalProfit / winners.length : 0,
        avgLoss: losers.length > 0 ? totalLoss / losers.length : 0,
        profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
        avgPositionSize: positions.reduce((sum, p) => sum + Number(p.quantity), 0) / positions.length,
        totalPnl,
        symbolBreakdown: Object.fromEntries(
          Object.entries(symbolBreakdown).map(([sym, stats]) => [
            sym,
            {
              trades: stats.trades,
              // Win rate excludes breakeven trades for symbol breakdown too
              winRate: (stats.wins + stats.losses) > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0,
              avgPnl: stats.trades > 0 ? stats.totalPnl / stats.trades : 0,
            }
          ])
        ),
        recentTrades: positions.slice(0, 10).map(p => ({
          id: p.id,
          symbol: p.symbol,
          side: p.side,
          pnl: p.realized_pnl || 0,
          pnlPercent: p.realized_pnl_percent || 0,
          enteredAt: p.opened_at,
          closedAt: p.closed_at,
        })),
      };
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });
}
