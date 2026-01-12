import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ShadowModeStats {
  totalSignals: number;
  byGate: Record<string, number>;
  bySymbol: Record<string, number>;
  wouldHaveWon: number;
  wouldHaveLost: number;
  pending: number;
  recentSignals: ShadowSignal[];
}

interface ShadowSignal {
  id: string;
  symbol: string;
  signalType: string;
  gateBlockedBy: string;
  oldGateResult: string;
  newGateResult: string;
  gateDetails: Record<string, unknown>;
  confidenceScore: number | null;
  createdAt: string;
  outcomeTracked: boolean;
  wouldHaveWon: boolean | null;
  simulatedPnlPercent: number | null;
}

interface ShadowSignalRow {
  id: string;
  symbol: string;
  signal_type: string;
  gate_blocked_by: string;
  old_gate_result: string;
  new_gate_result: string;
  gate_details: Record<string, unknown>;
  confidence_score: number | null;
  created_at: string;
  outcome_tracked: boolean;
  would_have_won: boolean | null;
  simulated_pnl_percent: number | null;
}

export const useShadowModeStats = (hoursBack: number = 72) => {
  return useQuery({
    queryKey: ['shadow-mode-stats', hoursBack],
    queryFn: async (): Promise<ShadowModeStats> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

      // Use type assertion since shadow_mode_signals is a new table
      const { data, error } = await (supabase
        .from('shadow_mode_signals' as 'trading_signals')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false }) as unknown as Promise<{ data: ShadowSignalRow[] | null; error: Error | null }>);

      if (error) {
        throw error;
      }

      const byGate: Record<string, number> = {};
      const bySymbol: Record<string, number> = {};
      let wouldHaveWon = 0;
      let wouldHaveLost = 0;
      let pending = 0;

      const recentSignals: ShadowSignal[] = [];

      for (const signal of data || []) {
        byGate[signal.gate_blocked_by] = (byGate[signal.gate_blocked_by] || 0) + 1;
        bySymbol[signal.symbol] = (bySymbol[signal.symbol] || 0) + 1;

        if (signal.outcome_tracked) {
          if (signal.would_have_won) {
            wouldHaveWon++;
          } else {
            wouldHaveLost++;
          }
        } else {
          pending++;
        }

        if (recentSignals.length < 20) {
          recentSignals.push({
            id: signal.id,
            symbol: signal.symbol,
            signalType: signal.signal_type,
            gateBlockedBy: signal.gate_blocked_by,
            oldGateResult: signal.old_gate_result,
            newGateResult: signal.new_gate_result,
            gateDetails: signal.gate_details as Record<string, unknown>,
            confidenceScore: signal.confidence_score,
            createdAt: signal.created_at,
            outcomeTracked: signal.outcome_tracked,
            wouldHaveWon: signal.would_have_won,
            simulatedPnlPercent: signal.simulated_pnl_percent,
          });
        }
      }

      return {
        totalSignals: data?.length || 0,
        byGate,
        bySymbol,
        wouldHaveWon,
        wouldHaveLost,
        pending,
        recentSignals,
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });
};
