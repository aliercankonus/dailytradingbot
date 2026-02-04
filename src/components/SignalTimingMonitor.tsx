import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingDown, TrendingUp, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SignalTiming {
  id: string;
  symbol: string;
  signal_type: string;
  created_at: string;
  reason: string;
  confidence_score: number;
  indicators: any;
  strategy_name: string | null;
}

export const SignalTimingMonitor = () => {
  const [signals, setSignals] = useState<SignalTiming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        // Get signals from last 12 hours
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        
        const { data, error } = await supabase
          .from('trading_signals')
          .select('*')
          .gte('created_at', twelveHoursAgo)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSignals(data || []);
      } catch (err) {
        console.error('Error fetching signals:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
    // Increased from 30s to 120s to reduce UI refresh interruptions
    const interval = setInterval(fetchSignals, 120000);

    return () => clearInterval(interval);
  }, []);

  const getADX = (indicators: any) => {
    // Extract ADX from qualityBreakdown like "ADX:25/25 MOM:0/25..."
    const breakdown = indicators?.qualityBreakdown;
    if (breakdown && typeof breakdown === 'string') {
      const adxMatch = breakdown.match(/ADX:(\d+)\/25/);
      if (adxMatch) {
        return adxMatch[1];
      }
    }
    // Fallback to direct adx field if exists
    if (typeof indicators?.adx === 'number') {
      return indicators.adx.toFixed(1);
    }
    return 'N/A';
  };

  const getQualityInfo = (indicators: any) => {
    const score = indicators?.qualityScore;
    if (score === undefined || score === null) return { score: 'N/A', color: 'bg-muted', label: 'Unknown' };
    
    if (score >= 75) {
      return { score, color: 'bg-green-500', label: 'Excellent' };
    } else if (score >= 65) {
      return { score, color: 'bg-blue-500', label: 'Good' };
    } else if (score >= 55) {
      return { score, color: 'bg-yellow-500', label: 'Fair' };
    } else {
      return { score, color: 'bg-orange-500', label: 'Low' };
    }
  };

  const getMomentumInfo = (indicators: any) => {
    // Extract momentum score from qualityBreakdown
    const breakdown = indicators?.qualityBreakdown;
    if (breakdown && typeof breakdown === 'string') {
      const momMatch = breakdown.match(/MOM:(\d+)\/25/);
      if (momMatch) {
        const momScore = parseInt(momMatch[1]);
        if (momScore >= 20) return 'Confirmed';
        if (momScore >= 10) return 'Building';
        if (momScore > 0) return 'Weak';
        return 'None';
      }
    }
    return 'N/A';
  };

  const getMarketRegime = (indicators: any) => {
    return indicators?.marketRegime || 'N/A';
  };

  const getTrueAlignmentV2 = (indicators: any) => {
    const alignment = indicators?.trueAlignmentV2 || indicators?.trueAlignment;
    if (!alignment) return null;
    
    const weighted = alignment.weightedComponents || {};
    return {
      score: alignment.score ?? alignment.totalWeightedConfidence ?? 0,
      tf4h: weighted.tf4hWeighted ?? 0,
      tf1h: weighted.tf1hWeighted ?? 0,
      adx: weighted.adxWeighted ?? alignment.adxContribution ?? 0,
      volume: weighted.volumeWeighted ?? 0,
      neutralCapped: alignment.neutralCapped === true,
      isPremium: (weighted.tf4hWeighted ?? 0) >= 30 && (weighted.tf1hWeighted ?? 0) >= 15,
      isWeak: alignment.neutralCapped === true || (alignment.tf4hConfidence ?? 0) < 40
    };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Signal Timing Monitor (Last 12 Hours)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading signals...</p>
        </CardContent>
      </Card>
    );
  }

  const highQualitySignals = signals.filter(s => (s.indicators?.qualityScore || 0) >= 65);
  const totalSignals = signals.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Signal Timing Monitor (Last 12 Hours)
        </CardTitle>
        <div className="flex gap-4 text-sm text-muted-foreground mt-2">
          <span>Total Signals: {totalSignals}</span>
          <span className="text-green-600 font-semibold">
            High Quality (≥65): {highQualitySignals.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <p className="text-muted-foreground">No signals generated in the last 12 hours</p>
        ) : (
          <div className="space-y-2">
            {signals.map((signal) => {
              const qualityInfo = getQualityInfo(signal.indicators);
              const adx = getADX(signal.indicators);
              const momentum = getMomentumInfo(signal.indicators);
              const regime = getMarketRegime(signal.indicators);
              const alignment = getTrueAlignmentV2(signal.indicators);
              
              return (
                <Collapsible key={signal.id}>
                  <div className="p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {signal.signal_type === 'long' ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <div className="font-semibold">{signal.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(signal.created_at), 'MMM dd, HH:mm:ss')}
                          </div>
                          {signal.strategy_name && (
                            <div className="text-xs text-primary font-medium">
                              {signal.strategy_name}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant="outline" className="text-xs">
                          ADX: {adx}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {momentum}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Conf: {signal.confidence_score?.toFixed(0) || 'N/A'}%
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {regime}
                        </Badge>
                        <Badge className={`${qualityInfo.color} text-white text-xs`}>
                          Q: {qualityInfo.score}
                        </Badge>
                        
                        {alignment && (
                          <CollapsibleTrigger asChild>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs cursor-pointer flex items-center gap-1 ${
                                      alignment.isPremium ? 'border-green-500 text-green-600' :
                                      alignment.isWeak ? 'border-orange-500 text-orange-600' :
                                      'border-blue-500 text-blue-600'
                                    }`}
                                  >
                                    <Layers className="h-3 w-3" />
                                    Align
                                    <ChevronDown className="h-3 w-3" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Click to view TrueAlignment v2.0 breakdown</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </CollapsibleTrigger>
                        )}
                      </div>
                    </div>
                    
                    {/* TrueAlignment v2.0 Breakdown Panel */}
                    {alignment && (
                      <CollapsibleContent>
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5" />
                            TrueAlignment v2.0 Breakdown
                            {alignment.isPremium && (
                              <Badge variant="outline" className="text-[10px] py-0 border-green-500 text-green-600">
                                PREMIUM +10%
                              </Badge>
                            )}
                            {alignment.isWeak && (
                              <Badge variant="outline" className="text-[10px] py-0 border-orange-500 text-orange-600">
                                WEAK -10%
                              </Badge>
                            )}
                            {alignment.neutralCapped && (
                              <Badge variant="outline" className="text-[10px] py-0 border-yellow-500 text-yellow-600">
                                CAPPED
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* 4H Timeframe */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">4H Weight</span>
                                <span className="font-medium">{alignment.tf4h.toFixed(1)}</span>
                              </div>
                              <Progress 
                                value={Math.min(100, (alignment.tf4h / 35) * 100)} 
                                className="h-1.5"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                {alignment.tf4h >= 30 ? '✓ Strong' : alignment.tf4h >= 20 ? '○ Moderate' : '✗ Weak'}
                              </div>
                            </div>
                            
                            {/* 1H Timeframe */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">1H Weight</span>
                                <span className="font-medium">{alignment.tf1h.toFixed(1)}</span>
                              </div>
                              <Progress 
                                value={Math.min(100, (alignment.tf1h / 20) * 100)} 
                                className="h-1.5"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                {alignment.tf1h >= 15 ? '✓ Aligned' : alignment.tf1h >= 8 ? '○ Partial' : '✗ Misaligned'}
                              </div>
                            </div>
                            
                            {/* ADX Contribution */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">ADX Contrib</span>
                                <span className="font-medium">{typeof alignment.adx === 'number' ? alignment.adx.toFixed(1) : 'N/A'}</span>
                              </div>
                              <Progress 
                                value={Math.min(100, ((typeof alignment.adx === 'number' ? alignment.adx : 0) / 15) * 100)} 
                                className="h-1.5"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                {alignment.adx >= 12 ? '✓ Trending' : alignment.adx >= 6 ? '○ Building' : '✗ Ranging'}
                              </div>
                            </div>
                            
                            {/* Volume */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Volume</span>
                                <span className="font-medium">{alignment.volume.toFixed(1)}</span>
                              </div>
                              <Progress 
                                value={Math.min(100, (alignment.volume / 5) * 100)} 
                                className="h-1.5"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                {alignment.volume >= 4 ? '✓ Confirmed' : alignment.volume >= 2 ? '○ Neutral' : '✗ Low'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Total Score */}
                          <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Total Weighted Score</span>
                            <span className={`text-sm font-semibold ${
                              alignment.score >= 60 ? 'text-green-600' :
                              alignment.score >= 45 ? 'text-blue-600' :
                              'text-orange-600'
                            }`}>
                              {alignment.score.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </CollapsibleContent>
                    )}
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
        
        {highQualitySignals.length > 0 && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-400">
              ✓ {highQualitySignals.length} high-quality signals (≥65 score) generated with confirmed ADX strength and momentum.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
