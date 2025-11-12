import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';

interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedImpact: string;
}

export const MarketBasedRecommendations = () => {
  const { data: marketData, loading: marketLoading } = useMarketData(['BTCUSDT', 'ETHUSDT']);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketCondition, setMarketCondition] = useState<string>('neutral');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (marketData && marketData.length > 0) {
      analyzeMarketAndGetRecommendations();
    }
  }, [marketData]);

  const analyzeMarketAndGetRecommendations = async () => {
    if (!marketData || marketData.length === 0) return;

    try {
      setLoading(true);

      // Analyze market condition based on price changes
      const btcChange = parseFloat(marketData[0]?.priceChangePercent || '0');
      const ethChange = parseFloat(marketData[1]?.priceChangePercent || '0');
      const avgChange = (btcChange + ethChange) / 2;
      
      let condition = 'neutral';
      if (avgChange > 3) condition = 'bullish';
      else if (avgChange > 1) condition = 'slightly bullish';
      else if (avgChange < -3) condition = 'bearish';
      else if (avgChange < -1) condition = 'slightly bearish';
      else if (Math.abs(avgChange) < 0.5) condition = 'ranging';

      setMarketCondition(condition);

      // Call AI recommender
      const { data, error } = await supabase.functions.invoke('ai-strategy-recommender', {
        body: { 
          marketCondition: condition,
          timeframe: '24h',
          marketData: {
            btcChange,
            ethChange,
            btcPrice: marketData[0]?.lastPrice,
            ethPrice: marketData[1]?.lastPrice
          }
        }
      });

      if (error) throw error;

      if (data?.success && data?.recommendations?.recommendations) {
        // Get top 3 high priority recommendations
        const topRecommendations = data.recommendations.recommendations
          .filter((r: Recommendation) => r.priority === 'high')
          .slice(0, 3);
        
        setRecommendations(topRecommendations);
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

  if (marketLoading || loading) {
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
        <div className={`flex items-center gap-2 ${getMarketColor()}`}>
          {getMarketIcon()}
          <span className="text-sm font-medium capitalize">{marketCondition}</span>
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
          <div className="grid grid-cols-2 gap-4 text-sm">
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
        </div>
      )}
    </Card>
  );
};
