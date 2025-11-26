import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePositions } from '@/hooks/usePositions';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useRealtimePositionSync } from '@/hooks/useRealtimePositionSync';
import { TrendingUp, TrendingDown, X, Loader2, Shield, RotateCw, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';

export const ActivePositions = () => {
  const { positions, loading, refetch } = usePositions();
  const { toast } = useToast();
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  
  // Enable real-time position updates
  useRealtimePositionSync();
  
  // Get live prices for all active position symbols
  const symbols = useMemo(() => positions.map(p => p.symbol), [positions]);
  const { prices, priceVersion, getPrice } = useRealtimePrices(symbols);

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

      return {
        ...position,
        live_current_price: currentPrice,
        live_unrealized_pnl: pnl,
        live_unrealized_pnl_percent: pnlPercent
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
                    {position.opened_by_rebalancer && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                        <RotateCw className="h-3 w-3" />
                     Auto-Rebalanced
                      </Badge>
                    )}
                    {(position.live_unrealized_pnl_percent || 0) > 1 && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                        <Shield className="h-3 w-3" />
                        Trailing
                      </Badge>
                    )}
                  </div>
                  <Badge variant={position.side === 'BUY' ? 'default' : 'destructive'} className="text-xs">
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
                    ${position.live_unrealized_pnl.toFixed(2)}
                  </div>
                  <div className={`text-sm ${position.live_unrealized_pnl_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {position.live_unrealized_pnl_percent.toFixed(2)}%
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
                <div className="font-medium">${position.entry_price.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Current</div>
                <div className="font-medium">${position.live_current_price.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Quantity</div>
                <div className="font-medium">{position.quantity.toFixed(6)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stop Loss</div>
                <div className="font-medium text-red-500">${position.stop_loss.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Take Profit</div>
                <div className="font-medium text-green-500">${position.take_profit.toFixed(4)}</div>
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
                    <div className="font-medium">{position.trend_consistency.toFixed(0)}%</div>
                  </div>
                )}
              </div>
            )}
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
                      {position.opened_by_rebalancer && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <RotateCw className="h-3 w-3" />
                       Auto-Rebalanced
                        </Badge>
                      )}
                      {(position.live_unrealized_pnl_percent || 0) > 1 && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                          <Shield className="h-3 w-3" />
                          Trailing
                        </Badge>
                      )}
                    </div>
                    <Badge variant={position.side === 'BUY' ? 'default' : 'destructive'} className="text-xs">
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
                      ${position.live_unrealized_pnl.toFixed(2)}
                    </div>
                    <div className={`text-sm ${position.live_unrealized_pnl_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {position.live_unrealized_pnl_percent.toFixed(2)}%
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
                  <div className="font-medium">${position.entry_price.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current</div>
                  <div className="font-medium">${position.live_current_price.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="font-medium">{position.quantity.toFixed(6)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Stop Loss</div>
                  <div className="font-medium text-red-500">${position.stop_loss.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Take Profit</div>
                  <div className="font-medium text-green-500">${position.take_profit.toFixed(4)}</div>
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
                      <div className="font-medium">{position.trend_consistency.toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              )}
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