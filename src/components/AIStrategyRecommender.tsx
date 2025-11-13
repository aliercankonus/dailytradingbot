import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Loader2 } from 'lucide-react';

interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedImpact: string;
}

interface StrategyAdjustment {
  strategyName: string;
  parameter: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
}

interface AIRecommendations {
  summary: string;
  recommendations: Recommendation[];
  strategyAdjustments: StrategyAdjustment[];
  marketInsight: string;
}

export const AIStrategyRecommender = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendations | null>(null);
  const [marketCondition, setMarketCondition] = useState('neutral');
  const [timeframe, setTimeframe] = useState('30d');
  const [selectedCrypto, setSelectedCrypto] = useState('BTCUSDT');

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      console.log('Fetching AI recommendations...');

      const { data, error } = await supabase.functions.invoke('ai-strategy-recommender', {
        body: { marketCondition, timeframe, symbol: selectedCrypto }
      });

      // Check for 402 AI credits exhausted error
      if (data?.status === 402 || data?.error === 'AI credits exhausted') {
        toast({
          title: 'AI Credits Exhausted',
          description: 'Your Lovable AI credits have run out. Please add credits in Settings → Workspace → Usage to continue using AI recommendations.',
          variant: 'destructive',
          duration: 10000, // Show for 10 seconds
        });
        return;
      }

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to generate recommendations');
      }

      console.log('AI recommendations received:', data);
      setRecommendations(data.recommendations);
      
      toast({
        title: 'AI Analysis Complete',
        description: 'Strategy recommendations generated successfully',
      });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate recommendations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <TrendingUp className="h-4 w-4" />;
      case 'low': return <Lightbulb className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Strategy Recommender
          </CardTitle>
          <CardDescription>
            Get AI-powered recommendations to optimize your trading strategies based on performance data and market conditions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cryptocurrency</label>
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
                  <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
                  <SelectItem value="BNBUSDT">BNB/USDT</SelectItem>
                  <SelectItem value="ADAUSDT">ADA/USDT</SelectItem>
                  <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Market Condition</label>
              <Select value={marketCondition} onValueChange={setMarketCondition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bullish">Bullish (Trending Up)</SelectItem>
                  <SelectItem value="bearish">Bearish (Trending Down)</SelectItem>
                  <SelectItem value="neutral">Neutral (Sideways)</SelectItem>
                  <SelectItem value="volatile">Volatile (High Fluctuation)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis Timeframe</label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={fetchRecommendations} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Strategies...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Generate AI Recommendations
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {recommendations && (
        <div className="space-y-6">
          {/* Summary */}
          <Alert>
            <AlertDescription className="text-sm">
              {recommendations.summary}
            </AlertDescription>
          </Alert>

          {/* Market Insight */}
          {recommendations.marketInsight && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Market Insight</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{recommendations.marketInsight}</p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {recommendations.recommendations && recommendations.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.recommendations.map((rec, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getPriorityIcon(rec.priority)}
                        <h3 className="font-semibold">{rec.title}</h3>
                      </div>
                      <Badge variant={getPriorityColor(rec.priority)}>
                        {rec.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                    <div className="bg-muted/50 rounded p-3 space-y-1">
                      <p className="text-sm font-medium">Action:</p>
                      <p className="text-sm">{rec.action}</p>
                    </div>
                    <div className="bg-muted/50 rounded p-3 space-y-1">
                      <p className="text-sm font-medium">Expected Impact:</p>
                      <p className="text-sm">{rec.expectedImpact}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Strategy Adjustments */}
          {recommendations.strategyAdjustments && recommendations.strategyAdjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Suggested Parameter Adjustments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recommendations.strategyAdjustments.map((adj, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <h3 className="font-semibold">{adj.strategyName}</h3>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Parameter</p>
                          <p className="font-medium">{adj.parameter}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Current → Suggested</p>
                          <p className="font-medium">{adj.currentValue} → {adj.suggestedValue}</p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-muted-foreground">Reason:</p>
                          <p>{adj.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
