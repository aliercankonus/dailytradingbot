import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Constants matching edge function thresholds
const LOW_VOLUME_THRESHOLD = 0.5; // 50% of average
const HOLIDAY_MODE_THRESHOLD = 0.3; // 30% of average
const BASE_QUALITY_THRESHOLD = 65;
const LOW_VOLUME_QUALITY_BOOST = 3; // Reduced from 5 to 3 for better momentum catching

interface GateStatus {
  htfExtreme: number;
  bollingerPosition: number;
  qualityScore: number;
  momentum: number;
  trendDirection: number;
  ranging: number;
}

interface SymbolCondition {
  symbol: string;
  volumeRatio: number;
  qualityScore: number | null;
  effectiveThreshold: number;
  isHolidayMode: boolean;
  isLowVolume: boolean;
  blockingGates: string[];
  rejectionReason: string;
  trendDirection: string;
  adx: number | null;
  momentumState: string;
  checkedAt: string;
}

export interface MarketConditions {
  symbols: SymbolCondition[];
  averageVolumeRatio: number;
  isGlobalHolidayMode: boolean;
  gateStatus: GateStatus;
  effectiveThreshold: number;
  totalBlocked: number;
  totalSymbols: number;
}

export const useMarketConditions = () => {
  const [conditions, setConditions] = useState<MarketConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConditions = async () => {
    try {
      // Get rejections from last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const { data, error: queryError } = await supabase
        .from('signal_rejection_log')
        .select('*')
        .gte('checked_at', tenMinutesAgo)
        .order('checked_at', { ascending: false });

      if (queryError) throw queryError;

      // Get latest rejection per symbol
      const latestBySymbol = new Map<string, any>();
      data?.forEach((rejection) => {
        if (!latestBySymbol.has(rejection.symbol)) {
          latestBySymbol.set(rejection.symbol, rejection);
        }
      });

      const gateStatus: GateStatus = {
        htfExtreme: 0,
        bollingerPosition: 0,
        qualityScore: 0,
        momentum: 0,
        trendDirection: 0,
        ranging: 0,
      };

      const symbols: SymbolCondition[] = [];
      let totalVolumeRatio = 0;
      let volumeCount = 0;

      latestBySymbol.forEach((rejection, symbol) => {
        const filtersStatus = rejection.filters_status || {};
        const trendData = rejection.trend_data || {};
        const reason = rejection.rejection_reason || '';

        // Extract volume ratio from filters_status
        const volumeRatio = filtersStatus.volumeRatio ?? 
                           filtersStatus.volume_ratio ?? 
                           trendData.volumeRatio ?? 
                           1.0;
        
        // Extract quality score
        const qualityScore = filtersStatus.qualityScore ?? 
                            filtersStatus.quality_score ?? 
                            null;

        // Determine blocking gates from rejection reason
        const blockingGates: string[] = [];
        
        if (reason.includes('HTF_EXTREME') || reason.includes('overbought') || reason.includes('oversold')) {
          blockingGates.push('HTF Extreme');
          gateStatus.htfExtreme++;
        }
        if (reason.includes('BOLLINGER') || reason.includes('%B')) {
          blockingGates.push('Bollinger Position');
          gateStatus.bollingerPosition++;
        }
        if (reason.includes('QUALITY') || reason.includes('quality')) {
          blockingGates.push('Quality Score');
          gateStatus.qualityScore++;
        }
        if (reason.includes('MOMENTUM') || reason.includes('momentum')) {
          blockingGates.push('Momentum');
          gateStatus.momentum++;
        }
        if (reason.includes('DIRECTION') || reason.includes('direction') || reason.includes('alignment')) {
          blockingGates.push('Trend Direction');
          gateStatus.trendDirection++;
        }
        if (reason.includes('RANGING') || reason.includes('ranging') || reason.includes('ADX')) {
          blockingGates.push('Ranging Market');
          gateStatus.ranging++;
        }

        const isLowVolume = volumeRatio < LOW_VOLUME_THRESHOLD;
        const isHolidayMode = volumeRatio < HOLIDAY_MODE_THRESHOLD;
        const effectiveThreshold = isLowVolume 
          ? BASE_QUALITY_THRESHOLD + LOW_VOLUME_QUALITY_BOOST 
          : BASE_QUALITY_THRESHOLD;

        // Extract trend info
        const trendDirection = trendData.trend || trendData.direction || 'unknown';
        const adx = trendData.adx ?? trendData.ADX ?? null;
        const momentumState = trendData.momentumState || trendData.momentum_state || 'unknown';

        symbols.push({
          symbol,
          volumeRatio,
          qualityScore,
          effectiveThreshold,
          isHolidayMode,
          isLowVolume,
          blockingGates,
          rejectionReason: reason,
          trendDirection,
          adx,
          momentumState,
          checkedAt: rejection.checked_at,
        });

        totalVolumeRatio += volumeRatio;
        volumeCount++;
      });

      const averageVolumeRatio = volumeCount > 0 ? totalVolumeRatio / volumeCount : 1.0;
      const isGlobalHolidayMode = averageVolumeRatio < HOLIDAY_MODE_THRESHOLD;
      const effectiveThreshold = averageVolumeRatio < LOW_VOLUME_THRESHOLD 
        ? BASE_QUALITY_THRESHOLD + LOW_VOLUME_QUALITY_BOOST 
        : BASE_QUALITY_THRESHOLD;

      setConditions({
        symbols: symbols.sort((a, b) => a.symbol.localeCompare(b.symbol)),
        averageVolumeRatio,
        isGlobalHolidayMode,
        gateStatus,
        effectiveThreshold,
        totalBlocked: symbols.length,
        totalSymbols: symbols.length,
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching market conditions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch market conditions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConditions();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchConditions, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { conditions, loading, error, refresh: fetchConditions };
};
