import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSignalRefresh } from '@/contexts/SignalRefreshContext';

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
  volumeRatio: number | null;
  qualityScore: number | null;
  effectiveThreshold: number;
  isHolidayMode: boolean;
  isLowVolume: boolean;
  isVolumeUnknown: boolean;
  blockingGates: string[];
  rejectionReason: string;
  trendDirection: string;
  adx: number | null;
  momentumState: string;
  checkedAt: string;
}

export interface MarketConditions {
  symbols: SymbolCondition[];
  averageVolumeRatio: number | null;
  isGlobalHolidayMode: boolean;
  isVolumeUnknown: boolean;
  gateStatus: GateStatus;
  effectiveThreshold: number;
  totalBlocked: number;
  totalSymbols: number;
}

const fetchMarketConditions = async (): Promise<MarketConditions> => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data, error: queryError } = await supabase
    .from('signal_rejection_log')
    .select('*')
    .gte('checked_at', tenMinutesAgo)
    .order('checked_at', { ascending: false });

  if (queryError) throw queryError;

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

    const rawVolumeRatio = filtersStatus.volumeRatio ?? 
                           filtersStatus.volume_ratio ?? 
                           trendData?.volume?.ratio ?? 
                           null;
    
    const volumeRatio = typeof rawVolumeRatio === 'number' && rawVolumeRatio >= 0 
      ? rawVolumeRatio 
      : null;
    
    const qualityScore = filtersStatus.qualityScore ?? 
                        filtersStatus.quality_score ?? 
                        null;
    
    const trendDirection = filtersStatus.derivedDirection ?? 
                           filtersStatus.derived_direction ??
                           trendData?.trend ?? 
                           trendData?.direction ?? 
                           'unknown';
    
    const rawAdx = filtersStatus.adx ?? 
                   filtersStatus.ADX ?? 
                   trendData?.adx ?? 
                   trendData?.ADX ?? 
                   null;
    const adx = typeof rawAdx === 'number' ? rawAdx : null;
    
    const momentumState = filtersStatus.momentumState ?? 
                          filtersStatus.momentum_state ?? 
                          filtersStatus.momentumDirection ??
                          trendData?.momentumState ?? 
                          'unknown';
    
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

    const isVolumeUnknown = volumeRatio === null;
    const isLowVolume = !isVolumeUnknown && volumeRatio < LOW_VOLUME_THRESHOLD;
    const isHolidayMode = !isVolumeUnknown && volumeRatio < HOLIDAY_MODE_THRESHOLD;
    const effectiveThreshold = isLowVolume 
      ? BASE_QUALITY_THRESHOLD + LOW_VOLUME_QUALITY_BOOST 
      : BASE_QUALITY_THRESHOLD;

    symbols.push({
      symbol,
      volumeRatio,
      qualityScore,
      effectiveThreshold,
      isHolidayMode,
      isLowVolume,
      isVolumeUnknown,
      blockingGates,
      rejectionReason: reason,
      trendDirection,
      adx,
      momentumState,
      checkedAt: rejection.checked_at,
    });

    if (!isVolumeUnknown) {
      totalVolumeRatio += volumeRatio;
      volumeCount++;
    }
  });

  const averageVolumeRatio = volumeCount > 0 ? totalVolumeRatio / volumeCount : null;
  const isGlobalVolumeUnknown = averageVolumeRatio === null;
  const isGlobalHolidayMode = !isGlobalVolumeUnknown && averageVolumeRatio < HOLIDAY_MODE_THRESHOLD;
  const effectiveThreshold = !isGlobalVolumeUnknown && averageVolumeRatio < LOW_VOLUME_THRESHOLD 
    ? BASE_QUALITY_THRESHOLD + LOW_VOLUME_QUALITY_BOOST 
    : BASE_QUALITY_THRESHOLD;

  return {
    symbols: symbols.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    averageVolumeRatio,
    isGlobalHolidayMode,
    isVolumeUnknown: isGlobalVolumeUnknown,
    gateStatus,
    effectiveThreshold,
    totalBlocked: symbols.length,
    totalSymbols: symbols.length,
  };
};

export const useMarketConditions = () => {
  const { lastRefreshTime } = useSignalRefresh();

  const { data: conditions, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['market-conditions', lastRefreshTime],
    queryFn: fetchMarketConditions,
    staleTime: 55000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  return { 
    conditions: conditions ?? null, 
    loading, 
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch market conditions') : null, 
    refresh: refetch 
  };
};
