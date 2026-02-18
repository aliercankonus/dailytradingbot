import { memo, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, TrendingUp, TrendingDown, Minus, Zap, Activity, AlertCircle } from "lucide-react";
import { useBlockedSignals, BlockedSignal } from "@/hooks/useBlockedSignals";

interface ProximityScore {
  symbol: string;
  score: number;
  status: string;
  primaryGate: string;
  adx: number | null;
  adxSlope: number | null;
  stochK4h: number | null;
  stochK1h: number | null;
  direction: string | null;
  components: {
    adxScore: number;
    stochScore: number;
    momentumScore: number;
    gateCount: number;
  };
}

const computeADXProximity = (adx: number | null): number => {
  if (adx === null || adx === undefined) return 30;
  if (adx >= 25) return 100;
  if (adx >= 20) return 60 + ((adx - 20) / 5) * 40;
  if (adx >= 15) return 30 + ((adx - 15) / 5) * 30;
  return Math.max(10, (adx / 15) * 30);
};

const computeStochProximity = (k4h: number | null, k1h: number | null): number => {
  // For oversold (potential long reversal)
  const k = k4h ?? k1h ?? 50;
  if (k <= 3) return 40; // blocked by deep oversold
  if (k <= 8) return 70;
  if (k <= 20) return 90;
  if (k >= 97) return 40; // blocked by deep overbought
  if (k >= 92) return 70;
  if (k >= 80) return 90;
  // Neutral zone — moderate proximity
  return 60;
};

const computeMomentumProximity = (signal: BlockedSignal): number => {
  const fs = signal.filters_status;
  const ms = fs?.momentumScore;
  if (typeof ms === "number") {
    const absMs = Math.abs(ms);
    if (absMs >= 30) return 90;
    if (absMs >= 15) return 70;
    return 40;
  }
  return 50; // unknown
};

const getGatePenalty = (reason: string): number => {
  const r = reason.toLowerCase();
  if (r.includes("tier_0") || r.includes("deep_")) return 30;
  if (r.includes("no_clear_direction") || r.includes("range_compression")) return 25;
  if (r.includes("move_exhausted")) return 20;
  if (r.includes("near_extreme") || r.includes("near_24h")) return 15;
  if (r.includes("adx_too_low")) return 15;
  if (r.includes("momentum")) return 10;
  if (r.includes("htf")) return 10;
  return 5;
};

const getProximityColor = (score: number): string => {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
};

const getProximityBg = (score: number): string => {
  if (score >= 80) return "bg-green-500/15 border-green-500/30";
  if (score >= 60) return "bg-yellow-500/15 border-yellow-500/30";
  if (score >= 40) return "bg-orange-500/15 border-orange-500/30";
  return "bg-red-500/15 border-red-500/30";
};

const getProximityLabel = (score: number): string => {
  if (score >= 80) return "Imminent";
  if (score >= 60) return "Developing";
  if (score >= 40) return "Blocked";
  return "Far";
};

const getStatusIcon = (score: number) => {
  if (score >= 80) return <Zap className="h-3.5 w-3.5 text-green-400" />;
  if (score >= 60) return <Activity className="h-3.5 w-3.5 text-yellow-400" />;
  if (score >= 40) return <AlertCircle className="h-3.5 w-3.5 text-orange-400" />;
  return <Minus className="h-3.5 w-3.5 text-red-400" />;
};

const ProximityBar = ({ score }: { score: number }) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = clampedScore >= 80 ? "bg-green-500" : clampedScore >= 60 ? "bg-yellow-500" : clampedScore >= 40 ? "bg-orange-500" : "bg-red-500";
  
  return (
    <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${color}`} 
        style={{ width: `${clampedScore}%` }} 
      />
    </div>
  );
};

export const SignalProximityWidget = memo(function SignalProximityWidget() {
  const { data: blockedSignals, isLoading } = useBlockedSignals(500);

  const proximities = useMemo((): ProximityScore[] => {
    if (!blockedSignals || blockedSignals.length === 0) return [];

    // Group by symbol, take the most recent rejection per symbol
    const latestBySymbol = new Map<string, BlockedSignal>();
    // Also collect ALL rejections per symbol for multi-gate penalty
    const allBySymbol = new Map<string, BlockedSignal[]>();

    for (const signal of blockedSignals) {
      // Only consider last 3 hours
      const age = Date.now() - new Date(signal.checked_at).getTime();
      if (age > 3 * 60 * 60 * 1000) continue;

      if (!latestBySymbol.has(signal.symbol)) {
        latestBySymbol.set(signal.symbol, signal);
      }
      if (!allBySymbol.has(signal.symbol)) {
        allBySymbol.set(signal.symbol, []);
      }
      allBySymbol.get(signal.symbol)!.push(signal);
    }

    const results: ProximityScore[] = [];
    for (const [symbol, signal] of latestBySymbol) {
      const fs = signal.filters_status;
      const td = signal.trend_data;

      const adx = (fs?.adx ?? td?.volatility?.adx ?? null) as number | null;
      const adxSlope = (fs?.adxSlope ?? td?.volatility?.adxSlope ?? null) as number | null;
      
      const rawK4h = fs?.stochRsiK4h ?? (td?.stochasticRsi?.["4h"] as { k?: number } | undefined)?.k;
      const rawK1h = fs?.stochRsiK1h ?? fs?.stochRsiK ?? (td?.stochasticRsi?.["1h"] as { k?: number } | undefined)?.k;
      const stochK4h = typeof rawK4h === "number" ? rawK4h : null;
      const stochK1h = typeof rawK1h === "number" ? rawK1h : null;

      const adxScore = computeADXProximity(adx);
      const stochScore = computeStochProximity(stochK4h, stochK1h);
      const momentumScore = computeMomentumProximity(signal);

      // Count unique gates blocking this symbol
      const allRejections = allBySymbol.get(symbol) || [];
      const uniqueGates = new Set(allRejections.map(r => r.rejection_reason.split(":")[0].trim()));
      const gateCount = uniqueGates.size;

      // Gate penalty based on worst gate
      const gatePenalty = getGatePenalty(signal.rejection_reason);
      // Additional penalty for multiple gates
      const multiGatePenalty = Math.min(15, (gateCount - 1) * 5);

      const rawScore = (adxScore * 0.25) + (stochScore * 0.25) + (momentumScore * 0.20) + (100 * 0.15) - gatePenalty - multiGatePenalty;
      const score = Math.max(0, Math.min(100, Math.round(rawScore)));

      const direction = (fs?.derivedDirection ?? fs?.direction ?? td?.direction ?? null) as string | null;
      
      // Derive a human-readable status
      const reason = signal.rejection_reason.toLowerCase();
      let status = "Waiting";
      if (reason.includes("tier_0") || reason.includes("deep_")) status = "StochRSI recovery needed";
      else if (reason.includes("near_24h") || reason.includes("near_extreme")) status = "Near price extreme";
      else if (reason.includes("move_exhausted")) status = "Move exhausted";
      else if (reason.includes("no_clear") || reason.includes("no_trade")) status = "No direction";
      else if (reason.includes("adx_too_low")) status = "ADX expanding";
      else if (reason.includes("range_compression")) status = "Compression regime";
      else if (reason.includes("momentum")) status = "Momentum opposing";
      else if (reason.includes("htf")) status = "HTF misaligned";
      else status = signal.rejection_reason.split(":")[0].slice(0, 25);

      results.push({
        symbol,
        score,
        status,
        primaryGate: signal.rejection_reason.split(":")[0].trim(),
        adx,
        adxSlope,
        stochK4h,
        stochK1h,
        direction,
        components: { adxScore, stochScore, momentumScore, gateCount },
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }, [blockedSignals]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5" />
            Signal Proximity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  if (proximities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5" />
            Signal Proximity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground text-sm">No rejection data in the last 3 hours</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-muted-foreground" />
          Signal Proximity
        </CardTitle>
        <CardDescription>How close each symbol is to generating a trade signal</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {proximities.map((p) => (
          <TooltipProvider key={p.symbol}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${getProximityBg(p.score)} cursor-default`}>
                  {/* Symbol */}
                  <span className="font-mono text-sm font-medium w-20 flex-shrink-0">{p.symbol.replace("USDT", "")}</span>
                  
                  {/* Score + Bar */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate">{p.status}</span>
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(p.score)}
                        <span className={`font-mono text-sm font-bold ${getProximityColor(p.score)}`}>{p.score}</span>
                      </div>
                    </div>
                    <ProximityBar score={p.score} />
                  </div>
                  
                  {/* Label badge */}
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 flex-shrink-0 ${getProximityBg(p.score)}`}>
                    {getProximityLabel(p.score)}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <div className="space-y-1 text-xs">
                  <div className="font-medium">{p.symbol} — Score Breakdown</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <span className="text-muted-foreground">ADX proximity:</span>
                    <span>{p.components.adxScore} {p.adx !== null ? `(${p.adx.toFixed(1)})` : ""}</span>
                    <span className="text-muted-foreground">StochRSI proximity:</span>
                    <span>{p.components.stochScore} {p.stochK4h !== null ? `(4h K=${p.stochK4h.toFixed(1)})` : ""}</span>
                    <span className="text-muted-foreground">Momentum score:</span>
                    <span>{p.components.momentumScore}</span>
                    <span className="text-muted-foreground">Active gates:</span>
                    <span>{p.components.gateCount}</span>
                    {p.adxSlope !== null && (
                      <>
                        <span className="text-muted-foreground">ADX slope:</span>
                        <span className={p.adxSlope > 0 ? "text-green-400" : "text-red-400"}>
                          {p.adxSlope >= 0 ? "+" : ""}{p.adxSlope.toFixed(2)}
                        </span>
                      </>
                    )}
                    {p.direction && (
                      <>
                        <span className="text-muted-foreground">Direction:</span>
                        <span>{p.direction.toUpperCase()}</span>
                      </>
                    )}
                  </div>
                  <div className="text-muted-foreground pt-1 border-t border-border/50">Primary gate: {p.primaryGate}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </CardContent>
    </Card>
  );
});
