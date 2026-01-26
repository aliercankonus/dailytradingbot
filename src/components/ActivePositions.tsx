import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePositions } from '@/hooks/usePositions';
import { useRealtimePricesContext } from '@/contexts/RealtimePricesContext';
import { useRealtimePositionSync } from '@/hooks/useRealtimePositionSync';
import { TrendingUp, TrendingDown, X, Loader2, Shield, RotateCw, Filter, Lock, ArrowUp, Layers, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';
import { formatPrice, formatPercent, formatQuantity } from '@/lib/utils';
import { TradeForensicsPanel } from './TradeForensicsPanel';

export const ActivePositions = () => {
  const { positions, loading, refetch } = usePositions();
  const { toast } = useToast();
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  
  // Enable real-time position updates
  useRealtimePositionSync();
  
  // Get live prices from shared context
  const { prices, priceVersion, getPrice } = useRealtimePricesContext();

  // Extract unique strategies from positions
  const availableStrategies = useMemo(() => {
    const strategies = new Set(positions.map(p => p.strategy_name).filter(Boolean));
    return Array.from(strategies).sort();
  }, [positions]);

  // Filter positions by selected strategy
  const filteredPositions = useMemo(() => {
    if (selectedStrategy === 'all') return positions;
    return positions.filter(p => p.strategy_name === selectedStrategy);
  }, [positions, selectedStrategy]);

  // Calculate live P&L for filtered positions - memoize price map separately
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredPositions.forEach(pos => {
      const livePrice = getPrice(pos.symbol);
      map.set(pos.symbol, livePrice ? parseFloat(livePrice.price) : pos.current_price || pos.entry_price);
    });
    return map;
  }, [filteredPositions, getPrice, priceVersion]);

  const positionsWithLivePnL = useMemo(() => {
    return filteredPositions.map(position => {
      const currentPrice = priceMap.get(position.symbol) || position.entry_price;
      
      // Calculate live P&L
      const pnl = position.side === 'BUY'
        ? (currentPrice - position.entry_price) * position.quantity
        : (position.entry_price - currentPrice) * position.quantity;
      
      const pnlPercent = position.side === 'BUY'
        ? ((currentPrice - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - currentPrice) / position.entry_price) * 100;

      // Detect if stop loss has been adjusted by trailing/break-even system
      // Check if at break-even (stop is at or very close to entry price - within 0.2%)
      const breakEvenTolerance = position.entry_price * 0.002;
      const atBreakEven = Math.abs(position.stop_loss - position.entry_price) <= breakEvenTolerance;
      
      // For BUY: SL adjusted means stop_loss > entry_price (trailing above entry)
      // For SELL: SL adjusted means stop_loss < entry_price (trailing below entry)
      const slAdjustedAboveBreakEven = position.side === 'BUY'
        ? position.stop_loss > position.entry_price + breakEvenTolerance
        : position.stop_loss < position.entry_price - breakEvenTolerance;

      // Position qualifies for trailing protection (profitable enough)
      const isTrailingEligible = pnlPercent > 1;

      // Detect pullback vs actual loss
      // Pullback: position was profitable before (peak > 0) but currently in loss
      // Actual loss: position was never significantly profitable (peak <= 0.1%)
      const peakPnl = position.peak_pnl_percent || 0;
      const isInPullback = pnlPercent < 0 && peakPnl > 0.1;
      const isActualLoss = pnlPercent < 0 && peakPnl <= 0.1;

      return {
        ...position,
        live_current_price: currentPrice,
        live_unrealized_pnl: pnl,
        live_unrealized_pnl_percent: pnlPercent,
        stop_adjusted: slAdjustedAboveBreakEven,
        at_break_even: atBreakEven,
        trailing_eligible: isTrailingEligible,
        is_in_pullback: isInPullback,
        is_actual_loss: isActualLoss,
        peak_pnl: peakPnl
      };
    });
  }, [filteredPositions, priceMap]);

  // Group positions by strategy for display
  const positionsByStrategy = useMemo(() => {
    const groups: Record<string, typeof positionsWithLivePnL> = {};
    positionsWithLivePnL.forEach(position => {
      const strategy = position.strategy_name || 'Unknown Strategy';
      if (!groups[strategy]) {
        groups[strategy] = [];
      }
      groups[strategy].push(position);
    });
    return groups;
  }, [positionsWithLivePnL]);

  const closePosition = async (positionId: string, symbol: string) => {
    try {
      setClosingPosition(positionId);
      const { error } = await supabase.functions.invoke('close-trade', {
        body: { positionId, manualClose: true }
      });

      if (error) throw error;

      // Immediately refresh positions
      await refetch();

      toast({
        title: "Position Closed",
        description: `Successfully closed ${symbol} position`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to close position',
        variant: "destructive",
      });
    } finally {
      setClosingPosition(null);
    }
  };

  if (loading) {
    return <Card className="p-6"><p className="text-muted-foreground">Loading positions...</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Active Positions</h2>
          {loading && (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strategies</SelectItem>
                {availableStrategies.map(strategy => (
                  <SelectItem key={strategy} value={strategy}>
                    {strategy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline">{positionsWithLivePnL.length} Open</Badge>
        </div>
      </div>

      {selectedStrategy === 'all' && Object.keys(positionsByStrategy).length > 1 ? (
        // Grouped view when showing all strategies and there are multiple strategies
        <div className="space-y-6">
          {Object.entries(positionsByStrategy).map(([strategy, strategyPositions]) => (
            <div key={strategy} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{strategy}</h3>
                <Badge variant="secondary" className="text-xs">
                  {strategyPositions.length} position{strategyPositions.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="grid gap-4">
                {strategyPositions.map((position) => (
                  <Card key={position.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {position.side === 'BUY' ? (
                  <TrendingUp className="h-6 w-6 text-green-500" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-500" />
                )}
                <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{position.symbol}</h3>
                      {position.is_hedge && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                          <Layers className="h-3 w-3" />
                          Hedge
                        </Badge>
                      )}
                      {position.opened_by_rebalancer && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <RotateCw className="h-3 w-3" />
                       Auto-Rebalanced
                        </Badge>
                      )}
                      {position.stop_adjusted ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
                          <ArrowUp className="h-3 w-3" />
                          SL Adjusted
                        </Badge>
                      ) : position.at_break_even ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-green-500/10 text-green-500 border-green-500/20">
                          <Lock className="h-3 w-3" />
                          Break-Even
                        </Badge>
                      ) : null}
                      {position.trailing_eligible && !position.at_break_even && !position.stop_adjusted && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                          <Shield className="h-3 w-3" />
                          Trailing Eligible
                        </Badge>
                      )}
                      {position.is_in_pullback && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
                          <RefreshCw className="h-3 w-3" />
                          Pullback ({position.peak_pnl?.toFixed(2)}% peak)
                        </Badge>
                      )}
                      {position.is_actual_loss && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-orange-500/10 text-orange-500 border-orange-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          Loss
                        </Badge>
                      )}
                    </div>
                  <Badge className={`text-xs ${position.side === 'BUY' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                    {position.side}
                  </Badge>
                  {position.strategy_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Strategy: {position.strategy_name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Opened: {new Date(position.opened_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`text-xl font-bold ${position.live_unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatPrice(position.live_unrealized_pnl, 2, '$')}
                  </div>
                  <div className={`text-sm ${position.live_unrealized_pnl_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatPercent(position.live_unrealized_pnl_percent)}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => closePosition(position.id, position.symbol)}
                  disabled={closingPosition === position.id}
                >
                  {closingPosition === position.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Entry</div>
                <div className="font-medium">{formatPrice(position.entry_price, 4, '$')}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Current</div>
                <div className="font-medium">{formatPrice(position.live_current_price, 4, '$')}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Quantity</div>
                <div className="font-medium">{formatQuantity(position.quantity)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stop Loss</div>
                <div className="font-medium text-red-500">{formatPrice(position.stop_loss, 4, '$')}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Take Profit</div>
                <div className="font-medium text-green-500">{formatPrice(position.take_profit, 4, '$')}</div>
              </div>
            </div>

            {(position.trend || position.confidence_score || position.trend_consistency) && (
              <div className="grid grid-cols-3 gap-2 text-sm mt-3 pt-3 border-t">
                {position.trend && (
                  <div>
                    <div className="text-xs text-muted-foreground">Trend</div>
                    <Badge 
                      variant={
                        position.trend === 'bullish' ? 'default' : 
                        position.trend === 'bearish' ? 'destructive' : 
                        'outline'
                      } 
                      className="text-xs"
                    >
                      {position.trend}
                    </Badge>
                  </div>
                )}
                {position.confidence_score && (
                  <div>
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <div className="font-medium">{position.confidence_score}%</div>
                  </div>
                )}
                {position.trend_consistency !== undefined && position.trend_consistency !== null && (
                  <div>
                    <div className="text-xs text-muted-foreground">Trend Consistency</div>
                    <div className="font-medium">{formatPercent(position.trend_consistency, 0)}</div>
                  </div>
                )}
              </div>
            )}
            
            {/* Trade Forensics Panel */}
            <div className="mt-3 pt-3 border-t">
              <TradeForensicsPanel 
                position={{
                  ...position,
                  live_unrealized_pnl_percent: position.live_unrealized_pnl_percent,
                  peak_pnl_percent: position.peak_pnl,
                  entry_snapshot: position.entry_snapshot,
                }} 
              />
            </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat view when filtering by specific strategy or only one strategy exists
        <div className="grid gap-4">
          {positionsWithLivePnL.map((position) => (
            <Card key={position.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {position.side === 'BUY' ? (
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{position.symbol}</h3>
                      {position.is_hedge && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                          <Layers className="h-3 w-3" />
                          Hedge
                        </Badge>
                      )}
                      {position.opened_by_rebalancer && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <RotateCw className="h-3 w-3" />
                       Auto-Rebalanced
                        </Badge>
                      )}
                      {position.stop_adjusted ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
                          <ArrowUp className="h-3 w-3" />
                          SL Adjusted
                        </Badge>
                      ) : position.at_break_even ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-green-500/10 text-green-500 border-green-500/20">
                          <Lock className="h-3 w-3" />
                          Break-Even
                        </Badge>
                      ) : null}
                      {position.trailing_eligible && !position.at_break_even && !position.stop_adjusted && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                          <Shield className="h-3 w-3" />
                          Trailing Eligible
                        </Badge>
                      )}
                      {position.is_in_pullback && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
                          <RefreshCw className="h-3 w-3" />
                          Pullback ({position.peak_pnl?.toFixed(2)}% peak)
                        </Badge>
                      )}
                      {position.is_actual_loss && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-orange-500/10 text-orange-500 border-orange-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          Loss
                        </Badge>
                      )}
                    </div>
                    <Badge className={`text-xs ${position.side === 'BUY' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                      {position.side}
                    </Badge>
                    {position.strategy_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Strategy: {position.strategy_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Opened: {new Date(position.opened_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-xl font-bold ${position.live_unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPrice(position.live_unrealized_pnl, 2, '$')}
                    </div>
                    <div className={`text-sm ${position.live_unrealized_pnl_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPercent(position.live_unrealized_pnl_percent)}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => closePosition(position.id, position.symbol)}
                    disabled={closingPosition === position.id}
                  >
                    {closingPosition === position.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Entry</div>
                  <div className="font-medium">{formatPrice(position.entry_price, 4, '$')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current</div>
                  <div className="font-medium">{formatPrice(position.live_current_price, 4, '$')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="font-medium">{formatQuantity(position.quantity)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Stop Loss</div>
                  <div className="font-medium text-red-500">{formatPrice(position.stop_loss, 4, '$')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Take Profit</div>
                  <div className="font-medium text-green-500">{formatPrice(position.take_profit, 4, '$')}</div>
                </div>
              </div>

              {(position.trend || position.confidence_score || position.trend_consistency) && (
                <div className="grid grid-cols-3 gap-2 text-sm mt-3 pt-3 border-t">
                  {position.trend && (
                    <div>
                      <div className="text-xs text-muted-foreground">Trend</div>
                      <Badge 
                        variant={
                          position.trend === 'bullish' ? 'default' : 
                          position.trend === 'bearish' ? 'destructive' : 
                          'outline'
                        } 
                        className="text-xs"
                      >
                        {position.trend}
                      </Badge>
                    </div>
                  )}
                  {position.confidence_score && (
                    <div>
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <div className="font-medium">{position.confidence_score}%</div>
                    </div>
                  )}
                  {position.trend_consistency !== undefined && position.trend_consistency !== null && (
                    <div>
                      <div className="text-xs text-muted-foreground">Trend Consistency</div>
                      <div className="font-medium">{formatPercent(position.trend_consistency, 0)}</div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Trade Forensics Panel */}
              <div className="mt-3 pt-3 border-t">
                <TradeForensicsPanel 
                  position={{
                    ...position,
                    live_unrealized_pnl_percent: position.live_unrealized_pnl_percent,
                    peak_pnl_percent: position.peak_pnl,
                    entry_snapshot: position.entry_snapshot,
                  }} 
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {positionsWithLivePnL.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {selectedStrategy === 'all' 
              ? 'No active positions' 
              : `No active positions for ${selectedStrategy}`}
          </p>
        </Card>
      )}
    </div>
  );
};