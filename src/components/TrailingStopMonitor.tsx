import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Shield } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";

export const TrailingStopMonitor = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [settings, setSettings] = useState({ enabled: true, activationPercent: 1.0, distanceMultiplier: 1.5 });
  const { prices, priceVersion } = useRealtimePricesContext();

  useEffect(() => {
    // Fetch user's trailing stop settings
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('risk_parameters')
        .select('trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          enabled: data.trailing_stop_enabled ?? true,
          activationPercent: data.trailing_stop_activation_percent ?? 1.0,
          distanceMultiplier: data.trailing_stop_distance_multiplier ?? 1.5,
        });
      }
    };

    fetchSettings();
    
    // Fetch active positions
    const fetchPositions = async () => {
      const { data } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'active');

      if (data) {
        setPositions(data);
      }
    };

    fetchPositions();

    // Subscribe to position updates to refresh the list
    const channel = supabase
      .channel('trailing-positions-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: 'status=eq.active'
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate positions with active trailing stops using real-time prices
  const activeTrailingPositions = useMemo(() => {
    if (!settings.enabled) return [];
    
    return positions.filter(p => {
      const currentPrice = prices.get(p.symbol) || p.entry_price;
      const pnlPercent = p.side === 'BUY'
        ? ((currentPrice - p.entry_price) / p.entry_price) * 100
        : ((p.entry_price - currentPrice) / p.entry_price) * 100;
      return pnlPercent > settings.activationPercent;
    }).map(p => {
      const currentPrice = prices.get(p.symbol) || p.entry_price;
      const pnlPercent = p.side === 'BUY'
        ? ((currentPrice - p.entry_price) / p.entry_price) * 100
        : ((p.entry_price - currentPrice) / p.entry_price) * 100;
      return { ...p, currentPrice, pnlPercent };
    });
  }, [positions, prices, priceVersion, settings.enabled, settings.activationPercent]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Trailing Stop Loss Monitor
          {activeTrailingPositions.length > 0 && (
            <Badge variant="default" className="ml-auto">
              {activeTrailingPositions.length} Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTrailingPositions.length > 0 && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                {activeTrailingPositions.length} position{activeTrailingPositions.length > 1 ? 's are' : ' is'} profitable and being protected by trailing stops
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {activeTrailingPositions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No positions with active trailing stops</p>
              <p className="text-xs mt-1">
                Trailing stops activate when positions are +{settings.activationPercent}% profitable
              </p>
              {!settings.enabled && (
                <p className="text-xs mt-2 text-destructive">
                  ⚠️ Trailing stops are currently disabled in Settings
                </p>
              )}
            </div>
          ) : (
            activeTrailingPositions.map((position) => (
              <div
                key={position.id}
                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">
                        {position.symbol}
                      </span>
                      <Badge
                        variant={position.side === 'BUY' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {position.side}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-primary">
                        +{position.pnlPercent.toFixed(2)}%
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-xs">Entry:</span>
                      <span>${position.entry_price.toFixed(2)}</span>
                      <span className="text-xs">Current:</span>
                      <span className="text-primary font-medium">${position.currentPrice.toFixed(2)}</span>
                      <span className="text-xs">Stop:</span>
                      <span className="text-destructive">${position.stop_loss?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-medium mb-2 text-foreground">
            Current Settings:
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Status: {settings.enabled ? '✅ Enabled' : '❌ Disabled'}</li>
            <li>• Activates at: +{settings.activationPercent}% profit</li>
            <li>• Trailing distance: {settings.distanceMultiplier}x ATR (typically {(settings.distanceMultiplier * 2).toFixed(1)}-{(settings.distanceMultiplier * 3).toFixed(1)}%)</li>
            <li>• Only moves in favorable direction</li>
            <li>• Automatically protects gains</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
