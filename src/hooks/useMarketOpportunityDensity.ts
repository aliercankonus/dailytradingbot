import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MODData {
  // Regime distribution
  regimeDistribution: Record<string, { count: number; pct: number; avgAdx: number; avgSlope: number; adxRisingPct: number; squeezePct: number }>;
  totalRegimeRecords: number;

  // Rejection density
  rejectionDensity: Record<string, number>;
  totalRejections: number;

  // Structural Expansion Candidates
  structuralExpansionRate: number;

  // Energy Index (composite)
  energyIndex: number;

  // No-trade state distribution
  noTradeStates: Record<string, number>;

  // Per-symbol breakdown
  symbolBreakdown: Record<string, { rejections: number; dominantGate: string }>;

  // Time range
  days: number;
}

export const useMarketOpportunityDensity = (days: number = 7) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['market-opportunity-density', user?.id, days],
    queryFn: async (): Promise<MODData> => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: rpcResult, error } = await supabase.rpc(
        'get_market_opportunity_density' as any,
        { p_user_id: user!.id, p_since: since }
      );

      if (error) {
        console.error('MOD RPC error:', error);
        throw error;
      }

      const result = rpcResult as any;

      // Parse regime data
      const regimeRecords = result?.regimes || [];
      const regimeDistribution: MODData['regimeDistribution'] = {};
      let totalRegimeRecords = 0;

      for (const r of regimeRecords) {
        totalRegimeRecords += Number(r.count);
      }
      const totalRegime = totalRegimeRecords || 1;

      for (const r of regimeRecords) {
        regimeDistribution[r.effective_regime || 'UNKNOWN'] = {
          count: Number(r.count),
          pct: (Number(r.count) / totalRegime) * 100,
          avgAdx: Number(r.avg_adx) || 0,
          avgSlope: Number(r.avg_slope) || 0,
          adxRisingPct: Number(r.adx_rising_pct) || 0,
          squeezePct: Number(r.squeeze_pct) || 0,
        };
      }

      // Parse rejection data
      const rejections = result?.rejections || {};
      const gateCounts: Record<string, number> = {};
      const byGate = rejections.by_gate || {};
      for (const [gate, count] of Object.entries(byGate)) {
        gateCounts[gate] = Number(count);
      }

      const totalRejections = Number(rejections.total) || 0;

      const symbolBreakdown: MODData['symbolBreakdown'] = {};
      const bySymbol = rejections.by_symbol || [];
      for (const s of bySymbol) {
        symbolBreakdown[s.symbol] = {
          rejections: Number(s.rejections),
          dominantGate: s.dominant_gate || 'UNKNOWN',
        };
      }

      // Parse heartbeat data
      const noTradeStates: Record<string, number> = {};
      const heartbeats = result?.heartbeats || {};
      for (const [state, count] of Object.entries(heartbeats)) {
        noTradeStates[state] = Number(count);
      }

      // Calculate derived metrics
      const expansionCount = regimeDistribution['TREND_EXPANSION']?.count || 0;
      const structuralExpansionRate = (expansionCount / totalRegime) * 100;

      // Energy Index
      let totalAdxRisingWeighted = 0;
      for (const r of regimeRecords) {
        totalAdxRisingWeighted += (Number(r.adx_rising_pct) / 100) * Number(r.count);
      }
      const adxRisingPct = (totalAdxRisingWeighted / totalRegime) * 100;
      const compressionPct = regimeDistribution['RANGE_COMPRESSION']?.pct || 0;
      const expansionPct = structuralExpansionRate;

      const energyIndex = Math.min(100, Math.max(0,
        (expansionPct * 0.4) + (adxRisingPct * 0.3) + ((100 - compressionPct) * 0.3)
      ));

      return {
        regimeDistribution,
        totalRegimeRecords,
        rejectionDensity: gateCounts,
        totalRejections,
        structuralExpansionRate,
        energyIndex,
        noTradeStates,
        symbolBreakdown,
        days,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
};
