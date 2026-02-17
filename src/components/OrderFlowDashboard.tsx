import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, TrendingDown, Zap, AlertTriangle, Grid3X3, ArrowUpDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';

// Calculate Pearson correlation coefficient between two price series
const calculatePearsonCorrelation = (prices1: number[], prices2: number[]): number => {
  if (prices1.length !== prices2.length || prices1.length < 10) return 0;
  const n = prices1.length;
  const returns1: number[] = [];
  const returns2: number[] = [];
  for (let i = 1; i < n; i++) {
    returns1.push((prices1[i] - prices1[i-1]) / prices1[i-1]);
    returns2.push((prices2[i] - prices2[i-1]) / prices2[i-1]);
  }
  const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;
  let numerator = 0, sum1Sq = 0, sum2Sq = 0;
  for (let i = 0; i < returns1.length; i++) {
    const diff1 = returns1[i] - mean1;
    const diff2 = returns2[i] - mean2;
    numerator += diff1 * diff2;
    sum1Sq += diff1 * diff1;
    sum2Sq += diff2 * diff2;
  }
  const denominator = Math.sqrt(sum1Sq * sum2Sq);
  return denominator === 0 ? 0 : numerator / denominator;
};

const getCorrelationColor = (correlation: number): string => {
  const absCorr = Math.abs(correlation);
  if (absCorr >= 0.85) return 'bg-red-500/80 text-white';
  if (absCorr >= 0.75) return 'bg-orange-500/70 text-white';
  if (absCorr >= 0.60) return 'bg-yellow-500/60 text-black';
  if (absCorr >= 0.40) return 'bg-blue-500/40 text-white';
  return 'bg-muted text-muted-foreground';
};

const getCorrelationLabel = (correlation: number): string => {
  const absCorr = Math.abs(correlation);
  if (absCorr >= 0.85) return 'Very High';
  if (absCorr >= 0.75) return 'High';
  if (absCorr >= 0.60) return 'Moderate';
  if (absCorr >= 0.40) return 'Low';
  return 'Very Low';
};

interface OrderFlowData {
  symbol: string;
  volumeSpike: {
    detected: boolean;
    magnitude: number;
    type: "bullish" | "bearish" | "neutral";
    significance: "low" | "medium" | "high" | "extreme";
  };
  priceRejection: {
    detected: boolean;
    type: "bullish_rejection" | "bearish_rejection" | "none";
    wickRatio: number;
    strength: number;
    level: "support" | "resistance" | "none";
  };
  pressure: {
    buyingPressure: number;
    sellingPressure: number;
    delta: number;
    trend: "accumulation" | "distribution" | "neutral";
  };
  score: number;
  signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  confidence: number;
  reasons: string[];
  lastUpdated: Date;
  intendedDirection: "long" | "short";
  directionSource: "strategy-analyzer" | "sma20";
}

// Staleness threshold — snapshots older than 7 minutes are stale
const SNAPSHOT_STALE_MINUTES = 7;

const fetchOrderFlowFromCache = async (): Promise<{ orderFlowData: OrderFlowData[]; priceData: Map<string, number[]> }> => {
  // Get active symbols
  const { data: symbols, error: symbolsError } = await supabase
    .from('trading_symbols_config')
    .select('symbol')
    .eq('is_active', true);

  if (symbolsError) throw symbolsError;
  if (!symbols || symbols.length === 0) return { orderFlowData: [], priceData: new Map() };

  const symbolList = symbols.map(s => s.symbol);

  // Read cached trend snapshots (order flow is embedded in snapshot_data by strategy-analyzer)
  const { data: snapshots, error: snapshotError } = await supabase
    .from('trend_snapshots')
    .select('symbol, snapshot_data, recorded_at')
    .in('symbol', symbolList);

  if (snapshotError) throw snapshotError;

  const now = Date.now();
  const staleMs = SNAPSHOT_STALE_MINUTES * 60 * 1000;
  const results: OrderFlowData[] = [];
  const priceData = new Map<string, number[]>();

  for (const snapshot of (snapshots || [])) {
    const snapshotAge = now - new Date(snapshot.recorded_at).getTime();
    if (snapshotAge > staleMs) continue; // Skip stale snapshots

    const data = snapshot.snapshot_data as any;
    const orderFlow = data?.orderFlow;
    if (!orderFlow) continue; // No cached order flow yet

    // Extract correlation closes
    const closes = data?.correlationCloses;
    if (Array.isArray(closes) && closes.length >= 10) {
      priceData.set(snapshot.symbol, closes);
    }

    results.push({
      symbol: snapshot.symbol,
      volumeSpike: orderFlow.volumeSpike ?? { detected: false, magnitude: 1, type: "neutral", significance: "low" },
      priceRejection: orderFlow.priceRejection ?? { detected: false, type: "none", wickRatio: 0, strength: 0, level: "none" },
      pressure: orderFlow.pressure ?? { buyingPressure: 50, sellingPressure: 50, delta: 0, trend: "neutral" },
      score: orderFlow.score ?? 50,
      signal: orderFlow.signal ?? "neutral",
      confidence: orderFlow.confidence ?? 0,
      reasons: orderFlow.reasons ?? [],
      lastUpdated: new Date(snapshot.recorded_at),
      intendedDirection: orderFlow.intendedDirection ?? "long",
      directionSource: orderFlow.directionSource ?? "sma20",
    });
  }

  return { orderFlowData: results, priceData };
};

export const OrderFlowDashboard = () => {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['order-flow-cached'],
    queryFn: fetchOrderFlowFromCache,
    staleTime: 5 * 60 * 1000,     // 5 min — aligned with strategy-analyzer cycle
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 min
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });

  const orderFlowData = data?.orderFlowData || [];
  const priceData = data?.priceData || new Map<string, number[]>();

  // Calculate correlation matrix from cached closes
  const correlationMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, number>>();
    const symbolList = Array.from(priceData.keys());
    for (const s1 of symbolList) {
      const row = new Map<string, number>();
      for (const s2 of symbolList) {
        if (s1 === s2) { row.set(s2, 1.0); continue; }
        const p1 = priceData.get(s1)!;
        const p2 = priceData.get(s2)!;
        row.set(s2, calculatePearsonCorrelation(p1, p2));
      }
      matrix.set(s1, row);
    }
    return matrix;
  }, [priceData]);

  const getCorrelation = (symbol1: string, symbol2: string): number => {
    if (symbol1 === symbol2) return 1.0;
    return correlationMatrix.get(symbol1)?.get(symbol2) ?? 
           correlationMatrix.get(symbol2)?.get(symbol1) ?? 0;
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'strong_buy': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'buy': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'neutral': return 'bg-muted text-muted-foreground border-border';
      case 'sell': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'strong_sell': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 55) return 'text-green-400';
    if (score >= 45) return 'text-muted-foreground';
    if (score >= 30) return 'text-orange-400';
    return 'text-red-400';
  };

  const showLoading = isLoading && !data;
  const isRefreshing = isFetching && !!data;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg font-semibold">Order Flow</CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Volume spikes, price rejections & institutional activity</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 self-end sm:self-auto"
        >
          {isRefreshing ? (
            <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Refreshing</>
          ) : showLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {showLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading order flow data...
          </div>
        ) : orderFlowData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No cached data yet — waiting for next analysis cycle (~5 min)
          </div>
        ) : (
          <Tabs defaultValue="orderflow" className="w-full">
            <TabsList className="mb-4 flex w-full overflow-x-auto scrollbar-hide">
              <TabsTrigger value="orderflow">Order Flow</TabsTrigger>
              <TabsTrigger value="correlation">
                <Grid3X3 className="h-4 w-4 mr-1 sm:mr-2" />
                Correlation
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="orderflow" className="space-y-4">
              {orderFlowData.map((data) => (
                <Card key={data.symbol} className="bg-background/50 border-border/50">
                  <CardContent className="p-4">
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-lg">{data.symbol}</span>
                        <Badge className={getSignalColor(data.signal)}>
                          {data.signal.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className={
                          data.intendedDirection === "long" 
                            ? "border-green-500/30 text-green-400" 
                            : "border-red-500/30 text-red-400"
                        }>
                          {data.intendedDirection === "long" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                          {data.intendedDirection.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {data.directionSource === "strategy-analyzer" ? "📊 Strategy" : "📈 SMA20"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="sm:text-right">
                          <span className={`text-xl sm:text-2xl font-bold ${getScoreColor(data.score)}`}>
                            {data.score}/100
                          </span>
                          <span className="text-xs text-muted-foreground ml-2 sm:ml-0 sm:block">
                            {data.confidence}% conf
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {/* Volume Spike */}
                      <div className="p-3 rounded-lg bg-card border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className={`h-4 w-4 ${data.volumeSpike.detected ? 'text-yellow-400' : 'text-muted-foreground'}`} />
                          <span className="text-sm font-medium">Volume Spike</span>
                        </div>
                        {data.volumeSpike.detected ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Magnitude</span>
                              <span className="font-mono font-bold">{data.volumeSpike.magnitude}x</span>
                            </div>
                            <Badge variant="outline" className={
                              data.volumeSpike.type === 'bullish' ? 'border-green-500/30 text-green-400' :
                              data.volumeSpike.type === 'bearish' ? 'border-red-500/30 text-red-400' :
                              'border-muted text-muted-foreground'
                            }>
                              {data.volumeSpike.type} • {data.volumeSpike.significance}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No spike detected</span>
                        )}
                      </div>

                      {/* Price Rejection */}
                      <div className="p-3 rounded-lg bg-card border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className={`h-4 w-4 ${data.priceRejection.detected ? 'text-orange-400' : 'text-muted-foreground'}`} />
                          <span className="text-sm font-medium">Price Rejection</span>
                        </div>
                        {data.priceRejection.detected ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Strength</span>
                              <span className="font-mono font-bold">{data.priceRejection.strength}%</span>
                            </div>
                            <Badge variant="outline" className={
                              data.priceRejection.type === 'bullish_rejection' ? 'border-green-500/30 text-green-400' :
                              'border-red-500/30 text-red-400'
                            }>
                              {data.priceRejection.type.replace('_', ' ')} @ {data.priceRejection.level}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No rejection detected</span>
                        )}
                      </div>

                      {/* Buy/Sell Pressure */}
                      <div className="p-3 rounded-lg bg-card border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowUpDown className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Pressure</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-red-400">Sell {data.pressure.sellingPressure}%</span>
                            <span className="text-green-400">Buy {data.pressure.buyingPressure}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-gradient-to-r from-destructive via-muted to-emerald-500 relative overflow-hidden">
                            <div 
                              className="absolute inset-y-0 left-0 bg-destructive rounded-l-full transition-all"
                              style={{ width: `${data.pressure.sellingPressure}%` }}
                            />
                            <div 
                              className="absolute inset-y-0 right-0 bg-emerald-500 rounded-r-full transition-all"
                              style={{ width: `${data.pressure.buyingPressure}%` }}
                            />
                          </div>
                          <Badge variant="outline" className={
                            data.pressure.trend === 'accumulation' ? 'border-green-500/30 text-green-400' :
                            data.pressure.trend === 'distribution' ? 'border-red-500/30 text-red-400' :
                            'border-muted text-muted-foreground'
                          }>
                            {data.pressure.trend} (Δ{data.pressure.delta > 0 ? '+' : ''}{data.pressure.delta})
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Reasons */}
                    {data.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {data.reasons.map((reason, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Last Updated */}
                    <div className="text-xs text-muted-foreground mt-3 text-right">
                      Updated: {data.lastUpdated.toLocaleTimeString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            
            <TabsContent value="correlation">
              <Card className="bg-background/50 border-border/50">
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base sm:text-lg">Correlation Matrix</h3>
                      <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Cached
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Pearson correlation from 1H returns. Higher = more similar movements.
                    </p>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-red-500/80" />
                      <span className="text-xs">Very High (≥85%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-orange-500/70" />
                      <span className="text-xs">High (75-84%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-yellow-500/60" />
                      <span className="text-xs">Moderate (60-74%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-blue-500/40" />
                      <span className="text-xs">Low (40-59%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-muted" />
                      <span className="text-xs">Very Low (&lt;40%)</span>
                    </div>
                  </div>
                  
                  {/* Matrix */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-left text-sm font-medium text-muted-foreground border-b border-border"></th>
                          {orderFlowData.map(d => (
                            <th key={d.symbol} className="p-2 text-center text-xs font-medium border-b border-border">
                              {d.symbol.replace('USDT', '')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orderFlowData.map((row, rowIdx) => (
                          <tr key={row.symbol}>
                            <td className="p-2 text-sm font-medium border-r border-border">
                              {row.symbol.replace('USDT', '')}
                            </td>
                            {orderFlowData.map((col, colIdx) => {
                              const correlation = getCorrelation(row.symbol, col.symbol);
                              const correlationPct = Math.round(correlation * 100);
                              const isDiagonal = rowIdx === colIdx;
                              
                              return (
                                <td 
                                  key={col.symbol} 
                                  className={`p-1 text-center ${isDiagonal ? 'bg-primary/20' : ''}`}
                                >
                                  <div 
                                    className={`rounded px-2 py-1.5 text-xs font-mono font-bold ${
                                      isDiagonal ? 'bg-primary/30 text-primary' : getCorrelationColor(correlation)
                                    }`}
                                    title={`${row.symbol} ↔ ${col.symbol}: ${correlationPct}% (${getCorrelationLabel(correlation)})`}
                                  >
                                    {correlationPct}%
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Risk Pairs Warning */}
                  {(() => {
                    const highRiskPairs: Array<{ pair: string; correlation: number }> = [];
                    for (let i = 0; i < orderFlowData.length; i++) {
                      for (let j = i + 1; j < orderFlowData.length; j++) {
                        const corr = getCorrelation(orderFlowData[i].symbol, orderFlowData[j].symbol);
                        if (corr >= 0.80) {
                          highRiskPairs.push({
                            pair: `${orderFlowData[i].symbol.replace('USDT', '')}/${orderFlowData[j].symbol.replace('USDT', '')}`,
                            correlation: corr
                          });
                        }
                      }
                    }
                    
                    if (highRiskPairs.length === 0) return null;
                    
                    return (
                      <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-orange-400" />
                          <span className="font-medium text-orange-400">High Correlation Risk</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          These pairs move together closely. Opening same-direction positions increases portfolio risk:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {highRiskPairs.map(({ pair, correlation }) => (
                            <Badge key={pair} className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                              {pair}: {Math.round(correlation * 100)}%
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
