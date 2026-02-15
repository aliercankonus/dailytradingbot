import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity,
  Zap,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Gauge,
  AlertTriangle,
  Ban,
  Layers,
  Target,
  Minimize2,
  Info,
} from "lucide-react";
import { useState } from "react";
import { useMarketOpportunityDensity } from "@/hooks/useMarketOpportunityDensity";

// Gate labels for human readability
const GATE_LABELS: Record<string, { label: string; icon: typeof Activity; color: string }> = {
  NEAR_24H_LOW_HARD: { label: "Near 24h Low", icon: TrendingDown, color: "text-red-400" },
  NEAR_24H_HIGH_HARD: { label: "Near 24h High", icon: TrendingUp, color: "text-red-400" },
  COUNTER_TREND_PROTECTION: { label: "Counter-Trend Block", icon: Ban, color: "text-orange-400" },
  COMPRESSION_NO_SETUP: { label: "Compression (No Setup)", icon: Minimize2, color: "text-amber-400" },
  LTF_COUNTER_ALIGNED: { label: "LTF Counter-Aligned", icon: Layers, color: "text-amber-400" },
  MOVE_EXHAUSTED_SHORT: { label: "Move Exhausted", icon: AlertTriangle, color: "text-orange-400" },
  MOVE_EXHAUSTED_LONG: { label: "Move Exhausted", icon: AlertTriangle, color: "text-orange-400" },
  ADX_TOO_LOW: { label: "ADX Too Low", icon: Gauge, color: "text-yellow-400" },
  LTF_CONFIRMATION: { label: "LTF Not Confirming", icon: Layers, color: "text-amber-400" },
  NO_MOMENTUM_CONFIRMATION: { label: "No Momentum", icon: Activity, color: "text-yellow-400" },
  HTF_NOT_ALIGNED: { label: "HTF Misaligned", icon: BarChart3, color: "text-orange-400" },
  MOMENTUM_DIRECTION_OPPOSING: { label: "Opposing Momentum", icon: Activity, color: "text-red-400" },
  STOCHRSI_NOT_RISING: { label: "StochRSI Not Rising", icon: TrendingDown, color: "text-yellow-400" },
  STOCHRSI_NOT_FALLING: { label: "StochRSI Not Falling", icon: TrendingUp, color: "text-yellow-400" },
  RANGE_COMPRESSION_BLOCK: { label: "Range Compression", icon: Minimize2, color: "text-amber-400" },
  EARLY_TIER_0_DEEP_OVERBOUGHT: { label: "Deep Overbought", icon: TrendingUp, color: "text-red-400" },
  EARLY_TIER_0_DEEP_OVERSOLD: { label: "Deep Oversold", icon: TrendingDown, color: "text-red-400" },
  MOMENTUM_SLOPE_GATE: { label: "Momentum Slope", icon: Activity, color: "text-orange-400" },
  LTF_SPIKE_PROTECTION: { label: "LTF Spike", icon: Zap, color: "text-amber-400" },
  BOLLINGER_OVEREXTENSION_GATE: { label: "BB Overextended", icon: BarChart3, color: "text-orange-400" },
  BOLLINGER_UNDEREXTENSION_GATE: { label: "BB Underextended", icon: BarChart3, color: "text-orange-400" },
};

const getGateInfo = (gate: string) => {
  return GATE_LABELS[gate] || { label: gate.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), icon: Ban, color: "text-muted-foreground" };
};

// Regime display config
const REGIME_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  TREND_EXPANSION: { label: "Trend Expansion", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  TREND_EXHAUSTION: { label: "Trend Exhaustion", color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  RANGE_COMPRESSION: { label: "Range Compression", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  BREAKOUT_SETUP: { label: "Breakout Setup", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
};

const getRegimeConfig = (regime: string) => {
  return REGIME_CONFIG[regime] || { label: regime, color: "text-muted-foreground", bgColor: "bg-muted/10", borderColor: "border-muted/30" };
};

// Energy Index interpretation
const getEnergyLevel = (energy: number): { label: string; color: string; description: string } => {
  if (energy >= 60) return { label: "Active", color: "text-green-400", description: "Market producing structural opportunities" };
  if (energy >= 40) return { label: "Moderate", color: "text-yellow-400", description: "Mixed conditions, selective opportunities" };
  if (energy >= 20) return { label: "Low", color: "text-orange-400", description: "Market mostly dormant or compressing" };
  return { label: "Dormant", color: "text-red-400", description: "No structural expansion — flat exposure is correct" };
};

// Verdict logic
const getVerdict = (expansionRate: number, energy: number, topGate: string, topGatePct: number): { verdict: string; emoji: string; detail: string } => {
  if (expansionRate < 5 && energy < 25) {
    return { verdict: "System Correct", emoji: "✅", detail: "Market structurally dead. No valid setups existed. Cash is the right position." };
  }
  if (expansionRate < 10 && energy < 40) {
    return { verdict: "Justified Caution", emoji: "🟡", detail: `Low expansion (${expansionRate.toFixed(1)}%). Most rejections from ${getGateInfo(topGate).label} (${topGatePct.toFixed(0)}%). System appropriately selective.` };
  }
  if (expansionRate >= 10 && expansionRate < 25) {
    return { verdict: "Monitor Thresholds", emoji: "🔍", detail: `Moderate expansion (${expansionRate.toFixed(1)}%) detected but filtered. Check if ${getGateInfo(topGate).label} gate is overcalibrated.` };
  }
  if (expansionRate >= 25) {
    return { verdict: "Investigate Filters", emoji: "⚠️", detail: `Significant expansion (${expansionRate.toFixed(1)}%) occurred but was filtered. Dominant blocker: ${getGateInfo(topGate).label}. Consider calibration review.` };
  }
  return { verdict: "Normal Operation", emoji: "📊", detail: "Market conditions within expected parameters." };
};

export const MarketOpportunityDensity = () => {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useMarketOpportunityDensity(days);

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Market Opportunity Density
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const sortedGates = Object.entries(data.rejectionDensity)
    .sort((a, b) => b[1] - a[1]);
  const topGate = sortedGates[0]?.[0] || 'UNKNOWN';
  const topGatePct = data.totalRejections > 0 ? (sortedGates[0]?.[1] || 0) / data.totalRejections * 100 : 0;
  const energyLevel = getEnergyLevel(data.energyIndex);
  const verdict = getVerdict(data.structuralExpansionRate, data.energyIndex, topGate, topGatePct);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Market Opportunity Density
            </CardTitle>
            <CardDescription className="mt-1">
              Was the market structurally dead, or did your filters suppress valid edge?
            </CardDescription>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">24h</SelectItem>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ========== VERDICT BANNER ========== */}
        <div className={`p-3 rounded-lg border ${
          verdict.emoji === '✅' ? 'bg-green-500/10 border-green-500/30' :
          verdict.emoji === '🟡' ? 'bg-yellow-500/10 border-yellow-500/30' :
          verdict.emoji === '⚠️' ? 'bg-orange-500/10 border-orange-500/30' :
          'bg-blue-500/10 border-blue-500/30'
        }`}>
          <div className="flex items-start gap-2">
            <span className="text-xl">{verdict.emoji}</span>
            <div>
              <div className="text-sm font-semibold">{verdict.verdict}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{verdict.detail}</div>
            </div>
          </div>
        </div>

        {/* ========== TOP ROW: Energy + SEC + Rejections ========== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Energy Index */}
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className={`h-4 w-4 ${energyLevel.color}`} />
              <span className="text-xs font-medium">Energy Index</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-[250px] text-xs">
                    Composite: 40% expansion rate + 30% ADX rising + 30% (100% - compression%)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={`text-2xl font-bold font-mono ${energyLevel.color}`}>
              {data.energyIndex.toFixed(1)}
            </div>
            <Badge variant="outline" className={`text-[10px] mt-1 ${energyLevel.color}`}>
              {energyLevel.label}
            </Badge>
            <div className="text-[10px] text-muted-foreground mt-1">{energyLevel.description}</div>
          </div>

          {/* Structural Expansion Rate */}
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-xs font-medium">Expansion Rate</span>
            </div>
            <div className={`text-2xl font-bold font-mono ${
              data.structuralExpansionRate >= 20 ? 'text-green-400' :
              data.structuralExpansionRate >= 10 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {data.structuralExpansionRate.toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {data.regimeDistribution['TREND_EXPANSION']?.count || 0} / {data.totalRegimeRecords} regime snapshots
            </div>
            <Progress 
              value={Math.min(100, data.structuralExpansionRate)} 
              className="h-1.5 mt-2"
            />
          </div>

          {/* Total Rejections */}
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-1.5 mb-2">
              <Ban className="h-4 w-4 text-orange-400" />
              <span className="text-xs font-medium">Total Rejections</span>
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {data.totalRejections}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              across {Object.keys(data.symbolBreakdown).length} symbols, {days}d window
            </div>
          </div>
        </div>

        {/* ========== REGIME DISTRIBUTION ========== */}
        <div>
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            Regime Distribution
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(data.regimeDistribution)
              .sort((a, b) => b[1].pct - a[1].pct)
              .map(([regime, stats]) => {
                const config = getRegimeConfig(regime);
                return (
                  <TooltipProvider key={regime}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`p-2.5 rounded-lg border ${config.bgColor} ${config.borderColor} cursor-help`}>
                          <div className="text-[10px] text-muted-foreground truncate">{config.label}</div>
                          <div className={`text-lg font-bold font-mono ${config.color}`}>
                            {stats.pct.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            {stats.count} snapshots
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs space-y-1">
                        <p><strong>{config.label}</strong></p>
                        <p>Avg ADX: {stats.avgAdx.toFixed(1)}</p>
                        <p>Avg Slope: {stats.avgSlope.toFixed(2)}</p>
                        <p>ADX Rising: {stats.adxRisingPct.toFixed(0)}%</p>
                        <p>In Squeeze: {stats.squeezePct.toFixed(0)}%</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
          </div>
        </div>

        {/* ========== REJECTION DENSITY ========== */}
        <div>
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            Rejection Clustering (Top Gates)
          </div>
          <div className="space-y-1.5">
            {sortedGates.slice(0, 8).map(([gate, count]) => {
              const pct = (count / data.totalRejections) * 100;
              const info = getGateInfo(gate);
              const Icon = info.icon;
              return (
                <div key={gate} className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${info.color}`} />
                  <span className="text-xs w-[140px] sm:w-[180px] truncate">{info.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 30 ? 'bg-red-500' : pct >= 20 ? 'bg-orange-500' : pct >= 10 ? 'bg-yellow-500' : 'bg-muted-foreground/40'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono w-[45px] text-right text-muted-foreground">
                    {count} ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========== SYMBOL BREAKDOWN ========== */}
        <div>
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            Per-Symbol Summary
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(data.symbolBreakdown)
              .sort((a, b) => b[1].rejections - a[1].rejections)
              .map(([symbol, info]) => {
                const gateInfo = getGateInfo(info.dominantGate);
                return (
                  <div key={symbol} className="p-2 rounded border border-border bg-muted/20">
                    <div className="text-xs font-medium">{symbol.replace('USDT', '')}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {info.rejections} rejections
                    </div>
                    <Badge variant="outline" className={`text-[9px] mt-1 ${gateInfo.color} border-current/30`}>
                      {gateInfo.label}
                    </Badge>
                  </div>
                );
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketOpportunityDensity;
