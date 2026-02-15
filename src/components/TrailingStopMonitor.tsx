import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Shield, Brain, Clock, Zap, AlertTriangle, Layers, ArrowUp, ArrowDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { formatPrice, formatPercent } from "@/lib/utils";

// Extract HTF alignment data from position entry_snapshot
const extractHtfAlignment = (entrySnapshot: any) => {
  if (!entrySnapshot) return null;
  
  // Parse if string
  const snapshot = typeof entrySnapshot === 'string' ? JSON.parse(entrySnapshot) : entrySnapshot;
  
  // Look for trueAlignment in multiple locations
  const alignment = snapshot?.trueAlignmentV2 || snapshot?.trueAlignment || 
                    snapshot?.indicators?.trueAlignmentV2 || snapshot?.indicators?.trueAlignment ||
                    snapshot?.trendData?.trueAlignment;
  
  if (!alignment) return null;
  
  const weighted = alignment.weightedComponents || {};
  const tf4h = weighted.tf4hWeighted ?? 0;
  const tf1h = weighted.tf1hWeighted ?? 0;
  const adx = weighted.adxWeighted ?? alignment.adxContribution ?? 0;
  const volume = weighted.volumeWeighted ?? 0;
  const score = alignment.score ?? alignment.totalWeightedConfidence ?? (tf4h + tf1h + adx + volume);
  
  // Determine alignment quality
  const isPremium = tf4h >= 30 && tf1h >= 15;
  const isWeak = tf4h < 15 || tf1h < 10;
  const neutralCapped = alignment.neutralCapped ?? false;
  
  return {
    score: Math.round(score),
    tf4h: Math.round(tf4h * 10) / 10,
    tf1h: Math.round(tf1h * 10) / 10,
    adx: Math.round(adx * 10) / 10,
    volume: Math.round(volume * 10) / 10,
    isPremium,
    isWeak,
    neutralCapped,
  };
};
export const TrailingStopMonitor = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    enabled: true,
    activationPercent: 1.0,
    distanceMultiplier: 1.5,
    profitLockPercent: 50,
    trailingAggressiveness: 3,
    progressiveLockEnabled: true,
    stalePeakProtectionEnabled: true,
    decayVelocityExitEnabled: true,
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

  // Smart AITS: Progressive lock tiers
  const getProgressiveLockPercent = (peakPnl: number, aggressiveness: number): number => {
    const baseLock = 0.30 + (aggressiveness * 0.05);
    let tierBonus = 0;
    if (peakPnl >= 5) tierBonus = 0.30;
    else if (peakPnl >= 3) tierBonus = 0.20;
    else if (peakPnl >= 2) tierBonus = 0.15;
    else if (peakPnl >= 1) tierBonus = 0.10;
    return Math.min(0.85, baseLock + tierBonus);
  };

  // Smart AITS: Stale peak bonus
  const getStalePeakBonus = (minutesSincePeak: number): number => {
    if (!settings.stalePeakProtectionEnabled) return 0;
    if (minutesSincePeak > 120) return 0.25;
    if (minutesSincePeak > 60) return 0.20;
    if (minutesSincePeak > 30) return 0.10;
    if (minutesSincePeak > 15) return 0.05;
    return 0;
  };

  // Get tier label
  const getTierLabel = (peakPnl: number): string => {
    if (peakPnl >= 5) return "Tier 5";
    if (peakPnl >= 3) return "Tier 4";
    if (peakPnl >= 2) return "Tier 3";
    if (peakPnl >= 1) return "Tier 2";
    return "Tier 1";
  };

  // Get tier color
  const getTierColor = (peakPnl: number): string => {
    if (peakPnl >= 5) return "text-green-500";
    if (peakPnl >= 3) return "text-emerald-500";
    if (peakPnl >= 2) return "text-blue-500";
    if (peakPnl >= 1) return "text-cyan-500";
    return "text-slate-500";
  };

  // ----------- INITIAL FETCH -----------
  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("risk_parameters")
        .select("trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier, trailing_stop_profit_lock_percent, trailing_aggressiveness, progressive_lock_enabled, stale_peak_protection_enabled, decay_velocity_exit_enabled")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setSettings({
          enabled: data.trailing_stop_enabled ?? true,
          activationPercent: data.trailing_stop_activation_percent ?? 1.0,
          distanceMultiplier: data.trailing_stop_distance_multiplier ?? 1.5,
          profitLockPercent: data.trailing_stop_profit_lock_percent ?? 50,
          trailingAggressiveness: data.trailing_aggressiveness ?? 3,
          progressiveLockEnabled: data.progressive_lock_enabled ?? true,
          stalePeakProtectionEnabled: data.stale_peak_protection_enabled ?? true,
          decayVelocityExitEnabled: data.decay_velocity_exit_enabled ?? true,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "positions", filter: "status=eq.active" }, () => {
        fetchPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Build price map
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((p) => {
      const livePrice = getPrice(p.symbol);
      map.set(p.symbol, livePrice ? parseFloat(livePrice.price) : p.current_price || p.entry_price);
    });
    return map;
  }, [positions, getPrice, priceVersion]);

  const activeTrailingPositions = useMemo(() => {
    const now = new Date();
    
    return positions
      .map((p) => {
        const currentPrice = priceMap.get(p.symbol) ?? p.entry_price;
        const pnlPercent = calculatePnlPercent(p.side, p.entry_price, currentPrice);
        const peakPnl = Math.max(p.peak_pnl_percent || 0, pnlPercent);
        const peakReachedAt = p.peak_reached_at ? new Date(p.peak_reached_at) : now;
        const minutesSincePeak = (now.getTime() - peakReachedAt.getTime()) / (1000 * 60);
        
        return { position: p, currentPrice, pnlPercent, peakPnl, minutesSincePeak };
      })
      .filter((item) => item.pnlPercent > settings.activationPercent)
      .map(({ position, currentPrice, pnlPercent, peakPnl, minutesSincePeak }) => {
        // Calculate Smart AITS lock
        let effectiveLockPercent = settings.profitLockPercent / 100;
        let smartAitsActive = false;
        
        if (settings.progressiveLockEnabled) {
          const progressiveLock = getProgressiveLockPercent(peakPnl, settings.trailingAggressiveness);
          const stalePeakBonus = getStalePeakBonus(minutesSincePeak);
          const adaptiveLock = progressiveLock + stalePeakBonus;
          
          if (adaptiveLock > effectiveLockPercent) {
            effectiveLockPercent = Math.min(0.85, adaptiveLock);
            smartAitsActive = true;
          }
        }
        
        // Calculate locked profit
        const lockedProfitPercent = peakPnl * effectiveLockPercent;
        const lockedProfitAbsolute = position.entry_price * (lockedProfitPercent / 100);
        const lockedStopPrice = position.side === "BUY" 
          ? position.entry_price + lockedProfitAbsolute 
          : position.entry_price - lockedProfitAbsolute;
        
        // Decay velocity
        const decayPercent = peakPnl - pnlPercent;
        const decayVelocity = minutesSincePeak > 0 ? decayPercent / minutesSincePeak : 0;
        const isDecayWarning = decayVelocity > 0.02;
        const isDecayCritical = decayVelocity > 0.03;

        // Extract HTF alignment from entry snapshot
        const htfAlignment = extractHtfAlignment(position.entry_snapshot);

        return {
          ...position,
          currentPrice,
          pnlPercent,
          peakPnl,
          minutesSincePeak,
          effectiveLockPercent: effectiveLockPercent * 100,
          lockedProfitPercent,
          lockedStopPrice,
          smartAitsActive,
          decayVelocity: decayVelocity * 100, // % per minute
          isDecayWarning,
          isDecayCritical,
          tier: getTierLabel(peakPnl),
          tierColor: getTierColor(peakPnl),
          htfAlignment,
        };
      });
  }, [positions, priceMap, settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 shrink-0 text-primary" />
          <span className="hidden sm:inline">Smart Trailing Stop Monitor</span>
          <span className="sm:hidden">Smart AITS</span>
          {activeTrailingPositions.length > 0 && (
            <Badge variant="default" className="ml-auto shrink-0">
              {activeTrailingPositions.length} Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTrailingPositions.length > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-foreground">
              Smart AITS protecting {activeTrailingPositions.filter(p => p.smartAitsActive).length} of {activeTrailingPositions.length} positions with adaptive locks
            </span>
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
                    {/* Header */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{position.symbol}</span>
                      <Badge variant={position.side === "BUY" ? "default" : "secondary"} className="text-xs">
                        {position.side}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-primary">
                        {formatPercent(position.pnlPercent, 2, true)}
                      </Badge>
                      {position.smartAitsActive && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Brain className="h-3 w-3" /> Smart AITS
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${position.tierColor}`}>
                        {position.tier}
                      </Badge>
                    </div>
                    
                    {/* Prices */}
                    <div className="mb-2 grid grid-cols-3 gap-1 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:text-sm text-muted-foreground">
                      <span>Entry: {formatPrice(position.entry_price, 4, "$")}</span>
                      <span className="text-primary">Now: {formatPrice(position.currentPrice, 4, "$")}</span>
                      <span className="text-destructive">Stop: {formatPrice(position.stop_loss, 4, "$")}</span>
                    </div>
                    
                    {/* Smart AITS Details */}
                    <div className="grid gap-2 rounded bg-muted/50 p-2 text-xs">
                      {/* Lock Breakdown */}
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        <span className="font-medium">Lock: {position.effectiveLockPercent.toFixed(0)}%</span>
                        <span className="text-muted-foreground">
                          → Locked {formatPercent(position.lockedProfitPercent)} at {formatPrice(position.lockedStopPrice, 4, "$")}
                        </span>
                      </div>
                      
                      {/* Peak Info */}
                      <div className="flex items-center gap-2">
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span>Peak: {formatPercent(position.peakPnl)}</span>
                        <span className="text-muted-foreground">
                          ({position.minutesSincePeak.toFixed(0)} min ago)
                        </span>
                        {position.minutesSincePeak > 30 && (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            <Clock className="mr-0.5 h-2.5 w-2.5" />
                            Stale Peak Bonus Active
                          </Badge>
                        )}
                      </div>
                      
                      {/* Decay Velocity */}
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <Shield className={`h-3 w-3 shrink-0 ${position.isDecayCritical ? 'text-red-500' : position.isDecayWarning ? 'text-amber-500' : 'text-green-500'}`} />
                        <span className={position.isDecayCritical ? 'text-red-500' : position.isDecayWarning ? 'text-amber-500' : ''}>
                          Decay: {position.decayVelocity.toFixed(2)}%/min
                        </span>
                        {position.isDecayCritical && (
                          <Badge variant="destructive" className="gap-1 text-[10px]">
                            <AlertTriangle className="h-2.5 w-2.5" /> <span className="hidden sm:inline">Emergency</span> Exit
                          </Badge>
                        )}
                        {position.isDecayWarning && !position.isDecayCritical && (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            High Decay
                          </Badge>
                      )}
                      
                      {/* HTF Alignment Context */}
                      {position.htfAlignment && (
                        <div className="mt-2 border-t border-border/50 pt-2">
                          <div className="mb-1.5 flex flex-wrap items-center gap-1 sm:gap-2">
                            <Layers className="h-3 w-3 shrink-0 text-blue-500" />
                            <span className="font-medium">HTF:</span>
                            <span className="text-muted-foreground">{position.htfAlignment.score}</span>
                            {position.htfAlignment.isPremium && (
                              <Badge variant="default" className="gap-0.5 bg-green-500/20 text-[10px] text-green-400">
                                <ArrowUp className="h-2.5 w-2.5" /> PREMIUM
                              </Badge>
                            )}
                            {position.htfAlignment.isWeak && (
                              <Badge variant="destructive" className="gap-0.5 text-[10px]">
                                <ArrowDown className="h-2.5 w-2.5" /> WEAK
                              </Badge>
                            )}
                            {position.htfAlignment.neutralCapped && (
                              <Badge variant="outline" className="text-[10px] text-amber-500">
                                Capped
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <div>
                              <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">4H</span>
                                <span className="font-medium">{position.htfAlignment.tf4h}</span>
                              </div>
                              <Progress value={Math.min(100, (position.htfAlignment.tf4h / 35) * 100)} className="h-1" />
                            </div>
                            <div>
                              <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">1H</span>
                                <span className="font-medium">{position.htfAlignment.tf1h}</span>
                              </div>
                              <Progress value={Math.min(100, (position.htfAlignment.tf1h / 30) * 100)} className="h-1" />
                            </div>
                            <div>
                              <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">ADX</span>
                                <span className="font-medium">{position.htfAlignment.adx}</span>
                              </div>
                              <Progress value={Math.min(100, (position.htfAlignment.adx / 15) * 100)} className="h-1" />
                            </div>
                            <div>
                              <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">Vol</span>
                                <span className="font-medium">{position.htfAlignment.volume}</span>
                              </div>
                              <Progress value={Math.min(100, (position.htfAlignment.volume / 10) * 100)} className="h-1" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Current Settings Summary */}
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Brain className="h-4 w-4" />
            Smart AITS Configuration:
          </h4>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <div>• Aggr: Lv{settings.trailingAggressiveness}</div>
            <div>• Prog Lock: {settings.progressiveLockEnabled ? "On" : "Off"}</div>
            <div>• Stale Peak: {settings.stalePeakProtectionEnabled ? "On" : "Off"}</div>
            <div>• Decay Exit: {settings.decayVelocityExitEnabled ? "On" : "Off"}</div>
            <div>• Activation: +{settings.activationPercent}%</div>
            <div>• Base Lock: {settings.profitLockPercent}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};