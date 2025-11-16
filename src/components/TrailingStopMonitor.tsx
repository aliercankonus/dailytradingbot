import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Shield, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TrailingStopEvent {
  symbol: string;
  side: string;
  oldStopLoss: number;
  newStopLoss: number;
  currentPrice: number;
  pnlPercent: number;
  timestamp: string;
}

export const TrailingStopMonitor = () => {
  const [trailingEvents, setTrailingEvents] = useState<TrailingStopEvent[]>([]);
  const [activeTrails, setActiveTrails] = useState<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    // Monitor for positions with positive P&L (potential trailing stops)
    const checkTrailingStops = async () => {
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'active');

      if (positions) {
        const profitablePositions = positions.filter(p => 
          (p.unrealized_pnl_percent || 0) > 1
        );
        setActiveTrails(profitablePositions.length);
      }
    };

    checkTrailingStops();
    const interval = setInterval(checkTrailingStops, 5000);

    // Subscribe to position updates to detect trailing stop changes
    const channel = supabase
      .channel('trailing-stop-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'positions',
          filter: 'status=eq.active'
        },
        (payload) => {
          const oldPos = payload.old as any;
          const newPos = payload.new as any;
          
          // Detect if stop loss was updated (trailing stop triggered)
          if (oldPos.stop_loss !== newPos.stop_loss && (newPos.unrealized_pnl_percent || 0) > 0) {
            const event: TrailingStopEvent = {
              symbol: newPos.symbol,
              side: newPos.side,
              oldStopLoss: oldPos.stop_loss,
              newStopLoss: newPos.stop_loss,
              currentPrice: newPos.current_price,
              pnlPercent: newPos.unrealized_pnl_percent,
              timestamp: new Date().toISOString(),
            };
            
            setTrailingEvents(prev => [event, ...prev].slice(0, 10)); // Keep last 10 events

            // Show toast notification
            const stopImprovement = newPos.side === 'BUY'
              ? ((newPos.stop_loss - oldPos.stop_loss) / oldPos.stop_loss * 100).toFixed(2)
              : ((oldPos.stop_loss - newPos.stop_loss) / oldPos.stop_loss * 100).toFixed(2);

            toast({
              title: "🛡️ Trailing Stop Activated",
              description: `${newPos.symbol} ${newPos.side}: Stop loss improved by ${stopImprovement}% to $${newPos.stop_loss.toFixed(2)} (P&L: +${newPos.unrealized_pnl_percent.toFixed(2)}%)`,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Trailing Stop Loss Monitor
          {activeTrails > 0 && (
            <Badge variant="default" className="ml-auto">
              {activeTrails} Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTrails > 0 && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                {activeTrails} position{activeTrails > 1 ? 's are' : ' is'} profitable and being protected by trailing stops
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {trailingEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No trailing stop adjustments yet</p>
              <p className="text-xs mt-1">
                Trailing stops activate when positions are +1% profitable
              </p>
            </div>
          ) : (
            trailingEvents.map((event, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">
                        {event.symbol}
                      </span>
                      <Badge
                        variant={event.side === 'BUY' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {event.side}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        +{event.pnlPercent.toFixed(2)}%
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="line-through">
                        ${event.oldStopLoss.toFixed(2)}
                      </span>
                      {event.side === 'BUY' ? (
                        <ArrowUpRight className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-primary" />
                      )}
                      <span className="text-primary font-medium">
                        ${event.newStopLoss.toFixed(2)}
                      </span>
                      <span className="text-xs">
                        (${event.currentPrice.toFixed(2)})
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-medium mb-2 text-foreground">
            How Trailing Stop Loss Works:
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Activates when position is +1% profitable</li>
            <li>• Follows price at 1.5x ATR distance (typically 2-4%)</li>
            <li>• Only moves in favorable direction (locks in profits)</li>
            <li>• Automatically protects gains as price moves up</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
