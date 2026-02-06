import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBlockedSignals, type MoveZone } from "@/hooks/useBlockedSignals";
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Activity, Ban, Target, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Zone color mapping for MOVE_EXHAUSTION gate
const getZoneBadge = (zone: MoveZone): { color: string; label: string } => {
  switch (zone) {
    case 'FRESH':
      return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'FRESH' };
    case 'SOFT':
      return { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'SOFT' };
    case 'HARD':
      return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'HARD' };
    case 'EXCEPTION':
      return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'EXCEPTION' };
    default:
      return { color: 'bg-muted text-muted-foreground', label: zone };
  }
};

const LIMIT_OPTIONS = [15, 30, 50, 100] as const;

// Severity classification for color-coded badges
type SeverityLevel = "blocked" | "warning" | "reduced" | "info";

const getSeverityLevel = (reason: string, filtersStatus: any): SeverityLevel => {
  const lowerReason = reason.toLowerCase();
  const gate = filtersStatus?.gate || "";
  const positionMultiplier = filtersStatus?.positionMultiplier;
  const graduatedEffect = filtersStatus?.graduatedMomentumEffect;
  
  // Critical blocks (red) - absolute blocks with no exceptions
  if (
    lowerReason.includes("extreme momentum veto") ||
    filtersStatus?.source === 'extreme_momentum_veto' ||
    graduatedEffect?.directionNullified ||
    lowerReason.includes("hard block") ||
    lowerReason.includes("tier 0") ||
    lowerReason.includes("tier 1") ||
    gate === "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK" ||
    gate === "EXTREME_MOMENTUM_VETO" ||
    lowerReason.includes("symbol disabled") ||
    positionMultiplier === 0
  ) {
    return "blocked";
  }
  
  // High severity (amber) - important gates that block trades
  if (
    lowerReason.includes("no clear trade direction") ||
    gate === "NO_CLEAR_DIRECTION" ||
    gate === "ADX_TOO_LOW" ||
    gate === "NO_MOMENTUM_CONFIRMATION" ||
    gate === "HTF_NOT_ALIGNED" ||
    gate === "MOMENTUM_DIRECTION_OPPOSING" ||
    gate === "MOMENTUM_SLOPE_GATE" ||
    lowerReason.includes("adx too low") ||
    lowerReason.includes("htf not aligned") ||
    graduatedEffect?.directionFlipped
  ) {
    return "warning";
  }
  
  // Size reduced (blue/cyan) - still allowed but with reduced size
  if (
    (positionMultiplier !== undefined && positionMultiplier > 0 && positionMultiplier < 1) ||
    gate === "LTF_CONFIRMATION" ||
    gate === "STOCHRSI_RUNWAY_GATE" ||
    gate === "HIGH_ADX_1H_CONFIRMATION" ||
    lowerReason.includes("size reduced") ||
    lowerReason.includes("reduced")
  ) {
    return "reduced";
  }
  
  // Informational (gray) - limits, pending signals, etc.
  return "info";
};

const getSeverityStyles = (severity: SeverityLevel) => {
  switch (severity) {
    case "blocked":
      return {
        badge: "bg-red-500/20 text-red-400 border-red-500/40",
        text: "text-red-400",
        label: "⛔ BLOCKED",
        row: "border-l-2 border-l-red-500/50"
      };
    case "warning":
      return {
        badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
        text: "text-amber-400",
        label: "⚠️ WARNING",
        row: "border-l-2 border-l-amber-500/50"
      };
    case "reduced":
      return {
        badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
        text: "text-cyan-400",
        label: "📉 REDUCED",
        row: "border-l-2 border-l-cyan-500/50"
      };
    case "info":
    default:
      return {
        badge: "bg-muted text-muted-foreground border-border",
        text: "text-muted-foreground",
        label: "ℹ️ INFO",
        row: ""
      };
  }
};

const getRejectionCategory = (reason: string): { label: string; color: string; icon: React.ReactNode } => {
  const lowerReason = reason.toLowerCase();
  
  if (lowerReason.includes("symbol disabled")) {
    return { label: "Symbol Filter", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <Ban className="h-3 w-3" /> };
  }
  if (lowerReason.includes("adx")) {
    return { label: "ADX", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <Activity className="h-3 w-3" /> };
  }
  if (lowerReason.includes("stoch") || lowerReason.includes("rsi")) {
    return { label: "StochRSI", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: <TrendingDown className="h-3 w-3" /> };
  }
  if (lowerReason.includes("regime") || lowerReason.includes("ranging")) {
    return { label: "Regime", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Ban className="h-3 w-3" /> };
  }
  if (lowerReason.includes("reversal")) {
    return { label: "Reversal", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <AlertTriangle className="h-3 w-3" /> };
  }
  if (lowerReason.includes("quality") || lowerReason.includes("confidence")) {
    return { label: "Quality", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: <TrendingUp className="h-3 w-3" /> };
  }
  if (lowerReason.includes("squeeze")) {
    return { label: "Squeeze", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: <Activity className="h-3 w-3" /> };
  }
  if (lowerReason.includes("quiet")) {
    return { label: "Quiet Trend", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <TrendingDown className="h-3 w-3" /> };
  }
  
  return { label: "Gate", color: "bg-muted text-muted-foreground border-border", icon: <Ban className="h-3 w-3" /> };
};

// Convert technical rejection reasons to user-friendly messages
const formatUserFriendlyReason = (reason: string, filters?: any): string => {
  if (!reason) return "Unknown rejection";
  
  const lowerReason = reason.toLowerCase();
  const score = filters?.momentumScore;
  const adx = filters?.adx;
  const graduatedEffect = filters?.graduatedMomentumEffect;
  
  // EXTREME MOMENTUM VETO - highest priority
  if (lowerReason.includes("extreme momentum veto") || filters?.source === 'extreme_momentum_veto') {
    const absScore = Math.abs(score ?? 0);
    const direction = score && score < 0 ? "bearish" : "bullish";
    const tradeDir = graduatedEffect?.baseDirection || (score && score < 0 ? "LONG" : "SHORT");
    return `⛔ ${direction.charAt(0).toUpperCase() + direction.slice(1)} momentum (${absScore}) blocks ${tradeDir.toUpperCase()}`;
  }
  
  // NO_CLEAR_DIRECTION with graduated momentum flip
  if (lowerReason.includes("no clear trade direction") || filters?.gate === "NO_CLEAR_DIRECTION") {
    // Check if graduated momentum flipped direction
    if (graduatedEffect?.directionFlipped) {
      const from = graduatedEffect.baseDirection?.toUpperCase() || "—";
      const to = graduatedEffect.adjustedDirection?.toUpperCase() || "—";
      return `🔄 Momentum flipped direction: ${from} → ${to}`;
    }
    
    // Check if direction was nullified
    if (graduatedEffect?.directionNullified || filters?.source === 'extreme_momentum_veto') {
      const absScore = Math.abs(score ?? 0);
      return `⛔ Momentum too strong (${absScore}) - no valid direction`;
    }
    
    // Check for conflicting timeframes
    if (lowerReason.includes("conflicting")) {
      return "⚠️ Timeframes showing conflicting trends";
    }
    
    return "🔍 Market direction unclear";
  }
  
  // ADX TOO LOW
  if (lowerReason.includes("adx too low") || filters?.gate === "ADX_TOO_LOW") {
    const adxVal = adx?.toFixed?.(0) ?? adx;
    if (adxVal !== undefined) {
      if (adx < 18) return `⛔ Trend too weak (ADX ${adxVal} < 18)`;
      return `⚠️ Low trend energy (ADX ${adxVal})`;
    }
    return "⚠️ Trend energy insufficient";
  }
  
  // Symbol disabled / performance filter
  if (lowerReason.includes("symbol disabled")) {
    const wr = filters?.winRate;
    return wr !== undefined ? `🚫 Symbol disabled (${wr.toFixed(0)}% win rate)` : "🚫 Symbol disabled - poor performance";
  }
  
  // NO MOMENTUM CONFIRMATION
  if (lowerReason.includes("no momentum") || filters?.gate === "NO_MOMENTUM_CONFIRMATION") {
    const state = filters?.momentum?.state;
    if (state === 'exhausted') return "💨 Momentum exhausted";
    if (state === 'mixed') return "⚠️ Momentum mixed/uncertain";
    return "⏳ Waiting for momentum confirmation";
  }
  
  // HTF NOT ALIGNED
  if (lowerReason.includes("htf not aligned") || filters?.gate === "HTF_NOT_ALIGNED") {
    const t4h = filters?.trend4h;
    const t1h = filters?.trend1h;
    if (t4h && t1h) return `📈 Timeframes misaligned: 4H ${t4h}, 1H ${t1h}`;
    return "📈 Higher timeframes not aligned";
  }
  
  // MOMENTUM DIRECTION OPPOSING
  if (lowerReason.includes("momentum_direction") || filters?.gate === "MOMENTUM_DIRECTION_OPPOSING") {
    const absScore = Math.abs(score ?? 0);
    if (absScore >= 50) return `⛔ Strong opposing momentum (${absScore})`;
    if (absScore >= 25) return `⚠️ Moderate opposing momentum (${absScore})`;
    return "↔️ Momentum opposes trade direction";
  }
  
  // MOVE EXHAUSTED
  if (lowerReason.includes("move_exhausted") || lowerReason.includes("move exhausted")) {
    const zone = filters?.moveZone;
    if (zone === 'HARD') return "🛑 Move exhausted - in hard zone";
    if (zone === 'SOFT') return "⚠️ Move extended - in soft zone";
    return "💨 Price move already exhausted";
  }
  
  // STOCHRSI extremes
  if (lowerReason.includes("hard block") || lowerReason.includes("stochrsi extreme")) {
    const k = filters?.stochK1h ?? filters?.stochRsiK;
    if (k !== undefined) {
      if (k > 95) return `🔴 Overbought (K=${k.toFixed(0)}) - hard block`;
      if (k > 80) return `🟠 Overbought (K=${k.toFixed(0)}) - wait for pullback`;
      if (k < 5) return `🔴 Oversold (K=${k.toFixed(0)}) - hard block`;
      if (k < 20) return `🟠 Oversold (K=${k.toFixed(0)}) - wait for bounce`;
    }
    return "📊 StochRSI at extreme level";
  }
  
  // TIER 0/TIER 1 blocks
  if (lowerReason.includes("tier 0") || lowerReason.includes("tier 1") || lowerReason.includes("severe") || lowerReason.includes("deep")) {
    return "🛑 Extreme exhaustion - hard block";
  }
  
  // PRE-RECOVERY
  if (lowerReason.includes("pre-recovery") || lowerReason.includes("pre_recovery")) {
    return "🔄 Recovery mode - tighter filters";
  }
  
  // Bollinger gates
  if (lowerReason.includes("bollinger") || lowerReason.includes("overextended") || lowerReason.includes("underextended")) {
    const pctB = filters?.percentB;
    if (pctB !== undefined) {
      const val = typeof pctB === 'number' ? pctB.toFixed(0) : pctB;
      return `📉 Bollinger extreme (%B: ${val})`;
    }
    return "📉 Price at Bollinger Band extreme";
  }
  
  // Active signal
  if (lowerReason.includes("active signal")) {
    return "⏸️ Signal already pending";
  }
  
  // Max trades
  if (lowerReason.includes("max trades")) {
    return "🚫 Maximum trade limit reached";
  }
  
  // Quality score
  if (lowerReason.includes("quality score")) {
    const quality = filters?.qualityScore;
    if (quality !== undefined) return `📊 Quality too low (${quality.toFixed?.(0) ?? quality})`;
    return "📊 Signal quality below threshold";
  }
  
  // No strategy match
  if (lowerReason.includes("no strategy")) {
    return "🔍 No strategy conditions met";
  }
  
  // Reversal risk
  if (lowerReason.includes("reversal risk")) {
    return "⚠️ High reversal risk detected";
  }
  
  // COUNTER_TREND_ADMISSION - counter-trend probe rejected
  if (lowerReason.includes("counter_trend_admission") || filters?.gate === "COUNTER_TREND_ADMISSION") {
    const failReason = filters?.reason || "";
    const direction = filters?.direction || "unknown";
    
    if (failReason.includes("ADX_PERSISTENCE_INSUFFICIENT")) {
      return `⏳ Counter-trend needs more trend decay`;
    }
    if (failReason.includes("ADX_NOT_EXHAUSTED")) {
      return `⚡ Trend still too strong for counter-${direction}`;
    }
    if (failReason.includes("STOCHRSI_NOT_DEPEGGED")) {
      return `📊 Momentum not resetting - wait`;
    }
    return `🔄 Counter-trend ${direction.toUpperCase()} blocked`;
  }
  
  // Regime
  if (lowerReason.includes("regime") || lowerReason.includes("ranging")) {
    return "📊 Market regime unfavorable";
  }
  
  // Squeeze
  if (lowerReason.includes("squeeze")) {
    return "⏳ Waiting for squeeze breakout";
  }
  
  // LTF gates
  if (lowerReason.includes("ltf_confirmation") || filters?.gate === "LTF_CONFIRMATION") {
    return "⏱️ Lower timeframe not confirming";
  }
  
  if (lowerReason.includes("ltf_spike") || filters?.gate === "LTF_SPIKE_PROTECTION") {
    return "📊 Climax candle detected";
  }
  
  // Momentum slope
  if (lowerReason.includes("momentum_slope") || filters?.gate === "MOMENTUM_SLOPE_GATE") {
    return "📉 Opposing momentum accelerating";
  }
  
  // If nothing matched, return a cleaned up version
  let cleaned = reason
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^HARD GATE:\s*/i, '')
    .replace(/^REGIME:\s*/i, '')
    .replace(/⛔\s*/g, '')
    .replace(/_/g, ' ')
    .trim();
  
  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 37) + "...";
  }
  
  return cleaned || "Signal rejected";
};

export const BlockedSignalsWidget = memo(function BlockedSignalsWidget() {
  const [limit, setLimit] = useState<number>(50);
  const { data: blockedSignals, isLoading, error } = useBlockedSignals(limit);

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            Blocked Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            Blocked Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">Error loading blocked signals</div>
        </CardContent>
      </Card>
    );
  }

  const signals = blockedSignals || [];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            Blocked Signals
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {LIMIT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {signals.length}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          {signals.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No blocked signals yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {signals.map((signal) => {
                const category = getRejectionCategory(signal.rejection_reason);
                const timeAgo = formatDistanceToNow(new Date(signal.checked_at), { addSuffix: true });
                const filters = signal.filters_status;
                const severity = getSeverityLevel(signal.rejection_reason, filters);
                const severityStyles = getSeverityStyles(severity);
                
                return (
                  <div key={signal.id} className={`px-4 py-3 hover:bg-muted/30 transition-colors ${severityStyles.row}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {signal.symbol.replace("USDT", "")}
                        </span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${severityStyles.badge}`}>
                          {severityStyles.label}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${category.color} flex items-center gap-1`}>
                          {category.icon}
                          {category.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo}
                      </span>
                    </div>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className={`text-xs leading-relaxed mb-2 cursor-help flex items-center gap-1 ${severityStyles.text}`}>
                            <span>{formatUserFriendlyReason(signal.rejection_reason, filters)}</span>
                            <Info className="h-3 w-3 opacity-50" />
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[320px] text-xs">
                          <p className="font-medium mb-1">Technical Details:</p>
                          <p className="text-muted-foreground break-words">{signal.rejection_reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    {filters && (
                      <div className="flex flex-wrap gap-1.5">
                        {/* Show win rate stats for symbol filter blocks */}
                        {filters.filterType === 'symbol_performance' ? (
                          <>
                            <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono">
                              WinRate:{typeof filters.winRate === 'number' ? filters.winRate.toFixed(1) : '?'}%
                            </span>
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                              {typeof filters.wins === 'number' ? filters.wins.toFixed(1) : 0}W/{typeof filters.losses === 'number' ? filters.losses.toFixed(1) : 0}L
                            </span>
                            {(filters.breakEvenCount || 0) > 0 && (
                              <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">
                                {filters.breakEvenCount}BE
                              </span>
                            )}
                            {(filters.partialWinCount || 0) > 0 && (
                              <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                                {filters.partialWinCount}partial
                              </span>
                            )}
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {filters.strategiesCount ?? 0} strategies
                            </span>
                          </>
                        ) : (
                          <>
                            {/* Zone Analytics Badge for MOVE_EXHAUSTION */}
                            {filters.moveZone && (
                              <Badge variant="outline" className={`text-xs ${getZoneBadge(filters.moveZone).color} flex items-center gap-1`}>
                                <Target className="h-3 w-3" />
                                {getZoneBadge(filters.moveZone).label}
                              </Badge>
                            )}
                            {filters.moveZoneDetails && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {filters.moveZoneDetails.distancePercent?.toFixed(1)}% {filters.moveZoneDetails.direction?.toUpperCase()}
                              </span>
                            )}
                            {typeof filters.adx === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                ADX:{filters.adx.toFixed(1)}
                              </span>
                            )}
                            {typeof filters.stochRsiK4h === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                K4h:{filters.stochRsiK4h.toFixed(0)}
                              </span>
                            )}
                            {filters.trend4h && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                4h:{filters.trend4h}
                              </span>
                            )}
                            {typeof filters.priceMove === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                Move:{filters.priceMove.toFixed(1)}%
                              </span>
                            )}
                            {typeof filters.squeeze === 'boolean' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                Squeeze:{filters.squeeze ? "Yes" : "No"}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
});
