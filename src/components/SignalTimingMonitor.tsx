import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface SignalTiming {
  id: string;
  symbol: string;
  signal_type: string;
  created_at: string;
  reason: string;
  confidence_score: number;
  indicators: any;
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
    const interval = setInterval(fetchSignals, 30000); // Refresh every 30s

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
    if (indicators?.adx !== undefined) {
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
          <div className="space-y-3">
            {signals.map((signal) => {
              const qualityInfo = getQualityInfo(signal.indicators);
              const adx = getADX(signal.indicators);
              const momentum = getMomentumInfo(signal.indicators);
              const regime = getMarketRegime(signal.indicators);
              
              return (
                <div
                  key={signal.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                >
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
                  </div>
                </div>
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
