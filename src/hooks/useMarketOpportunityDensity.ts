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
  structuralExpansionRate: number; // % of regime records that are TREND_EXPANSION

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

      const [regimeRes, rejectionRes, heartbeatRes] = await Promise.all([
        supabase
          .from('market_regime_history')
          .select('effective_regime, adx, adx_slope, bb_squeeze, symbol')
          .gte('recorded_at', since),
        supabase
          .from('signal_rejection_log')
          .select('symbol, filters_status')
          .gte('checked_at', since),
        supabase
          .from('bot_heartbeat')
          .select('no_trade_state')
          .gte('recorded_at', since),
      ]);

      // Regime distribution
      const regimeRecords = regimeRes.data || [];
      const regimeCounts: Record<string, { count: number; adxSum: number; slopeSum: number; adxRising: number; squeeze: number }> = {};
      
      for (const r of regimeRecords) {
        const regime = r.effective_regime || 'UNKNOWN';
        if (!regimeCounts[regime]) regimeCounts[regime] = { count: 0, adxSum: 0, slopeSum: 0, adxRising: 0, squeeze: 0 };
        regimeCounts[regime].count++;
        regimeCounts[regime].adxSum += (r.adx ?? 0);
        regimeCounts[regime].slopeSum += (r.adx_slope ?? 0);
        if ((r.adx_slope ?? 0) > 0) regimeCounts[regime].adxRising++;
        if (r.bb_squeeze) regimeCounts[regime].squeeze++;
      }

      const totalRegime = regimeRecords.length || 1;
      const regimeDistribution: MODData['regimeDistribution'] = {};
      for (const [k, v] of Object.entries(regimeCounts)) {
        regimeDistribution[k] = {
          count: v.count,
          pct: (v.count / totalRegime) * 100,
          avgAdx: v.adxSum / v.count,
          avgSlope: v.slopeSum / v.count,
          adxRisingPct: (v.adxRising / v.count) * 100,
          squeezePct: (v.squeeze / v.count) * 100,
        };
      }

      // Rejection density by gate
      const rejections = rejectionRes.data || [];
      const gateCounts: Record<string, number> = {};
      const symbolGates: Record<string, Record<string, number>> = {};
      
      for (const r of rejections) {
        const gate = (r.filters_status as any)?.gate || 'UNKNOWN';
        gateCounts[gate] = (gateCounts[gate] || 0) + 1;
        
        const sym = r.symbol;
        if (!symbolGates[sym]) symbolGates[sym] = {};
        symbolGates[sym][gate] = (symbolGates[sym][gate] || 0) + 1;
      }

      const symbolBreakdown: MODData['symbolBreakdown'] = {};
      for (const [sym, gates] of Object.entries(symbolGates)) {
        const sorted = Object.entries(gates).sort((a, b) => b[1] - a[1]);
        symbolBreakdown[sym] = {
          rejections: Object.values(gates).reduce((a, b) => a + b, 0),
          dominantGate: sorted[0]?.[0] || 'UNKNOWN',
        };
      }

      // No-trade states
      const heartbeats = heartbeatRes.data || [];
      const noTradeStates: Record<string, number> = {};
      for (const h of heartbeats) {
        const state = h.no_trade_state || 'UNKNOWN';
        noTradeStates[state] = (noTradeStates[state] || 0) + 1;
      }

      // Structural Expansion Rate
      const expansionCount = regimeCounts['TREND_EXPANSION']?.count || 0;
      const structuralExpansionRate = (expansionCount / totalRegime) * 100;

      // Energy Index: composite of ADX rising %, compression %, expansion %
      const totalAdxRising = regimeRecords.filter(r => (r.adx_slope ?? 0) > 0).length;
      const adxRisingPct = (totalAdxRising / totalRegime) * 100;
      const compressionPct = regimeDistribution['RANGE_COMPRESSION']?.pct || 0;
      const expansionPct = structuralExpansionRate;
      
      // Energy = weighted: 40% expansion rate + 30% ADX rising + 30% (100 - compression%)
      const energyIndex = Math.min(100, Math.max(0,
        (expansionPct * 0.4) + (adxRisingPct * 0.3) + ((100 - compressionPct) * 0.3)
      ));

      return {
        regimeDistribution,
        totalRegimeRecords: regimeRecords.length,
        rejectionDensity: gateCounts,
        totalRejections: rejections.length,
        structuralExpansionRate,
        energyIndex,
        noTradeStates,
        symbolBreakdown,
        days,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
