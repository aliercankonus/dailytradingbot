import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Shield } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { formatPrice, formatPercent } from "@/lib/utils";

export const TrailingStopMonitor = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    enabled: true,
    activationPercent: 1.0,
    distanceMultiplier: 1.5,
    profitLockPercent: 50,
  });
  const { getPrice, priceVersion } = useRealtimePricesContext();

  // ----------- HELPERS -----------
  const resolveCurrentPrice = (p: any) => {
    const live = getPrice ? getPrice(p.symbol) : undefined;
    if (live?.price != null) {
      const val = Number(live.price);
      if (!isNaN(val)) return val;
    }
    if (typeof p.current_price === "number") return p.current_price;
    return p.entry_price;
  };

  const calculatePnlPercent = (side: string, entry: number, current: number) => {
    return side === "BUY" ? ((current - entry) / entry) * 100 : ((entry - current) / entry) * 100;
  };

  const calculateTrailingStop = (position: any, currentPrice: number) => {
    const { side, entry_price } = position;
    const trailingPercent = settings.distanceMultiplier;
    const trailingDistanceAbs = currentPrice * (trailingPercent / 100);
    if (side === "BUY") {
      const profitAbs = currentPrice - entry_price;
      return entry_price + profitAbs - trailingDistanceAbs;
    } else {
      const profitAbs = entry_price - currentPrice;
      return entry_price - profitAbs + trailingDistanceAbs;
    }
  };

  // Calculate profit lock using PERSISTED peak_pnl_percent from database (ratcheting - never decreases)
  const calculateProfitLock = (position: any, currentPnlPercent: number) => {
    const { side, entry_price, peak_pnl_percent } = position;
    const profitLockPercent = settings.profitLockPercent;
    
    // Use persisted peak P&L from database (set by monitor-positions)
    // Fallback to current P&L if peak not yet persisted
    const peakPnlPercent = Math.max(peak_pnl_percent || 0, currentPnlPercent);
    
    // Calculate locked profit based on peak P&L
    const profitAbsolute = entry_price * (peakPnlPercent / 100);
    const lockedProfitAbsolute = profitAbsolute * (profitLockPercent / 100);
    const lockedProfitPercent = peakPnlPercent * (profitLockPercent / 100);
    const lockedStopPrice = side === "BUY" ? entry_price + lockedProfitAbsolute : entry_price - lockedProfitAbsolute;
    
    return {
      lockedProfitPercent,
      lockedProfitAbsolute,
      lockedStopPrice,
      peakPnlPercent,
    };
  };

  // ----------- INITIAL FETCH -----------
  useEffect(() => {
    const fetchSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("risk_parameters")
        .select(
          "trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, trailing_stop_profit_lock_percent",
        )
        .eq("user_id", user.id)
        .single();
      if (data) {
        setSettings({
          enabled: data.trailing_stop_enabled ?? true,
          activationPercent: data.trailing_stop_activation_percent ?? 1.0,
          distanceMultiplier: data.trailing_stop_distance_multiplier ?? 1.5,
          profitLockPercent: data.trailing_stop_profit_lock_percent ?? 50,
        });
      }
    };

    const fetchPositions = async () => {
      const { data } = await supabase.from("positions").select("*").eq("status", "active");
      if (data) setPositions(data);
    };

    fetchSettings();
    fetchPositions();

    const channel = supabase
      .channel("trailing-positions-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
          filter: "status=eq.active",
        },
        () => {
          fetchPositions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeTrailingPositions = useMemo(() => {
    // Build a per-symbol price map exactly like ActivePositions
    const priceMap = new Map<string, number>();

    positions.forEach((p) => {
      const live = getPrice ? getPrice(p.symbol) : undefined;
      const liveVal = live?.price != null ? Number(live.price) : NaN;
      const resolved = !isNaN(liveVal)
        ? liveVal
        : typeof p.current_price === "number"
          ? p.current_price
          : p.entry_price;
      priceMap.set(p.symbol, resolved);
    });

    return positions
      .map((p) => {
        const currentPrice = priceMap.get(p.symbol) ?? p.entry_price;
        const pnlPercent = calculatePnlPercent(p.side, p.entry_price, currentPrice);
        return { position: p, currentPrice, pnlPercent };
      })
      .filter((item) => item.pnlPercent > settings.activationPercent)
      .map(({ position, currentPrice, pnlPercent }) => {
        // Use actual database stop_loss (set by monitor-positions with ratcheting)
        const actualDbStopLoss = position.stop_loss;
        const theoreticalStop = calculateTrailingStop(position, currentPrice);
        const { lockedProfitPercent, lockedProfitAbsolute, lockedStopPrice, peakPnlPercent } = calculateProfitLock(
          position,
          pnlPercent,
        );
        return {
          ...position,
          currentPrice,
          pnlPercent,
          peakPnlPercent,
          // Use actual DB stop_loss (individual per position), fallback to theoretical
          stop_loss: actualDbStopLoss ?? theoreticalStop,
          theoreticalStop,
          lockedProfitPercent,
          lockedProfitAbsolute,
          lockedStopPrice,
          profitLockPercent: settings.profitLockPercent,
        };
      });
  }, [positions, priceVersion, settings, getPrice]);

  // ----------- UI (DEĞİŞTİRİLMEDİ) -----------
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
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/10 p-3">
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                {activeTrailingPositions.length} position
                {activeTrailingPositions.length > 1 ? "s are" : " is"} profitable and protected by trailing stops
              </span>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {activeTrailingPositions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Shield className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p className="text-sm">No positions with active trailing stops</p>
              <p className="mt-1 text-xs">Positions appear here when P&L exceeds +{settings.activationPercent}%</p>
            </div>
          ) : (
            activeTrailingPositions.map((position) => (
              <div key={position.id} className="rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold text-foreground">{position.symbol}</span>
                      <Badge variant={position.side === "BUY" ? "default" : "secondary"} className="text-xs">
                        {position.side}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-primary">
                        {formatPercent(position.pnlPercent, 2, true)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-xs">Entry:</span>
                      <span>{formatPrice(position.entry_price, 4, "$")}</span>
                      <span className="text-xs">Current:</span>
                      <span className="font-medium text-primary">{formatPrice(position.currentPrice, 4, "$")}</span>
                      <span className="text-xs">Stop:</span>
                      <span className="text-destructive">{formatPrice(position.stop_loss, 4, "$")}</span>
                    </div>
                    {/* Profit Lock */}
                    <div className="mt-2 rounded bg-muted/50 p-2">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        Profit Lock ({position.profitLockPercent}%)
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div>
                          <span>Locked Profit:</span>
                          <span className="ml-1 font-medium text-green-500">
                            {formatPercent(position.lockedProfitPercent, 2, true)}
                          </span>
                        </div>
                        <div>
                          <span>Lock Stop:</span>
                          <span className="ml-1 font-medium text-amber-500">
                            {formatPrice(position.lockedStopPrice, 4, "$")}
                          </span>
                        </div>
                        <div className="col-span-2 mt-1 text-[10px] italic">
                          Peak: {formatPercent(position.peakPnlPercent)} × {position.profitLockPercent}% ={" "}
                          {formatPercent(position.lockedProfitPercent)} locked
                        </div>
                      </div>
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
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <h4 className="mb-2 text-sm font-medium text-foreground">Current Settings:</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• Status: {settings.enabled ? "Enabled" : "Disabled"}</li>
            <li>• Activates at: +{settings.activationPercent}% profit</li>
            <li>• Trailing distance: {settings.distanceMultiplier}% of price</li>
            <li>• Profit lock: {settings.profitLockPercent}% of gains protected</li>
            <li>• Only moves in favorable direction</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
