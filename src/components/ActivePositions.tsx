import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePositions } from '@/hooks/usePositions';
import { TrendingUp, TrendingDown } from 'lucide-react';

export const ActivePositions = () => {
  const { positions, loading } = usePositions();

  if (loading) {
    return <Card className="p-6"><p className="text-muted-foreground">Loading positions...</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Active Positions</h2>
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
                  <h3 className="font-bold text-lg">{position.symbol}</h3>
                  <Badge variant={position.side === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                    {position.side}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${(position.unrealized_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ${(position.unrealized_pnl || 0).toFixed(2)}
                </div>
                <div className={`text-sm ${(position.unrealized_pnl_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(position.unrealized_pnl_percent || 0).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Entry</div>
                <div className="font-medium">${position.entry_price.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Current</div>
                <div className="font-medium">${(position.current_price || position.entry_price).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stop Loss</div>
                <div className="font-medium text-red-500">${position.stop_loss.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Take Profit</div>
                <div className="font-medium text-green-500">${position.take_profit.toFixed(2)}</div>
              </div>
            </div>
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