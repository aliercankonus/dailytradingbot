import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TrendIndicators {
  ema12: number;
  ema26: number;
  emaSignal: string;
  rsi: number;
  rsiSignal: string;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdTrend: string;
}

interface TrendData {
  symbol: string;
  currentPrice: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  indicators: TrendIndicators | null;
  timestamp: string;
  // Additional multi-timeframe data
  volatility?: {
    adx: number;
    atrPercent: number;
  };
  momentum?: {
    state: string;
    confirms: boolean;
  };
}

// Map the multi-timeframe response from calculate-trend to our TrendData format
function mapResponseToTrendData(data: any, symbol: string): TrendData | null {
  if (!data) return null;

  try {
    // Get 1h timeframe indicators as primary display (most relevant for trading)
    const tf1h = data.timeframes?.['1h'];
    const indicators1h = tf1h?.indicators;

    // Build indicators object from 1h data
    let indicators: TrendIndicators | null = null;
    if (indicators1h) {
      indicators = {
        ema12: indicators1h.ema12 ?? 0,
        ema26: indicators1h.ema26 ?? 0,
        emaSignal: indicators1h.emaSignal ?? 'neutral',
        rsi: indicators1h.rsi ?? 50,
        rsiSignal: indicators1h.rsiSignal ?? 'neutral',
        macd: indicators1h.macd ?? 0,
        macdSignal: indicators1h.macdSignal ?? 0,
        macdHistogram: indicators1h.macdHistogram ?? 0,
        macdTrend: indicators1h.macdTrend ?? 'neutral',
      };
    }

    return {
      symbol: data.symbol || symbol,
      currentPrice: data.currentPrice ?? 0,
      trend: data.trend || 'neutral',
      confidence: data.confidence ?? 0,
      indicators,
      timestamp: new Date().toISOString(),
      volatility: data.volatility ? {
        adx: data.volatility.adx ?? 0,
        atrPercent: data.volatility.atrPercent ?? 0,
      } : undefined,
      momentum: data.momentum ? {
        state: data.momentum.state ?? 'none',
        confirms: data.momentum.confirms ?? false,
      } : undefined,
    };
  } catch (err) {
    console.error('Error mapping trend data:', err);
    return null;
  }
}

export const useLiveTrend = (symbol: string, refreshInterval: number = 60000) => {
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrend = async () => {
    if (!symbol) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: functionError } = await supabase.functions.invoke('calculate-trend', {
        body: { symbol }
      });

      if (functionError) throw functionError;
      
      // Map the multi-timeframe response to our expected format
      const mappedData = mapResponseToTrendData(data, symbol);
      setTrendData(mappedData);
    } catch (err) {
      console.error('Error fetching trend:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trend');
      setTrendData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!symbol) {
      setTrendData(null);
      setLoading(false);
      return;
    }

    fetchTrend();
    const interval = setInterval(fetchTrend, refreshInterval);

    return () => clearInterval(interval);
  }, [symbol, refreshInterval]);

  return { trendData, loading, error, refetch: fetchTrend };
};
