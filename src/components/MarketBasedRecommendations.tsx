import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Activity, Zap, RefreshCw } from 'lucide-react';

interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedImpact: string;
}

interface MarketData {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
}

interface CachedRecommendations {
  recommendations: Recommendation[];
  marketCondition: string;
  marketData: MarketData[];
  timestamp: number;
}

const CACHE_KEY = 'ai_recommendations_cache';
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const MarketBasedRecommendations = () => {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketCondition, setMarketCondition] = useState<string>('neutral');
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      loadFromCacheOrFetch();
    }
  }, []);

  const loadFromCacheOrFetch = () => {
    const cached = loadFromCache();
    if (cached) {
      setRecommendations(cached.recommendations);
      setMarketCondition(cached.marketCondition);
      setMarketData(cached.marketData);
      setLastFetch(cached.timestamp);
    } else {
      fetchMarketDataAndRecommendations();
    }
  };

  const loadFromCache = (): CachedRecommendations | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const data: CachedRecommendations = JSON.parse(cached);
      const cacheTTL = parseInt(localStorage.getItem('ai_recommendation_ttl') || String(DEFAULT_CACHE_TTL));
      const now = Date.now();

      if (now - data.timestamp < cacheTTL) {
        return data;
      }
      
      // Cache expired
      localStorage.removeItem(CACHE_KEY);
      return null;
    } catch (error) {
      console.error('Error loading cache:', error);
      return null;
    }
  };

  const saveToCache = (data: Omit<CachedRecommendations, 'timestamp'>) => {
    try {
      const cacheData: CachedRecommendations = {
        ...data,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  };

  const fetchMarketDataAndRecommendations = async (force = false) => {
    // Check if we should fetch based on cache
    if (!force) {
      const cached = loadFromCache();
      if (cached) {
        setRecommendations(cached.recommendations);
        setMarketCondition(cached.marketCondition);
        setMarketData(cached.marketData);
        setLastFetch(cached.timestamp);
        return;
      }
    }

    try {
      setLoading(true);

      // Fetch market data
      const { data: functionData, error: marketError } = await supabase.functions.invoke('market-data', {
        body: { symbols: ['BTCUSDT', 'ETHUSDT'] }
      });

      if (marketError) throw marketError;

      if (functionData?.success && functionData?.data) {
        const data = functionData.data;
        setMarketData(data);

        // Analyze market condition
        const btcChange = parseFloat(data[0]?.priceChangePercent || '0');
        const ethChange = parseFloat(data[1]?.priceChangePercent || '0');
        const avgChange = (btcChange + ethChange) / 2;
        
        let condition = 'neutral';
        if (avgChange > 3) condition = 'bullish';
        else if (avgChange > 1) condition = 'slightly bullish';
        else if (avgChange < -3) condition = 'bearish';
        else if (avgChange < -1) condition = 'slightly bearish';
        else if (Math.abs(avgChange) < 0.5) condition = 'ranging';

        setMarketCondition(condition);

        // Call AI recommender
        const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-strategy-recommender', {
          body: { 
            marketCondition: condition,
            timeframe: '24h',
            marketData: {
              btcChange,
              ethChange,
              btcPrice: data[0]?.lastPrice,
              ethPrice: data[1]?.lastPrice
            }
          }
        });

        if (aiError) throw aiError;

        if (aiData?.success && aiData?.recommendations?.recommendations) {
          const topRecommendations = aiData.recommendations.recommendations
            .filter((r: Recommendation) => r.priority === 'high')
            .slice(0, 3);
          
          setRecommendations(topRecommendations);
          
          // Save to cache
          saveToCache({
            recommendations: topRecommendations,
            marketCondition: condition,
            marketData: data
          });
          
          setLastFetch(Date.now());
        }
      }
    } catch (error) {
      console.error('Error getting recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarketIcon = () => {
    if (marketCondition.includes('bullish')) return <TrendingUp className="h-5 w-5" />;
    if (marketCondition.includes('bearish')) return <TrendingDown className="h-5 w-5" />;
    return <Activity className="h-5 w-5" />;
  };

  const getMarketColor = () => {
    if (marketCondition.includes('bullish')) return 'text-green-500';
    if (marketCondition.includes('bearish')) return 'text-red-500';
    return 'text-yellow-500';
  };

  if (loading && recommendations.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">AI Market Insights</h3>
        </div>
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">AI Market Insights</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 ${getMarketColor()}`}>
            {getMarketIcon()}
            <span className="text-sm font-medium capitalize">{marketCondition}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchMarketDataAndRecommendations(true)}
            disabled={loading}
            title="Force refresh AI recommendations"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <div className="space-y-3">
          {recommendations.map((rec, idx) => (
            <div 
              key={idx}
              className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Badge variant={rec.priority === 'high' ? 'default' : 'secondary'}>
                  {rec.priority}
                </Badge>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">{rec.title}</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {rec.description}
                  </p>
                  <div className="text-xs text-primary font-medium">
                    {rec.action}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          No specific recommendations at this time. Market conditions are stable.
        </p>
      )}

      {marketData && marketData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-4 text-sm mb-2">
            <div>
              <span className="text-muted-foreground">BTC:</span>
              <span className={`ml-2 font-mono ${parseFloat(marketData[0]?.priceChangePercent || '0') >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {parseFloat(marketData[0]?.priceChangePercent || '0') >= 0 ? '+' : ''}
                {parseFloat(marketData[0]?.priceChangePercent || '0').toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">ETH:</span>
              <span className={`ml-2 font-mono ${parseFloat(marketData[1]?.priceChangePercent || '0') >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {parseFloat(marketData[1]?.priceChangePercent || '0') >= 0 ? '+' : ''}
                {parseFloat(marketData[1]?.priceChangePercent || '0').toFixed(2)}%
              </span>
            </div>
          </div>
          {lastFetch > 0 && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(lastFetch).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
