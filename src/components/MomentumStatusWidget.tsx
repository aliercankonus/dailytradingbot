import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useMomentumStatus } from '@/hooks/useMomentumStatus';

export const MomentumStatusWidget = () => {
  const { momentumData, loading } = useMomentumStatus();

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Momentum Status
        </h3>
        <p className="text-muted-foreground text-sm">Loading momentum data...</p>
      </Card>
    );
  }

  if (momentumData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Momentum Status
        </h3>
        <p className="text-muted-foreground text-sm">No active symbols configured</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Momentum Status
      </h3>
      
      <div className="space-y-4">
        {momentumData.map((data) => {
          if (data.error) {
            return (
              <div key={data.symbol} className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{data.symbol}</span>
                  <Badge variant="destructive">Error</Badge>
                </div>
                <p className="text-sm text-destructive mt-2">{data.error}</p>
              </div>
            );
          }

          const { momentum, higherTimeframeFilter, multiTimeframe, trend } = data;
          const confirms = momentum.confirms;
          const building = momentum.building;
          
          // Determine which candle requirements are met
          const candles15mOK = 
            (trend === 'bullish' && momentum.consecutive15mBullish >= 2) ||
            (trend === 'bearish' && momentum.consecutive15mBearish >= 2);
          
          const candles30mOK = 
            (trend === 'bullish' && momentum.consecutive30mBullish >= 2) ||
            (trend === 'bearish' && momentum.consecutive30mBearish >= 2);
          
          const macdOK = Math.abs(momentum.macdHistogram) > 0.01;

          return (
            <div 
              key={data.symbol} 
              className={`p-4 rounded-lg border ${
                confirms 
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                  : 'bg-muted border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-lg">{data.symbol}</span>
                  {confirms ? (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Momentum Confirmed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      No Momentum
                    </Badge>
                  )}
                </div>
                <Badge variant={trend === 'bullish' ? 'default' : trend === 'bearish' ? 'destructive' : 'outline'}>
                  {trend === 'bullish' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {trend}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-xs">
                  <span className="text-muted-foreground">4h/1h:</span>
                  <span className="ml-2 font-medium">
                    {higherTimeframeFilter.trend4h} / {higherTimeframeFilter.trend1h}
                  </span>
                  {higherTimeframeFilter.aligned ? (
                    <CheckCircle className="inline h-3 w-3 ml-1 text-green-500" />
                  ) : (
                    <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-500" />
                  )}
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">30m/15m:</span>
                  <span className="ml-2 font-medium">
                    {multiTimeframe.trend30m} / {multiTimeframe.trend15m}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">15m Candles:</span>
                  <div className="flex items-center gap-2">
                    <span className={candles15mOK ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                      {momentum.consecutive15mBullish}🟢 / {momentum.consecutive15mBearish}🔴
                    </span>
                    {candles15mOK ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">30m Candles:</span>
                  <div className="flex items-center gap-2">
                    <span className={candles30mOK ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                      {momentum.consecutive30mBullish}🟢 / {momentum.consecutive30mBearish}🔴
                    </span>
                    {candles30mOK ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">MACD Histogram:</span>
                  <div className="flex items-center gap-2">
                    <span className={macdOK ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                      {momentum.macdHistogram.toFixed(3)}
                    </span>
                    {macdOK ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              {!confirms && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    <strong>Missing:</strong>{' '}
                    {!candles15mOK && '15m needs ≥2 consecutive candles'}
                    {!candles15mOK && !candles30mOK && ', '}
                    {!candles30mOK && '30m needs ≥2 consecutive candles'}
                    {(!candles15mOK || !candles30mOK) && !macdOK && ', '}
                    {!macdOK && 'MACD histogram needs >0.01'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
