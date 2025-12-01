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

  const getTierInfo = (reason: string) => {
    if (reason.includes('Tier 2a')) {
      return { tier: '2a', color: 'bg-yellow-500', label: 'Building Momentum (Early Entry)' };
    } else if (reason.includes('Tier 1')) {
      return { tier: '1', color: 'bg-green-500', label: 'Confirmed Momentum' };
    } else if (reason.includes('Tier 2b')) {
      return { tier: '2b', color: 'bg-blue-500', label: 'Building Momentum' };
    } else if (reason.includes('Tier 3')) {
      return { tier: '3', color: 'bg-orange-500', label: 'Mixed Momentum' };
    } else if (reason.includes('Tier 4')) {
      return { tier: '4', color: 'bg-purple-500', label: 'Exceptional Alignment' };
    }
    return { tier: 'N/A', color: 'bg-muted', label: 'Unknown' };
  };

  const getADX = (indicators: any) => {
    return indicators?.adx?.toFixed(1) || 'N/A';
  };

  const getMomentumState = (reason: string) => {
    if (reason.includes('confirmed momentum')) return 'Confirmed';
    if (reason.includes('Building momentum')) return 'Building';
    if (reason.includes('Mixed momentum')) return 'Mixed';
    return 'N/A';
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

  const tier2aSignals = signals.filter(s => s.reason?.includes('Tier 2a'));
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
          <span className="text-yellow-600 font-semibold">
            Early Entry (Tier 2a): {tier2aSignals.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <p className="text-muted-foreground">No signals generated in the last 12 hours</p>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => {
              const tierInfo = getTierInfo(signal.reason || '');
              const adx = getADX(signal.indicators);
              const momentum = getMomentumState(signal.reason || '');
              
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
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      ADX: {adx}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {momentum}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Conf: {signal.confidence_score?.toFixed(0)}%
                    </Badge>
                    <Badge className={`${tierInfo.color} text-white text-xs`}>
                      Tier {tierInfo.tier}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {tier2aSignals.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              ✓ Building momentum signals (Tier 2a) are being generated with ADX ≥25, 
              enabling earlier trend change detection.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
