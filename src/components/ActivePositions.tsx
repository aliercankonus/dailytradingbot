import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePositions } from '@/hooks/usePositions';
import { TrendingUp, TrendingDown, X, Loader2, Shield, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export const ActivePositions = () => {
  const { positions, loading, refetch } = usePositions();
  const { toast } = useToast();
  const [closingPosition, setClosingPosition] = useState<string | null>(null);

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
        <Badge variant="outline">{positions.length} Open</Badge>
      </div>

      <div className="grid gap-4">
        {positions.map((position) => (
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
                    {(position.unrealized_pnl_percent || 0) > 1 && (
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
                  <div className={`text-xl font-bold ${(position.unrealized_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${(position.unrealized_pnl || 0).toFixed(2)}
                  </div>
                  <div className={`text-sm ${(position.unrealized_pnl_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(position.unrealized_pnl_percent || 0).toFixed(2)}%
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

            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Entry</div>
                <div className="font-medium">${position.entry_price.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Current</div>
                <div className="font-medium">${(position.current_price || position.entry_price).toFixed(4)}</div>
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

        {positions.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No active positions</p>
          </Card>
        )}
      </div>
    </div>
  );
};