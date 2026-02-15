import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MomentumData {
  symbol: string;
  momentum: {
    confirms: boolean;
    building: boolean;
    state: "none" | "mixed" | "confirmed" | "building" | "exhausted";
    lastCloseAlignsWithTrend: boolean;
    hasDivergence: boolean;
    macdHistogram: number;
    macdExpanding: boolean;
    macdDirectionAligned: boolean;
    adx: number;
    adxRising?: boolean;
    fakeBreakoutRisk?: boolean;
    genuineMomentum?: boolean;
    volumeConfirms?: boolean;
    volumeBoost?: number;
  };
  higherTimeframeFilter: {
    trend4h: string;
    trend1h: string;
    aligned: boolean;
  };
  multiTimeframe: {
    trend15m: string;
    trend30m: string;
  };
  trend: string;
  loading?: boolean;
  error?: string;
}

const fetchMomentumForSymbols = async (): Promise<MomentumData[]> => {
  // Get active trading symbols
  const { data: symbols, error: symbolsError } = await supabase
    .from('trading_symbols_config')
    .select('symbol')
    .eq('is_active', true);

  if (symbolsError) throw symbolsError;
  if (!symbols || symbols.length === 0) return [];

  // Read cached trend snapshots from DB (written by strategy-analyzer every 5 min)
  // No Binance API calls — eliminates geo-block, cold-start, and latency issues
  const symbolList = symbols.map(s => s.symbol);
  const { data: snapshots, error: snapshotError } = await supabase
    .from('trend_snapshots')
    .select('symbol, snapshot_data, recorded_at')
    .in('symbol', symbolList);

  if (snapshotError) throw snapshotError;

  const snapshotMap = new Map<string, any>();
  (snapshots || []).forEach((s: any) => snapshotMap.set(s.symbol, s.snapshot_data));

  return symbolList.map((symbol) => {
    const data = snapshotMap.get(symbol);
    if (!data) {
      return {
        symbol,
        loading: false,
        error: 'No cached data yet — waiting for next analysis cycle',
      } as MomentumData;
    }

    const timeframes = data.timeframes || {};
    const volatility = data.volatility || {};

    const getTfTrend = (tf: string) =>
      timeframes?.[tf]?.trend ?? timeframes?.[tf]?.indicators?.emaSignal ?? "unknown";

    const toNumber = (value: unknown, fallback = 0) => {
      const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    const macdHistogramRaw =
      data.momentum?.macdHistogram ??
      timeframes?.["1h"]?.indicators?.macdHistogram ??
      timeframes?.["1h"]?.indicators?.macd?.histogram ??
      0;

    return {
      symbol,
      momentum: {
        confirms: data.momentum?.confirms ?? false,
        building: data.momentum?.state === "building",
        state: data.momentum?.state ?? "none",
        lastCloseAlignsWithTrend: data.momentum?.lastCloseAlignsWithTrend ?? false,
        hasDivergence: data.momentum?.hasDivergence ?? false,
        macdHistogram: toNumber(macdHistogramRaw, 0),
        macdExpanding: data.momentum?.macdExpanding ?? false,
        macdDirectionAligned:
          data.momentum?.macdDirectionAligned ??
          Boolean(data.momentum?.macdStrong || data.momentum?.macdExpanding),
        adx: volatility.adx ?? 0,
        adxRising: data.momentum?.adxRising,
        fakeBreakoutRisk: data.momentum?.fakeBreakoutRisk,
        genuineMomentum: data.momentum?.genuineMomentum,
        volumeConfirms: data.momentum?.volumeConfirms ?? false,
        volumeBoost: data.volume?.["1h"]?.ratio,
      },
      higherTimeframeFilter: {
        trend4h: getTfTrend("4h"),
        trend1h: getTfTrend("1h"),
        aligned: data.isAligned ?? false,
      },
      multiTimeframe: {
        trend15m: getTfTrend("15m"),
        trend30m: getTfTrend("30m"),
      },
      trend: data.primaryTrend ?? "unknown",
    } as MomentumData;
  });
};

export const MOMENTUM_STATUS_QUERY_KEY = ['momentum-status'];

export const useMomentumStatus = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: MOMENTUM_STATUS_QUERY_KEY,
    queryFn: fetchMomentumForSymbols,
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
  });

  return { 
    momentumData: data || [], 
    loading: isLoading, 
    error: error?.message || null, 
    refetch 
  };
};
