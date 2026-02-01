import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Rocket, TrendingUp, TrendingDown, Zap, Activity, CheckCircle, XCircle } from 'lucide-react';

interface TrendAccelerationIndicators {
  trendAcceleration?: {
    detected: boolean;
    movePercent: number;
    adxRising: boolean;
    bypassType?: string;
    positionSizeMultiplier?: number;
    gatesBypassed?: string[];
  };
  priceActionMomentum?: {
    hasStrongMove: boolean;
    movePercent: number;
    direction: string;
  };
  adx?: number;
  stochRsiK4h?: number;
}

interface TrendAccelerationData {
  symbol: string;
  signal_type: string;
  created_at: string;
  indicators: TrendAccelerationIndicators;
}

export const TrendAccelerationIndicator = () => {
  const [accelerations, setAccelerations] = useState<TrendAccelerationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAccelerations = async () => {
      try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        
        const { data, error } = await supabase
          .from('trading_signals')
          .select('symbol, signal_type, created_at, indicators')
          .gte('created_at', twelveHoursAgo)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        
        // Filter signals that have trend acceleration data
        const withAcceleration = (data || []).filter((signal) => {
          const indicators = signal.indicators as TrendAccelerationIndicators | null;
          return indicators?.trendAcceleration?.detected || 
                 indicators?.priceActionMomentum?.hasStrongMove;
        }).map((signal) => ({
          symbol: signal.symbol,
          signal_type: signal.signal_type,
          created_at: signal.created_at || '',
          indicators: (signal.indicators || {}) as TrendAccelerationIndicators,
        }));
        
        setAccelerations(withAcceleration);
      } catch (err) {
        console.error('Error fetching trend accelerations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccelerations();
    const interval = setInterval(fetchAccelerations, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Rocket className="h-4 w-4 animate-pulse" />
          <span>Loading trend acceleration data...</span>
        </div>
      </Card>
    );
  }

  const detectedCount = accelerations.filter(a => 
    a.indicators?.trendAcceleration?.detected
  ).length;
  
  const bypassedCount = accelerations.filter(a => 
    a.indicators?.trendAcceleration?.bypassType
  ).length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold">Trend Acceleration Monitor</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
            {detectedCount} Detected
          </Badge>
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
            {bypassedCount} Bypassed Gates
          </Badge>
        </div>
      </div>

      {accelerations.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No trend accelerations detected in the last 12 hours</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {accelerations.map((signal, idx) => {
            const indicators = signal.indicators;
            const accel = indicators?.trendAcceleration;
            const priceAction = indicators?.priceActionMomentum;
            const movePercent = accel?.movePercent || priceAction?.movePercent || 0;
            const isLong = signal.signal_type === 'long';
            
            return (
              <div 
                key={idx} 
                className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isLong ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">{signal.symbol}</span>
                    <Badge variant={isLong ? 'default' : 'destructive'} className="text-xs">
                      {signal.signal_type.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(signal.created_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  {/* Price Move */}
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-500" />
                    <span className="text-muted-foreground">Move:</span>
                    <span className={`font-medium ${movePercent >= 3 ? 'text-orange-500' : 'text-foreground'}`}>
                      {movePercent.toFixed(2)}%
                    </span>
                  </div>

                  {/* ADX Rising */}
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground">ADX Rising:</span>
                    {accel?.adxRising ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                  </div>

                  {/* ADX Value */}
                  {typeof indicators?.adx === 'number' && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">ADX:</span>
                      <span className="font-medium">{indicators.adx.toFixed(1)}</span>
                    </div>
                  )}

                  {/* StochRSI */}
                  {indicators?.stochRsiK4h !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">StochRSI K:</span>
                      <span className={`font-medium ${
                        indicators.stochRsiK4h > 80 ? 'text-red-500' : 
                        indicators.stochRsiK4h < 20 ? 'text-green-500' : ''
                      }`}>
                        {indicators.stochRsiK4h.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bypass Status */}
                {accel?.bypassType && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {accel.bypassType}
                      </Badge>
                      {accel.positionSizeMultiplier && accel.positionSizeMultiplier < 1 && (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs">
                          Size: {(accel.positionSizeMultiplier * 100).toFixed(0)}%
                        </Badge>
                      )}
                      {accel.gatesBypassed?.map((gate, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {gate.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strong Move Without Bypass (Blocked) */}
                {priceAction?.hasStrongMove && !accel?.bypassType && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-xs">
                      <XCircle className="h-3 w-3 mr-1" />
                      Strong move detected but gates not bypassed
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
