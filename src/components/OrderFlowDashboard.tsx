import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Activity, TrendingUp, TrendingDown, Zap, AlertTriangle, Grid3X3, ArrowUpDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Store price data for correlation calculation
interface SymbolPriceData {
  symbol: string;
  closes: number[];
  lastUpdated: Date;
}

// Calculate Pearson correlation coefficient between two price series
const calculatePearsonCorrelation = (prices1: number[], prices2: number[]): number => {
  if (prices1.length !== prices2.length || prices1.length < 10) {
    return 0;
  }

  const n = prices1.length;
  
  // Calculate returns (percent changes) for more accurate correlation
  const returns1: number[] = [];
  const returns2: number[] = [];
  
  for (let i = 1; i < n; i++) {
    returns1.push((prices1[i] - prices1[i-1]) / prices1[i-1]);
    returns2.push((prices2[i] - prices2[i-1]) / prices2[i-1]);
  }

  const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

  let numerator = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;

  for (let i = 0; i < returns1.length; i++) {
    const diff1 = returns1[i] - mean1;
    const diff2 = returns2[i] - mean2;
    numerator += diff1 * diff2;
    sum1Sq += diff1 * diff1;
    sum2Sq += diff2 * diff2;
  }

  const denominator = Math.sqrt(sum1Sq * sum2Sq);
  if (denominator === 0) return 0;

  return numerator / denominator;
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
  directionSource: "strategy-analyzer" | "sma20"; // Track where direction came from
}

export const OrderFlowDashboard = () => {
  const [orderFlowData, setOrderFlowData] = useState<OrderFlowData[]>([]);
  const [priceData, setPriceData] = useState<Map<string, number[]>>(new Map());
  const [correlationMatrix, setCorrelationMatrix] = useState<Map<string, Map<string, number>>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Get correlation from live-calculated matrix, or calculate on-the-fly
  const getCorrelation = (symbol1: string, symbol2: string): number => {
    if (symbol1 === symbol2) return 1.0;
    
    // Check cached matrix first
    const cached = correlationMatrix.get(symbol1)?.get(symbol2) ?? 
                   correlationMatrix.get(symbol2)?.get(symbol1);
    if (cached !== undefined) return cached;
    
    // Calculate from price data if available
    const prices1 = priceData.get(symbol1);
    const prices2 = priceData.get(symbol2);
    if (prices1 && prices2) {
      return calculatePearsonCorrelation(prices1, prices2);
    }
    
    return 0; // No data available
  };

  const fetchOrderFlowData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return;
      }

      const { data: symbols } = await supabase
        .from('trading_symbols_config')
        .select('symbol')
        .eq('is_active', true);

      if (!symbols || symbols.length === 0) {
        toast({ title: "No active symbols", description: "Configure trading symbols first" });
        return;
      }

      // Fetch latest derived directions from signal_rejection_log
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: rejectionData } = await supabase
        .from('signal_rejection_log')
        .select('symbol, filters_status, checked_at')
        .gte('checked_at', tenMinutesAgo)
        .order('checked_at', { ascending: false });

      // Build map of latest derived direction per symbol
      const derivedDirections = new Map<string, "long" | "short">();
      rejectionData?.forEach((rejection) => {
        if (!derivedDirections.has(rejection.symbol)) {
          const filtersStatus = rejection.filters_status as any;
          const derivedDir = filtersStatus?.derivedDirection;
          if (derivedDir === 'long' || derivedDir === 'short') {
            derivedDirections.set(rejection.symbol, derivedDir);
          }
        }
      });

      // Fetch kline data for all symbols via backend function (avoids CORS)
      const symbolNames = symbols.map(({ symbol }) => symbol);
      const { data: klineResponse, error: klineError } = await supabase.functions.invoke('fetch-klines', {
        body: { symbols: symbolNames, interval: '1h', limit: 100 }
      });

      const klineResults: { symbol: string; klines: any[] }[] = 
        (!klineError && klineResponse?.success) ? klineResponse.data : 
        symbolNames.map(symbol => ({ symbol, klines: [] }));
      
      // Store price data for correlation calculation
      const newPriceData = new Map<string, number[]>();
      const results: OrderFlowData[] = [];
      
      for (const { symbol, klines } of klineResults) {
        if (!Array.isArray(klines) || klines.length < 30) continue;

        // Extract closes for correlation calculation (using last 50 candles)
        const closes = klines.slice(-50).map((k: any) => parseFloat(k[4]));
        newPriceData.set(symbol, closes);

        // Get direction from strategy-analyzer if available, fallback to SMA20
        let intendedDirection: "long" | "short";
        let directionSource: "strategy-analyzer" | "sma20" = "sma20";
        
        if (derivedDirections.has(symbol)) {
          intendedDirection = derivedDirections.get(symbol)!;
          directionSource = "strategy-analyzer";
        } else {
          // Fallback to SMA20
          const recentCloses = klines.map((k: any) => parseFloat(k[4]));
          const sma20 = recentCloses.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
          const currentPrice = recentCloses[recentCloses.length - 1];
          intendedDirection = currentPrice > sma20 ? "long" : "short";
        }
        
        const analysis = analyzeOrderFlowLocal(klines, intendedDirection);
        results.push({
          symbol,
          ...analysis,
          intendedDirection,
          directionSource,
          lastUpdated: new Date()
        });
      }

      // Calculate live correlation matrix
      const symbolList = Array.from(newPriceData.keys());
      const newCorrelationMatrix = new Map<string, Map<string, number>>();
      
      for (const symbol1 of symbolList) {
        const row = new Map<string, number>();
        for (const symbol2 of symbolList) {
          if (symbol1 === symbol2) {
            row.set(symbol2, 1.0);
          } else {
            const prices1 = newPriceData.get(symbol1)!;
            const prices2 = newPriceData.get(symbol2)!;
            const corr = calculatePearsonCorrelation(prices1, prices2);
            row.set(symbol2, corr);
          }
        }
        newCorrelationMatrix.set(symbol1, row);
      }

      setPriceData(newPriceData);
      setCorrelationMatrix(newCorrelationMatrix);
      setOrderFlowData(results);
    } catch (error) {
      console.error('Error fetching order flow:', error);
      toast({ title: "Error", description: "Failed to fetch order flow data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Local order flow analysis (matching edge function logic)
  const analyzeOrderFlowLocal = (klines: any[], intendedDirection: "long" | "short") => {
    // Volume spike detection
    const volumes = klines.map(k => parseFloat(k[5])).filter(v => Number.isFinite(v) && v > 0);
    const historicalVolumes = volumes.slice(-21, -1);
    const avgVolume = historicalVolumes.reduce((sum, v) => sum + v, 0) / historicalVolumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const magnitude = avgVolume > 0 ? currentVolume / avgVolume : 1;
    
    let volumeSignificance: "low" | "medium" | "high" | "extreme" = "low";
    let volumeDetected = false;
    
    if (magnitude >= 4.0) { volumeSignificance = "extreme"; volumeDetected = true; }
    else if (magnitude >= 2.5) { volumeSignificance = "high"; volumeDetected = true; }
    else if (magnitude >= 1.8) { volumeSignificance = "medium"; volumeDetected = true; }
    else if (magnitude >= 1.5) { volumeSignificance = "low"; volumeDetected = true; }
    
    const currentCandle = klines[klines.length - 1];
    const open = parseFloat(currentCandle[1]);
    const high = parseFloat(currentCandle[2]);
    const low = parseFloat(currentCandle[3]);
    const close = parseFloat(currentCandle[4]);
    const priceChange = close - open;
    
    let volumeType: "bullish" | "bearish" | "neutral" = "neutral";
    if (priceChange > 0) volumeType = "bullish";
    else if (priceChange < 0) volumeType = "bearish";

    // Price rejection detection
    const body = Math.abs(close - open);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const totalRange = high - low;
    
    const upperWickRatio = body > 0 ? upperWick / body : upperWick / (totalRange * 0.1);
    const lowerWickRatio = body > 0 ? lowerWick / body : lowerWick / (totalRange * 0.1);
    
    let rejectionDetected = false;
    let rejectionType: "bullish_rejection" | "bearish_rejection" | "none" = "none";
    let rejectionStrength = 0;
    let rejectionLevel: "support" | "resistance" | "none" = "none";
    
    if (lowerWickRatio >= 2 && lowerWick > upperWick * 1.5) {
      rejectionDetected = true;
      rejectionType = "bullish_rejection";
      rejectionLevel = "support";
      rejectionStrength = Math.min(100, Math.round((lowerWick / totalRange) * 100 * 1.5));
    } else if (upperWickRatio >= 2 && upperWick > lowerWick * 1.5) {
      rejectionDetected = true;
      rejectionType = "bearish_rejection";
      rejectionLevel = "resistance";
      rejectionStrength = Math.min(100, Math.round((upperWick / totalRange) * 100 * 1.5));
    }

    // Buying/selling pressure
    const lookback = Math.min(10, klines.length);
    const recentCandles = klines.slice(-lookback);
    let buyingPressure = 0;
    let sellingPressure = 0;
    
    for (const candle of recentCandles) {
      const cOpen = parseFloat(candle[1]);
      const cHigh = parseFloat(candle[2]);
      const cLow = parseFloat(candle[3]);
      const cClose = parseFloat(candle[4]);
      const cVolume = parseFloat(candle[5]);
      const cRange = cHigh - cLow;
      if (cRange === 0) continue;
      const closePosition = (cClose - cLow) / cRange;
      buyingPressure += cVolume * closePosition;
      sellingPressure += cVolume * (1 - closePosition);
    }
    
    const totalPressure = buyingPressure + sellingPressure;
    const normalizedBuying = totalPressure > 0 ? (buyingPressure / totalPressure) * 100 : 50;
    const normalizedSelling = totalPressure > 0 ? (sellingPressure / totalPressure) * 100 : 50;
    const delta = normalizedBuying - normalizedSelling;
    
    let pressureTrend: "accumulation" | "distribution" | "neutral" = "neutral";
    if (delta > 15) pressureTrend = "accumulation";
    else if (delta < -15) pressureTrend = "distribution";

    // Calculate score - MUST respect intendedDirection like backend orderflow.ts
    const isLong = intendedDirection === "long";
    let score = 50;
    let confidence = 0;
    const reasons: string[] = [];
    
    // Volume spike contribution - aligned with direction = positive
    if (volumeDetected) {
      const volumePoints = volumeSignificance === "extreme" ? 15 :
                          volumeSignificance === "high" ? 10 :
                          volumeSignificance === "medium" ? 6 : 3;
      
      if (isLong && volumeType === "bullish") {
        score += volumePoints; confidence += 15;
      } else if (!isLong && volumeType === "bearish") {
        score += volumePoints; confidence += 15;
      } else if (volumeType !== "neutral") {
        // Against our direction
        score -= volumePoints * 0.7; confidence += 10;
      }
      reasons.push(`Volume spike ${magnitude.toFixed(1)}x (${volumeSignificance})`);
    }
    
    // Price rejection contribution - aligned with direction = positive
    if (rejectionDetected) {
      const rejectionPoints = Math.min(20, rejectionStrength * 0.3);
      
      if (isLong && rejectionType === "bullish_rejection") {
        score += rejectionPoints; confidence += 20;
      } else if (!isLong && rejectionType === "bearish_rejection") {
        score += rejectionPoints; confidence += 20;
      } else if (rejectionType !== "none") {
        // Against our direction
        score -= rejectionPoints * 0.8; confidence += 15;
      }
      reasons.push(`${rejectionType.replace('_', ' ')} at ${rejectionLevel} (strength: ${rejectionStrength})`);
    }
    
    // Pressure contribution - aligned with direction = positive
    const pressurePoints = Math.abs(delta) * 0.15;
    if (isLong && delta > 0) {
      score += pressurePoints; confidence += Math.min(15, Math.abs(delta) * 0.3);
    } else if (!isLong && delta < 0) {
      score += pressurePoints; confidence += Math.min(15, Math.abs(delta) * 0.3);
    } else if (Math.abs(delta) > 10) {
      // Against our direction
      score -= pressurePoints * 0.5;
    }
    if (Math.abs(delta) > 20) {
      reasons.push(`${pressureTrend} detected (delta: ${delta > 0 ? '+' : ''}${delta.toFixed(0)})`);
    }
    
    score = Math.max(0, Math.min(100, Math.round(score)));
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));
    
    let signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
    if (score >= 75) signal = "strong_buy";
    else if (score >= 60) signal = "buy";
    else if (score >= 40) signal = "neutral";
    else if (score >= 25) signal = "sell";
    else signal = "strong_sell";

    return {
      volumeSpike: { detected: volumeDetected, magnitude: Math.round(magnitude * 100) / 100, type: volumeType, significance: volumeSignificance },
      priceRejection: { detected: rejectionDetected, type: rejectionType, wickRatio: Math.max(upperWickRatio, lowerWickRatio), strength: rejectionStrength, level: rejectionLevel },
      pressure: { buyingPressure: Math.round(normalizedBuying), sellingPressure: Math.round(normalizedSelling), delta: Math.round(delta * 10) / 10, trend: pressureTrend },
      score,
      signal,
      confidence,
      reasons
    };
  };

  useEffect(() => {
    fetchOrderFlowData();
    const interval = setInterval(fetchOrderFlowData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

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

  const getPressureGradient = (buying: number) => {
    return `linear-gradient(to right, hsl(var(--destructive)) ${100 - buying}%, hsl(142 76% 36%) ${100 - buying}%)`;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Order Flow Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">Volume spikes, price rejections & institutional activity</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchOrderFlowData}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {orderFlowData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {isLoading ? 'Analyzing order flow...' : 'No data available. Click Refresh to load.'}
          </div>
        ) : (
          <Tabs defaultValue="orderflow" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="orderflow">Order Flow</TabsTrigger>
              <TabsTrigger value="correlation">
                <Grid3X3 className="h-4 w-4 mr-2" />
                Correlation Matrix
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="orderflow" className="space-y-4">
              {orderFlowData.map((data) => (
                <Card key={data.symbol} className="bg-background/50 border-border/50">
                  <CardContent className="p-4">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
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
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>
                            {data.score}/100
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {data.confidence}% confidence
                          </div>
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
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">Symbol Correlation Matrix</h3>
                      <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Live (100 candles)
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Real-time Pearson correlation from 1H kline returns. Higher = more similar price movements.
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
