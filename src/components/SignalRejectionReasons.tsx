import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Activity,
  Minimize2,
  Minus,
  BarChart3,
  Target,
  Zap,
  Layers,
  Timer,
  CheckCircle2,
  XCircle,
  Gauge,
  ArrowUpCircle,
  ArrowDownCircle,
  Bot,
  Loader2,
  AlertTriangle,
  Ban,
  DollarSign,
  TrendingUp as VolumeIcon,
  Scale,
} from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AIValidationResult {
  isValid: boolean;
  issues: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
}

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
  ai_analysis: AIValidationResult | null;
}

interface ScoreBreakdown {
  adx: { score: number; max: number };
  momentum: { score: number; max: number };
  alignment: { score: number; max: number };
  technical: { score: number; max: number };
  entry: { score: number; max: number };
  volume: { score: number; max: number };
  orderFlow: { score: number; max: number };
  confidencePenalty: number;
  directionBonus: number;
  subtotal: number;
  total: number;
  minRequired: number;
}

const parseBreakdown = (breakdown: string): ScoreBreakdown | null => {
  if (!breakdown) return null;
  
  // Parse format like "ADX:22/25 MOM:0/20 ALIGN:12/20 TECH:10/15 ENTRY:12/25 CONF_PEN:-4 DIR_BONUS:+3"
  const pattern = /(\w+):(-?\d+)\/(\d+)/g;
  const scores: Record<string, { score: number; max: number }> = {};
  let match;
  
  while ((match = pattern.exec(breakdown)) !== null) {
    const [, key, score, max] = match;
    scores[key.toLowerCase()] = { score: parseInt(score), max: parseInt(max) };
  }
  
  // Parse CONF_PEN:-4 format (no max value)
  const confPenMatch = breakdown.match(/CONF_PEN:(-?\d+)/);
  const confidencePenalty = confPenMatch ? parseInt(confPenMatch[1]) : 0;
  
  // Parse DIR_BONUS:+3 format (no max value)
  const dirBonusMatch = breakdown.match(/DIR_BONUS:\+?(-?\d+)/);
  const directionBonus = dirBonusMatch ? parseInt(dirBonusMatch[1]) : 0;
  
  if (Object.keys(scores).length === 0) return null;
  
  const subtotal = (scores.adx?.score ?? 0) + (scores.mom?.score ?? 0) + (scores.align?.score ?? 0) + (scores.tech?.score ?? 0) + (scores.entry?.score ?? 0) + (scores.vol?.score ?? 0) + (scores.of?.score ?? 0);
  
  return {
    adx: scores.adx || { score: 0, max: 25 },
    momentum: scores.mom || { score: 0, max: 20 },
    alignment: scores.align || { score: 0, max: 20 },
    technical: scores.tech || { score: 0, max: 15 },
    entry: scores.entry || { score: 0, max: 25 },
    volume: scores.vol || { score: 0, max: 10 },
    orderFlow: scores.of || { score: 0, max: 10 },
    confidencePenalty,
    directionBonus,
    subtotal,
    total: subtotal + confidencePenalty + directionBonus,
    minRequired: 50,
  };
};

const coerceNumeric = (value: any, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === "object") {
    // Try to extract numeric value from common object structures
    const candidates = [
      value?.score,
      value?.value,
      value?.confidence,
      value?.weightedConsistency,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    // Try nested score (e.g., {score: {score: 45}})
    if (typeof value?.score === "object" && typeof value?.score?.score === "number") {
      return value.score.score;
    }
  }
  return fallback;
};

// Helper to extract trend direction from timeframe data
const extractTimeframeTrend = (trendData: any, timeframe: string): string => {
  // For 4h, use primaryTrend first since it represents the dominant 4h trend
  if (timeframe === '4h' && trendData?.primaryTrend) {
    return trendData.primaryTrend;
  }
  
  // Try indicators.emaSignal first (actual structure from calculate-trend)
  const emaSignal = trendData?.timeframes?.[timeframe]?.indicators?.emaSignal;
  if (emaSignal) return emaSignal;
  
  // Try direct trend property
  const directTrend = trendData?.timeframes?.[timeframe]?.trend;
  if (directTrend) return directTrend;
  
  // Fallback to primaryTrend for overall direction
  if (trendData?.primaryTrend) return trendData.primaryTrend;
  
  return "unknown";
};

// Helper to extract confidence from various data structures
const extractConfidence = (filtersStatus: any, trendData: any): number | undefined => {
  // Direct numeric values
  if (typeof filtersStatus?.confidence === "number") return filtersStatus.confidence;
  if (typeof trendData?.confidence === "number") return trendData.confidence;
  
  // Object with score property
  if (typeof filtersStatus?.confidence?.score === "number") return filtersStatus.confidence.score;
  if (typeof trendData?.confidence?.score === "number") return trendData.confidence.score;
  
  // Weighted consistency (common in trend data)
  if (typeof trendData?.weightedConsistency === "number") return trendData.weightedConsistency;
  
  // True alignment score
  if (typeof trendData?.trueAlignment?.score === "number") return trendData.trueAlignment.score;
  
  // Average of timeframe confidences
  const conf4h = trendData?.timeframes?.['4h']?.confidence;
  const conf1h = trendData?.timeframes?.['1h']?.confidence;
  if (typeof conf4h === "number" && typeof conf1h === "number") {
    return Math.round((conf4h * 0.6 + conf1h * 0.4)); // 4h weighted higher
  }
  if (typeof conf4h === "number") return conf4h;
  if (typeof conf1h === "number") return conf1h;
  
  return undefined;
};

const ScoreBar = ({
  label,
  score,
  max,
  icon: Icon,
}: {
  label: string;
  score: number;
  max: number;
  icon: React.ElementType;
}) => {
  const percentage = (score / max) * 100;
  const getColor = () => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    if (percentage >= 40) return "bg-orange-500";
    return "bg-red-500";
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px]">
              <div 
                className={`h-full rounded-full transition-all ${getColor()}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {score}/{max}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>{label}: {score}/{max} ({percentage.toFixed(0)}%)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Market Regime Details component for early rejections
const MarketRegimeDetails = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, undefined as any);
  const confidence = extractConfidence(filtersStatus, trendData);
  const consistency = coerceNumeric(filtersStatus?.consistency ?? trendData?.trueAlignment?.score, undefined as any);
  const regime = filtersStatus?.regime;
  
  if (adx === undefined && confidence === undefined && !regime) return null;
  
  const getRegimeColor = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trending': return 'text-green-500';
      case 'ranging': return 'text-yellow-500';
      case 'choppy': return 'text-red-500';
      case 'volatile': return 'text-orange-500';
      default: return 'text-muted-foreground';
    }
  };
  
  const getRegimeIcon = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trending': return TrendingUp;
      case 'ranging': return Activity;
      case 'choppy': return AlertTriangle;
      case 'volatile': return Zap;
      default: return Activity;
    }
  };
  
  const RegimeIcon = getRegimeIcon(regime);
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <RegimeIcon className={`h-3.5 w-3.5 ${getRegimeColor(regime)}`} />
          <span className="text-xs font-medium">Market Regime</span>
        </div>
        <Badge 
          variant="outline" 
          className={`text-[10px] px-1.5 py-0 ${getRegimeColor(regime)}`}
        >
          {regime || 'Unknown'}
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
        {adx !== undefined && typeof adx === 'number' && (
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">ADX</div>
            <div className={`text-xs font-mono font-medium ${adx >= 25 ? 'text-green-500' : adx >= 20 ? 'text-yellow-500' : 'text-red-500'}`}>
              {adx.toFixed(1)}
            </div>
          </div>
        )}
        {confidence !== undefined && typeof confidence === 'number' && (
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">Confidence</div>
            <div className={`text-xs font-mono font-medium ${confidence >= 60 ? 'text-green-500' : confidence >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>
              {confidence}%
            </div>
          </div>
        )}
        {consistency !== undefined && typeof consistency === 'number' && (
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">Consistency</div>
            <div className={`text-xs font-mono font-medium ${consistency >= 50 ? 'text-green-500' : consistency >= 30 ? 'text-yellow-500' : 'text-red-500'}`}>
              {consistency}%
            </div>
          </div>
        )}
      </div>
      
      {filtersStatus?.reason && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
          {filtersStatus.reason}
        </div>
      )}
    </div>
  );
};

const QualityScoreBreakdown = ({ filtersStatus }: { filtersStatus: any }) => {
  const breakdown = parseBreakdown(filtersStatus?.breakdown);
  const qualityScore = filtersStatus?.qualityScore;
  const minRequired = filtersStatus?.minRequired || 50;
  
  // If no breakdown and no quality score, show regime details instead
  if (!breakdown && qualityScore === undefined) {
    return <MarketRegimeDetails filtersStatus={filtersStatus} />;
  }
  
  const totalScore = breakdown?.total || qualityScore || 0;
  const isPassing = totalScore >= minRequired;
  const hasConfidencePenalty = breakdown && breakdown.confidencePenalty !== 0;
  const hasDirectionBonus = breakdown && breakdown.directionBonus > 0;
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded-md">
      {/* Total Score Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Quality Score</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant={isPassing ? "default" : "destructive"} 
                className="text-[10px] px-1.5 py-0 cursor-help"
              >
                {totalScore}/100 {isPassing ? "✓" : `(min: ${minRequired})`}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              {breakdown ? (
                <div className="space-y-1">
                  <p className="font-medium">Score Calculation:</p>
                  <p className="font-mono text-[10px]">
                    {breakdown.adx.score} + {breakdown.momentum.score} + {breakdown.alignment.score} + {breakdown.technical.score} + {breakdown.entry.score} + {breakdown.volume.score} + {breakdown.orderFlow.score}
                    {hasConfidencePenalty && ` ${breakdown.confidencePenalty >= 0 ? '+' : ''}${breakdown.confidencePenalty}`}
                    {hasDirectionBonus && ` +${breakdown.directionBonus}`}
                    {' = '}{totalScore}
                  </p>
                </div>
              ) : (
                <p>Quality score from strategy analyzer</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Overall Progress */}
      <div className="relative">
        <Progress 
          value={Math.max(0, totalScore)} 
          className="h-2"
        />
        {/* Min threshold marker */}
        <div 
          className="absolute top-0 h-2 w-0.5 bg-foreground/50"
          style={{ left: `${minRequired}%` }}
        />
      </div>
      
      {/* Individual Score Breakdown */}
      {breakdown && (
        <div className="space-y-1 pt-1 border-t border-border/50">
          {/* Component scores */}
          <div className="grid grid-cols-1 gap-1">
            <ScoreBar 
              label="ADX Strength" 
              score={breakdown.adx.score} 
              max={breakdown.adx.max} 
              icon={Activity}
            />
            <ScoreBar 
              label="Momentum" 
              score={breakdown.momentum.score} 
              max={breakdown.momentum.max} 
              icon={Zap}
            />
            <ScoreBar 
              label="Alignment" 
              score={breakdown.alignment.score} 
              max={breakdown.alignment.max} 
              icon={Layers}
            />
            <ScoreBar 
              label="Technical" 
              score={breakdown.technical.score} 
              max={breakdown.technical.max} 
              icon={Target}
            />
            <ScoreBar 
              label="Entry Timing" 
              score={breakdown.entry.score} 
              max={breakdown.entry.max} 
              icon={Timer}
            />
            <ScoreBar 
              label="Volume" 
              score={breakdown.volume.score} 
              max={breakdown.volume.max} 
              icon={VolumeIcon}
            />
            <ScoreBar 
              label="Order Flow" 
              score={breakdown.orderFlow.score} 
              max={breakdown.orderFlow.max} 
              icon={Scale}
            />
          </div>
          
          {/* Subtotal, Bonus/Penalty section */}
          {(hasConfidencePenalty || hasDirectionBonus) && (
            <div className="pt-1 mt-1 border-t border-border/30 space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-mono">{breakdown.subtotal}/100</span>
              </div>
              {hasDirectionBonus && (
                <div className="flex items-center justify-between text-[10px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-green-400 cursor-help flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          SELL Bonus:
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px]">
                        <p>+3 bonus for SHORT/SELL signals based on historical win rate analysis (38% vs 31% for BUY).</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-mono text-green-400">+{breakdown.directionBonus}</span>
                </div>
              )}
              {hasConfidencePenalty && (
                <div className="flex items-center justify-between text-[10px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-400 cursor-help flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Confidence Penalty:
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px]">
                        <p>Penalty applied when confidence is too high (&gt;70%), which may indicate trend exhaustion rather than trend beginning.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-mono text-red-400">{breakdown.confidencePenalty}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] font-medium pt-0.5">
                <span className="text-muted-foreground">Final Score:</span>
                <span className={`font-mono ${isPassing ? 'text-green-400' : 'text-red-400'}`}>
                  {totalScore}/100
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Market Regime */}
      {filtersStatus?.regime && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
          <span>Market:</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
            {filtersStatus.regime}
          </Badge>
        </div>
      )}
    </div>
  );
};

// Execution Rejection Display - for signals rejected during trade execution
const ExecutionRejectionDisplay = ({ filtersStatus }: { filtersStatus: any }) => {
  const filter = filtersStatus?.executionFilter || 'Unknown';
  const signalType = filtersStatus?.signalType;
  const strategyName = filtersStatus?.strategyName;
  const qualityScore = filtersStatus?.qualityScore;
  
  return (
    <div className="space-y-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded-md">
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-medium text-orange-400">Execution Blocked</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {signalType && (
          <div>
            <span className="text-muted-foreground">Signal: </span>
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${signalType === 'long' ? 'text-green-400' : 'text-red-400'}`}>
              {signalType.toUpperCase()}
            </Badge>
          </div>
        )}
        {strategyName && (
          <div className="truncate">
            <span className="text-muted-foreground">Strategy: </span>
            <span className="font-medium">{strategyName}</span>
          </div>
        )}
        {qualityScore !== undefined && (
          <div>
            <span className="text-muted-foreground">Quality: </span>
            <span className={`font-mono ${qualityScore >= 50 ? 'text-green-400' : 'text-red-400'}`}>{qualityScore}</span>
          </div>
        )}
      </div>
      {/* Show specific filter data */}
      {filtersStatus?.currentPrice && filtersStatus?.entryPrice && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
          Entry: ${filtersStatus.entryPrice.toFixed(2)} → Current: ${filtersStatus.currentPrice.toFixed(2)}
        </div>
      )}
      {filtersStatus?.adx !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          ADX: {filtersStatus.adx.toFixed?.(1) || filtersStatus.adx}
        </div>
      )}
      {filtersStatus?.reversalScore !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          Reversal Score: {filtersStatus.reversalScore}/100
        </div>
      )}
      {filtersStatus?.riskRewardRatio !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          R:R Ratio: {filtersStatus.riskRewardRatio.toFixed?.(2) || filtersStatus.riskRewardRatio}:1
        </div>
      )}
    </div>
  );
};

const MaxTradesDisplay = ({ filtersStatus }: { filtersStatus: any }) => {
  const current = filtersStatus?.currentTradeCount;
  const max = filtersStatus?.maxTradesPerSymbol;
  
  if (current === undefined || max === undefined) return null;
  
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">Active Trades</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {current}/{max}
          </Badge>
        </div>
        <Progress value={(current / max) * 100} className="h-1.5" />
      </div>
    </div>
  );
};

const AlignmentBreakdownDisplay = ({ alignmentBreakdown }: { alignmentBreakdown: any }) => {
  if (!alignmentBreakdown) return null;
  
  const { directionScore, indicatorScore, penaltyScore } = alignmentBreakdown;
  const total = (directionScore || 0) + (indicatorScore || 0) - (penaltyScore || 0);
  
  const getScoreStyles = (score: number, max: number) => {
    const pct = (score / max) * 100;
    if (pct >= 80) return { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', bar: 'bg-green-500' };
    if (pct >= 60) return { text: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
    if (pct >= 40) return { text: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', bar: 'bg-orange-500' };
    return { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', bar: 'bg-red-500' };
  };
  
  const dirStyles = getScoreStyles(directionScore || 0, 60);
  const indStyles = getScoreStyles(indicatorScore || 0, 25);
  const totalStyles = getScoreStyles(total, 85);
  
  return (
    <div className="space-y-1.5 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Alignment Breakdown</span>
        <Badge 
          variant="outline"
          className={`text-[9px] px-1.5 py-0 ${totalStyles.text} ${totalStyles.bg} ${totalStyles.border}`}
        >
          {total}/85
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${dirStyles.bg} ${dirStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">Direction</div>
                <div className={`text-xs font-mono font-medium ${dirStyles.text}`}>
                  {directionScore || 0}/60
                </div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${dirStyles.bar}`}
                    style={{ width: `${((directionScore || 0) / 60) * 100}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>How many timeframes agree on trend direction</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${indStyles.bg} ${indStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">Indicators</div>
                <div className={`text-xs font-mono font-medium ${indStyles.text}`}>
                  {indicatorScore || 0}/25
                </div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${indStyles.bar}`}
                    style={{ width: `${((indicatorScore || 0) / 25) * 100}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>MACD and RSI agreement across timeframes</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${(penaltyScore || 0) > 0 ? 'bg-red-500/20 border-red-500/30' : 'bg-green-500/20 border-green-500/30'}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">Penalty</div>
                <div className={`text-xs font-mono font-medium ${(penaltyScore || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {(penaltyScore || 0) > 0 ? `-${penaltyScore}` : '0'}
                </div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${(penaltyScore || 0) > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: (penaltyScore || 0) > 0 ? `${Math.min((penaltyScore / 30) * 100, 100)}%` : '100%' }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Deductions for opposing timeframe trends</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

const MarketRegimeDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const coerceNumber = (value: any): number | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    if (typeof value === "object") {
      // Try multiple possible numeric properties
      const candidates = [value?.score, value?.value, value?.confidence, value?.weightedConsistency];
      for (const candidate of candidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          return candidate;
        }
      }
    }
    return undefined;
  };

  const parsePercentFromText = (text: any, key: string): number | undefined => {
    if (typeof text !== "string") return undefined;
    const m = text.match(new RegExp(`${key}\\s*\\(?\\s*([0-9]+(?:\\.[0-9]+)?)%`, "i"));
    if (!m?.[1]) return undefined;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : undefined;
  };

  const reasonText = filtersStatus?.reason;

  const adx = coerceNumber(filtersStatus?.adx ?? trendData?.volatility?.adx);
  
  // Use extractConfidence helper for robust confidence extraction
  const extractedConf = extractConfidence(filtersStatus, trendData);
  const confidence = extractedConf !== undefined ? extractedConf : 
    parsePercentFromText(reasonText, "confidence");

  const trendConsistency =
    coerceNumber(
      filtersStatus?.trendConsistency ??
        filtersStatus?.consistency ??
        filtersStatus?.trend_consistency ??
        filtersStatus?.alignment ??
        filtersStatus?.alignmentScore ??
        trendData?.trueAlignment?.score ??
        trendData?.weightedConsistency ??
        trendData?.marketStructure?.confidence ??
        trendData?.trendConsistency ??
        trendData?.consistency ??
        trendData?.trend_consistency ??
        trendData?.alignmentScore,
    ) ??
    parsePercentFromText(reasonText, "consistency");
  const regime = filtersStatus?.regime;
  const minConfidence = coerceNumber(filtersStatus?.minConfidence ?? filtersStatus?.min_confidence) ?? 60;
  const minConsistency = coerceNumber(filtersStatus?.minConsistency ?? filtersStatus?.min_consistency) ?? 50;
  const alignmentBreakdown = trendData?.trueAlignment?.breakdown || trendData?.alignmentBreakdown || filtersStatus?.alignmentBreakdown;
  const momentum = trendData?.momentum || filtersStatus?.momentum;
  const momentumState = momentum?.state || 'none';

  if (adx === undefined && confidence === undefined && trendConsistency === undefined) return null;

  // Pass/fail checks
  const adxPassing = (adx ?? 0) >= 20;
  const confidencePassing = (confidence ?? 0) >= minConfidence;
  const alignmentPassing = (trendConsistency ?? 0) >= minConsistency;
  const momentumPassing = momentumState === 'confirmed';
  const allPassing = adxPassing && confidencePassing && alignmentPassing && momentumPassing;
  const passCount = [adxPassing, confidencePassing, alignmentPassing, momentumPassing].filter(Boolean).length;
  
  // ADX scoring: 0-15 (red), 15-20 (orange), 20-30 (yellow), 30+ (green)
  const getAdxStyles = (value: number) => {
    if (value >= 30) return { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', bar: 'bg-green-500' };
    if (value >= 20) return { text: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
    if (value >= 15) return { text: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', bar: 'bg-orange-500' };
    return { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', bar: 'bg-red-500' };
  };
  
  // Confidence/Alignment: based on percentage vs min threshold
  const getPercentStyles = (value: number, min: number) => {
    const ratio = value / min;
    if (ratio >= 1.2) return { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', bar: 'bg-green-500' };
    if (ratio >= 1.0) return { text: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
    if (ratio >= 0.8) return { text: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', bar: 'bg-orange-500' };
    return { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', bar: 'bg-red-500' };
  };
  
  // Momentum state styling
  const getMomentumStyles = (state: string) => {
    if (state === 'confirmed') return { text: 'text-green-400', icon: true };
    if (state === 'building') return { text: 'text-yellow-400', icon: false };
    return { text: 'text-red-400', icon: false };
  };
  
  // Regime badge styling
  const getRegimeStyles = (r: string) => {
    if (r === 'trending') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (r === 'weak') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };
  
  const adxStyles = getAdxStyles(adx || 0);
  const confStyles = getPercentStyles(confidence || 0, minConfidence);
  const alignStyles = getPercentStyles(trendConsistency || 0, minConsistency);
  const momStyles = getMomentumStyles(momentumState);
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Market Regime</span>
        </div>
        <Badge 
          variant="outline" 
          className={`text-[10px] px-1.5 py-0 capitalize ${getRegimeStyles(regime || 'weak')}`}
        >
          {regime || "weak"}
        </Badge>
      </div>
      
      {/* Compact Summary Row */}
      <div className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${allPassing ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Status:</span>
          <div className="flex items-center gap-1">
            {adxPassing ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span className={adxPassing ? 'text-green-400' : 'text-red-400'}>ADX</span>
          </div>
          <div className="flex items-center gap-1">
            {confidencePassing ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span className={confidencePassing ? 'text-green-400' : 'text-red-400'}>Conf</span>
          </div>
          <div className="flex items-center gap-1">
            {alignmentPassing ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span className={alignmentPassing ? 'text-green-400' : 'text-red-400'}>Align</span>
          </div>
          <div className="flex items-center gap-1">
            {momentumPassing ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : momentumState === 'building' ? (
              <Zap className="h-3 w-3 text-yellow-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span className={momStyles.text}>Mom</span>
            <Badge 
              variant="outline" 
              className={`text-[8px] px-1 py-0 capitalize ${
                momentumState === 'confirmed' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                momentumState === 'building' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                'bg-red-500/20 text-red-400 border-red-500/30'
              }`}
            >
              {momentumState}
            </Badge>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={`text-[9px] px-1 py-0 ${allPassing ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
        >
          {passCount}/4
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${adxStyles.bg} ${adxStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">ADX</div>
                <div className={`text-sm font-mono font-medium ${adxStyles.text}`}>
                  {typeof adx === 'number' && !isNaN(adx) ? adx.toFixed(1) : '—'}
                </div>
                <div className="text-[8px] text-muted-foreground">min: 20</div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${adxStyles.bar}`}
                    style={{ width: `${Math.min((adx || 0) / 50 * 100, 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Trend strength indicator. ≥20 required, ≥30 is strong</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${confStyles.bg} ${confStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">Confidence</div>
                <div className={`text-sm font-mono font-medium ${confStyles.text}`}>
                  {!isNaN(Number(confidence)) && confidence !== null && confidence !== undefined ? Number(confidence) : '—'}%
                </div>
                <div className="text-[8px] text-muted-foreground">min: {minConfidence}%</div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${confStyles.bar}`}
                    style={{ width: `${Math.min((confidence || 0), 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Signal confidence based on trend strength and indicators</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${alignStyles.bg} ${alignStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">Alignment</div>
                <div className={`text-sm font-mono font-medium ${alignStyles.text}`}>
                  {!isNaN(Number(trendConsistency)) && trendConsistency !== null && trendConsistency !== undefined ? Number(trendConsistency).toFixed(0) : '—'}%
                </div>
                <div className="text-[8px] text-muted-foreground">min: {minConsistency}%</div>
                <div className="mt-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${alignStyles.bar}`}
                    style={{ width: `${Math.min((trendConsistency || 0), 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Multi-timeframe trend agreement score</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Enhanced Confidence Calculation Breakdown */}
      {(trendData?.baseConfidence !== undefined || filtersStatus?.baseConfidence !== undefined) && (
        <div className="space-y-1.5 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Confidence Calculation</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${confStyles.text} ${confStyles.bg} ${confStyles.border}`}>
              = {!isNaN(Number(confidence)) ? Number(confidence) : 0}%
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center p-1.5 rounded border bg-muted/30 border-border/50">
                    <div className="text-[9px] text-muted-foreground mb-0.5">Base</div>
                    <div className="text-xs font-mono font-medium text-foreground">
                      {(trendData?.baseConfidence || filtersStatus?.baseConfidence || 0).toFixed(0)}%
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  <p>Base confidence from multi-timeframe alignment</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`text-center p-1.5 rounded border ${
                    (trendData?.adxBoost || filtersStatus?.adxBoost || 0) > 0 
                      ? 'bg-green-500/20 border-green-500/30' 
                      : 'bg-muted/30 border-border/50'
                  }`}>
                    <div className="text-[9px] text-muted-foreground mb-0.5">ADX Boost</div>
                    <div className={`text-xs font-mono font-medium ${
                      (trendData?.adxBoost || filtersStatus?.adxBoost || 0) > 0 ? 'text-green-400' : 'text-muted-foreground'
                    }`}>
                      +{(trendData?.adxBoost || filtersStatus?.adxBoost || 0).toFixed(0)}%
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  <p>Bonus from strong ADX (≥30: +5%, ≥40: +10%)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`text-center p-1.5 rounded border ${
                    (trendData?.volumeBoost || filtersStatus?.volumeBoost || 0) > 0 
                      ? 'bg-blue-500/20 border-blue-500/30' 
                      : 'bg-muted/30 border-border/50'
                  }`}>
                    <div className="text-[9px] text-muted-foreground mb-0.5">Vol Boost</div>
                    <div className={`text-xs font-mono font-medium ${
                      (trendData?.volumeBoost || filtersStatus?.volumeBoost || 0) > 0 ? 'text-blue-400' : 'text-muted-foreground'
                    }`}>
                      +{(trendData?.volumeBoost || filtersStatus?.volumeBoost || 0).toFixed(0)}%
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  <p>Bonus from volume confirmation (spike: +3%, confirms direction: +2%)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
      
      {/* Alignment Breakdown Section */}
      <AlignmentBreakdownDisplay alignmentBreakdown={alignmentBreakdown} />
    </div>
  );
};

// ============= HARD GATE DISPLAY COMPONENTS =============

const HardBlockStochRsiDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h, 0);
  const stochRsiD = coerceNumeric(filtersStatus?.stochRsiD4h, 0);
  const threshold = coerceNumeric(filtersStatus?.threshold, 98);
  const message = filtersStatus?.message || "StochRSI at ceiling - nowhere to rise";
  const gate = filtersStatus?.gate || "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK";
  
  const isOverbought = gate.includes("OVERBOUGHT") || gate === "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK";
  const isOversold = gate.includes("OVERSOLD") || gate === "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK";
  
  // Get 4h stochRSI data - prefer filters_status then trend_data
  const stoch4h = trendData?.stochasticRsi?.['4h'] || {};
  const stochK = stochRsiK || stoch4h?.k || 0;
  const stochD = stochRsiD || stoch4h?.d || 0;
  
  // Get reversal score breakdown from filters_status
  const reversalScore = coerceNumeric(filtersStatus?.reversal_score, 0);
  const reversalDecision = filtersStatus?.reversal_decision || "";
  const reversalBreakdown = filtersStatus?.reversal_breakdown || {};
  const reversalReasons = filtersStatus?.reversal_reasons || [];
  
  // Additional context
  const trend = filtersStatus?.trend || trendData?.primaryTrend || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx, 0);
  const momentumState = filtersStatus?.momentum_state || trendData?.momentum?.state || "unknown";
  const percentB = coerceNumeric(filtersStatus?.percentB, 50);
  
  const getStochRsiColor = (k: number) => {
    if (k >= 95) return "text-red-500";
    if (k >= 80) return "text-orange-400";
    if (k <= 5) return "text-blue-500";
    if (k <= 20) return "text-cyan-400";
    return "text-yellow-400";
  };
  
  const getReversalColor = (score: number) => {
    if (score >= 60) return "text-red-500";
    if (score >= 40) return "text-orange-400";
    return "text-green-400";
  };
  
  return (
    <div className="space-y-3 p-3 bg-red-500/10 rounded-md border border-red-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Ban className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold text-red-400">
            HARD BLOCK: StochRSI at {isOversold ? "Floor" : "Ceiling"}
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          K {isOversold ? "≤" : "≥"} {threshold}
        </Badge>
      </div>
      
      {/* StochRSI Visual */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">4h StochRSI K</span>
          <span className={`font-mono font-bold ${getStochRsiColor(stochK)}`}>
            {stochK.toFixed(1)} / 100
          </span>
        </div>
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          {/* Overbought zone background */}
          <div 
            className="absolute right-0 top-0 h-full bg-red-500/20"
            style={{ width: `${100 - (isOversold ? 100 : threshold)}%` }}
          />
          {/* Oversold zone background */}
          <div 
            className="absolute left-0 top-0 h-full bg-blue-500/20"
            style={{ width: `${isOversold ? threshold : 2}%` }}
          />
          {/* Current K value */}
          <div 
            className={`h-full rounded-full transition-all ${
              stochK >= 95 ? 'bg-red-500' : 
              stochK >= 80 ? 'bg-orange-500' : 
              stochK <= 5 ? 'bg-blue-500' :
              stochK <= 20 ? 'bg-cyan-500' :
              'bg-yellow-500'
            }`}
            style={{ width: `${stochK}%` }}
          />
          {/* Threshold marker */}
          <div 
            className={`absolute top-0 h-full w-0.5 ${isOversold ? 'bg-blue-400' : 'bg-red-400'}`}
            style={{ left: `${threshold}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span className={isOversold ? "text-blue-400" : ""}>
            {isOversold ? `Block Zone (≤${threshold})` : "Oversold (0-20)"}
          </span>
          <span className={!isOversold ? "text-red-400" : ""}>
            {!isOversold ? `Block Zone (${threshold}+)` : "Max (100)"}
          </span>
        </div>
      </div>
      
      {/* K/D Values + Context */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">K</div>
          <div className={`text-xs font-mono font-bold ${getStochRsiColor(stochK)}`}>
            {stochK.toFixed(1)}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">D</div>
          <div className={`text-xs font-mono font-bold ${getStochRsiColor(stochD)}`}>
            {stochD.toFixed(1)}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">ADX</div>
          <div className="text-xs font-mono font-bold text-muted-foreground">
            {adx.toFixed(1)}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">%B</div>
          <div className="text-xs font-mono font-bold text-muted-foreground">
            {percentB.toFixed(0)}
          </div>
        </div>
      </div>
      
      {/* Reversal Score Breakdown - only show if available */}
      {reversalScore > 0 && (
        <div className="space-y-2 border-t border-muted/30 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Reversal Risk Score</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-mono font-bold ${getReversalColor(reversalScore)}`}>
                {reversalScore}/100
              </span>
              {reversalDecision && (
                <Badge 
                  variant={reversalDecision === "BLOCK" ? "destructive" : reversalDecision === "REDUCE" ? "secondary" : "outline"}
                  className="text-[9px] px-1 py-0"
                >
                  {reversalDecision}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Score Breakdown */}
          {Object.keys(reversalBreakdown).length > 0 && (
            <div className="grid grid-cols-2 gap-1 text-[9px]">
              {Object.entries(reversalBreakdown).map(([key, value]) => (
                <div key={key} className="flex justify-between px-1.5 py-0.5 bg-muted/20 rounded">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className={`font-mono ${Number(value) > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                    +{Number(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Reversal Reasons */}
          {reversalReasons.length > 0 && (
            <div className="space-y-0.5">
              {reversalReasons.slice(0, 3).map((reason: string, idx: number) => (
                <div key={idx} className="flex items-start gap-1 text-[9px]">
                  <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-red-400">⛔ Why blocked:</span> {message}. At K={stochK.toFixed(0)}, there is no room 
        for the oscillator to {isOversold ? "fall" : "rise"} further. {isOversold ? "SHORT" : "LONG"} entries are blocked until StochRSI {isOversold ? "rises above" : "pulls back below"} {threshold}.
      </div>
    </div>
  );
};

const HardGateAdxDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const adx = coerceNumeric(filtersStatus?.adx, 0);
  const adxRequired = coerceNumeric(filtersStatus?.adxRequired, 20);
  const trend =
    filtersStatus?.trend ||
    trendData?.primaryTrend ||
    trendData?.dominantTrend ||
    trendData?.trend ||
    "unknown";
  const confidence = extractConfidence(filtersStatus, trendData);
  const trendConsistency = coerceNumeric(
    filtersStatus?.trendConsistency ??
      trendData?.trueAlignment?.score ??
      trendData?.marketStructure?.confidence ??
      trendData?.weightedConsistency ??
      trendData?.trendConsistency,
    0,
  );
  const momentum = filtersStatus?.momentum || trendData?.momentum;
  const macdHistogramValue =
    momentum?.macdHistogram ??
    trendData?.timeframes?.["1h"]?.indicators?.macdHistogram ??
    trendData?.timeframes?.["4h"]?.indicators?.macdHistogram;
  const macdHistogramDisplay =
    typeof macdHistogramValue === "number"
      ? macdHistogramValue.toFixed(4)
      : macdHistogramValue || "N/A";
  const stochRsi =
    filtersStatus?.stochRsi ||
    trendData?.stochasticRsi?.aggregated ||
    trendData?.stochasticRsi?.["4h"]; // fallback: show 4h stoch
  const volatility = filtersStatus?.volatility || trendData?.volatility;
  
  const adxPercent = Math.min((adx / 40) * 100, 100);
  const adxDeficit = adxRequired - adx;
  
  return (
    <div className="space-y-3 p-3 bg-red-500/10 rounded-md border border-red-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold text-red-400">HARD GATE: ADX Too Low</span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          Need +{adxDeficit.toFixed(1)}
        </Badge>
      </div>
      
      {/* ADX Visual Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">ADX Trend Strength</span>
          <span className="font-mono text-red-400">{adx.toFixed(1)} / {adxRequired} required</span>
        </div>
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-red-500 rounded-full transition-all"
            style={{ width: `${adxPercent}%` }}
          />
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400"
            style={{ left: `${(adxRequired / 40) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Weak (0)</span>
          <span>Required ({adxRequired})</span>
          <span>Strong (40+)</span>
        </div>
      </div>
      
      {/* Context Grid */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Trend</div>
          <div className="font-medium capitalize">{trend}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Confidence</div>
          <div className="font-medium">{confidence}%</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Alignment</div>
          <div className="font-medium">{!isNaN(Number(trendConsistency)) ? Number(trendConsistency).toFixed(0) : '—'}%</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Momentum</div>
          <div className="font-medium capitalize">{momentum?.state || "none"}</div>
        </div>
      </div>
      
      {/* Detailed Momentum Info */}
      {momentum && (
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            MACD: {macdHistogramDisplay}
          </Badge>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${momentum.confirms ? 'text-green-400' : 'text-red-400'}`}>
            Confirms: {momentum.confirms ? "Yes" : "No"}
          </Badge>
          {stochRsi && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              StochRSI: {stochRsi.signal || "neutral"}
            </Badge>
          )}
          {volatility && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              ATR: {volatility.atrPercent}%
            </Badge>
          )}
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-red-400">⚠️ Why blocked:</span> ADX below 20 indicates no clear trend direction. 
        Wait for trend strength to develop before entry.
      </div>
    </div>
  );
};

const HardGateMomentumDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const momentumState = filtersStatus?.momentumState || filtersStatus?.momentum?.state || "none";
  const momentumConfirms = filtersStatus?.momentumConfirms ?? filtersStatus?.momentum?.confirms ?? false;
  const momentum = filtersStatus?.momentum || trendData?.momentum;
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trend =
    filtersStatus?.trend ||
    trendData?.primaryTrend ||
    trendData?.dominantTrend ||
    trendData?.trend ||
    "unknown";
  const confidence = extractConfidence(filtersStatus, trendData);

  const htfFilter = filtersStatus?.htfFilter || {};
  const trend4h = htfFilter.trend4h || extractTimeframeTrend(trendData, "4h");
  const trend1h = htfFilter.trend1h || extractTimeframeTrend(trendData, "1h");
  const trend4hDisplay = trend4h || "N/A";
  const trend1hDisplay = trend1h || "N/A";

  const stochRsi =
    filtersStatus?.stochRsi ||
    trendData?.stochasticRsi?.aggregated ||
    trendData?.stochasticRsi?.["4h"]; // fallback: show 4h stoch

  const macdHistogramValue =
    momentum?.macdHistogram ??
    trendData?.timeframes?.["1h"]?.indicators?.macdHistogram ??
    trendData?.timeframes?.["4h"]?.indicators?.macdHistogram;
  const macdHistogramDisplay =
    typeof macdHistogramValue === "number"
      ? macdHistogramValue.toFixed(4)
      : macdHistogramValue || "N/A";
  
  const getMomentumStateColor = (state: string) => {
    if (state === "confirmed") return "text-green-400 bg-green-500/20";
    if (state === "building") return "text-yellow-400 bg-yellow-500/20";
    if (state === "mixed") return "text-orange-400 bg-orange-500/20";
    return "text-red-400 bg-red-500/20";
  };
  
  return (
    <div className="space-y-3 p-3 bg-orange-500/10 rounded-md border border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">HARD GATE: No Momentum Confirmation</span>
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 ${getMomentumStateColor(momentumState)}`}>
          {momentumState}
        </Badge>
      </div>
      
      {/* Momentum Checklist */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground mb-1">Momentum Requirements:</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${momentumState !== "none" ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {momentumState !== "none" ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>State: {momentumState}</span>
          </div>
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${momentumConfirms ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {momentumConfirms ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>Confirms: {momentumConfirms ? "Yes" : "No"}</span>
          </div>
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${momentum?.macdDirectionAligned ? 'bg-green-500/10' : 'bg-muted/30'}`}>
            {momentum?.macdDirectionAligned ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            <span>MACD Aligned: {momentum?.macdDirectionAligned ? "Yes" : "No"}</span>
          </div>
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${momentum?.lastCloseAlignsWithTrend ? 'bg-green-500/10' : 'bg-muted/30'}`}>
            {momentum?.lastCloseAlignsWithTrend ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            <span>Close Aligns: {momentum?.lastCloseAlignsWithTrend ? "Yes" : "No"}</span>
          </div>
        </div>
      </div>
      
      {/* Divergence Check */}
      {momentum?.hasDivergence && (
        <div className="flex items-center gap-1.5 p-1.5 bg-red-500/20 rounded text-[10px] text-red-400">
          <AlertTriangle className="h-3 w-3" />
          <span>⚠️ Divergence Detected - Price and MACD moving in opposite directions</span>
        </div>
      )}
      
      {/* Context Info */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="font-medium">{adx.toFixed(1)}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Trend</div>
          <div className="font-medium capitalize">{trend}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">4H</div>
          <div className="font-medium capitalize">{trend4hDisplay}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">1H</div>
          <div className="font-medium capitalize">{trend1hDisplay}</div>
        </div>
      </div>
      
      {/* StochRSI Info */}
      {stochRsi && (
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            StochRSI: {stochRsi.signal || "neutral"}
          </Badge>
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            MACD: {macdHistogramDisplay}
          </Badge>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> Momentum must be "confirmed" with MACD alignment 
        and no divergence. Current state "{momentumState}" doesn't meet entry requirements.
      </div>
    </div>
  );
};

const HardGateHtfDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const htfAligned = filtersStatus?.htfAligned ?? false;
  const confidence = extractConfidence(filtersStatus, trendData);
  const trend4h = filtersStatus?.trend4h || extractTimeframeTrend(trendData, "4h");
  const trend1h = filtersStatus?.trend1h || extractTimeframeTrend(trendData, "1h");
  const conf4h = coerceNumeric(trendData?.timeframes?.['4h']?.confidence, 0);
  const conf1h = coerceNumeric(trendData?.timeframes?.['1h']?.confidence, 0);
  
  return (
    <div className="space-y-3 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-400">HARD GATE: HTF Not Aligned</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/30">
          Conf: {confidence}%
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Higher timeframes must align OR confidence must be ≥65%
      </div>
      
      {/* Timeframe Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border ${trend4h === trend1h ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">4H Trend</div>
          <div className="font-medium capitalize text-sm">{trend4h}</div>
          <div className="text-[9px] text-muted-foreground">Conf: {conf4h}%</div>
        </div>
        <div className={`p-2 rounded border ${trend4h === trend1h ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">1H Trend</div>
          <div className="font-medium capitalize text-sm">{trend1h}</div>
          <div className="text-[9px] text-muted-foreground">Conf: {conf1h}%</div>
        </div>
      </div>
      
      {/* Requirements Check */}
      <div className="space-y-1">
        <div className={`flex items-center gap-1.5 text-[10px] ${htfAligned ? 'text-green-400' : 'text-red-400'}`}>
          {htfAligned ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          HTF Aligned: {htfAligned ? "Yes" : "No"}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] ${confidence >= 65 ? 'text-green-400' : 'text-red-400'}`}>
          {confidence >= 65 ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          Confidence ≥ 65%: {confidence}%
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-yellow-400">⚠️ Why blocked:</span> 4H and 1H trends must agree, or overall 
        confidence must be ≥65% to bypass alignment requirement.
      </div>
    </div>
  );
};

const HardGateConfidenceDeadZoneDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const confidence = extractConfidence(filtersStatus, trendData);
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  
  return (
    <div className="space-y-3 p-3 bg-purple-500/10 rounded-md border border-purple-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-purple-500" />
          <span className="text-xs font-semibold text-purple-400">HARD GATE: Confidence Dead Zone</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-400 border-purple-500/30">
          60-69% Zone
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Confidence 60-69% has only 31.73% win rate vs 46.34% for 50-59%
      </div>
      
      {/* Visual Confidence Zones */}
      <div className="space-y-1.5">
        <div className="relative h-3 bg-muted/30 rounded-full overflow-hidden">
          <div className="absolute h-full bg-green-500/50" style={{ left: '50%', width: '10%' }} />
          <div className="absolute h-full bg-red-500/50" style={{ left: '60%', width: '10%' }} />
          <div className="absolute h-full bg-yellow-500/50" style={{ left: '70%', width: '30%' }} />
          <div 
            className="absolute h-full w-1 bg-foreground rounded-full"
            style={{ left: `${confidence}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Low (&lt;50)</span>
          <span className="text-green-400">Optimal (50-59)</span>
          <span className="text-red-400">Dead Zone (60-69)</span>
          <span className="text-yellow-400">High (70+)</span>
        </div>
      </div>
      
      {/* Current Values */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 bg-red-500/20 rounded border border-red-500/30 text-center">
          <div className="text-[10px] text-muted-foreground">Confidence</div>
          <div className="font-medium text-red-400">{confidence}%</div>
          <div className="text-[9px] text-muted-foreground">In dead zone</div>
        </div>
        <div className={`p-2 rounded border text-center ${adx >= 30 ? 'bg-green-500/20 border-green-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">ADX</div>
          <div className={`font-medium ${adx >= 30 ? 'text-green-400' : ''}`}>{adx.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground">{adx >= 30 ? "Would bypass" : "Need ≥30"}</div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-purple-400">⚠️ Why blocked:</span> 60-69% confidence indicates trend exhaustion. 
        ADX ≥30 required to bypass this zone. Wait for pullback to 50-59% zone or stronger trend.
      </div>
    </div>
  );
};

const HardGateNeutral4hDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const trend4h = filtersStatus?.trend4h || trendData?.multiTimeframe?.trend4h || "neutral";
  const trend1h = filtersStatus?.trend1h || trendData?.multiTimeframe?.trend1h || "neutral";
  const conf4h = coerceNumeric(filtersStatus?.confidence4h ?? trendData?.multiTimeframe?.confidence4h, 50);
  const conf1h = coerceNumeric(filtersStatus?.confidence1h ?? trendData?.multiTimeframe?.confidence1h, 50);
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  
  const is4hNeutral = trend4h?.toLowerCase() === "neutral" || trend4h?.toLowerCase() === "ranging";
  const is1hDirectional = trend1h?.toLowerCase() !== "neutral" && trend1h?.toLowerCase() !== "ranging";
  
  // Requirements
  const requiredForNeutral4h = 70;
  const requiredFor1hDirectional = 65;
  
  const passes4hRequirement = conf4h >= requiredForNeutral4h;
  const passes1hRequirement = is1hDirectional && conf1h >= requiredFor1hDirectional;
  
  const getTrendIcon = (trend: string) => {
    if (trend?.toLowerCase() === "bullish") return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (trend?.toLowerCase() === "bearish") return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-yellow-500" />;
  };
  
  const getTrendColor = (trend: string) => {
    if (trend?.toLowerCase() === "bullish") return "text-green-400";
    if (trend?.toLowerCase() === "bearish") return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="space-y-3 p-3 bg-orange-500/10 rounded-md border border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">Neutral 4H - Low Confidence</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-400 border-orange-500/30">
          Gate Failed
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        When 4H is neutral, need 70%+ confidence OR directional 1H with 65%+
      </div>
      
      {/* Timeframe Cards */}
      <div className="grid grid-cols-2 gap-2">
        {/* 4H Timeframe */}
        <div className={`p-2 rounded border text-center ${passes4hRequirement ? 'bg-green-500/20 border-green-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground mb-1">4H Timeframe</div>
          <div className="flex items-center justify-center gap-1">
            {getTrendIcon(trend4h)}
            <span className={`text-xs font-medium capitalize ${getTrendColor(trend4h)}`}>{trend4h}</span>
          </div>
          <div className={`text-lg font-bold ${passes4hRequirement ? 'text-green-400' : 'text-red-400'}`}>
            {conf4h}%
          </div>
          <div className="text-[9px] text-muted-foreground">
            {is4hNeutral ? (passes4hRequirement ? "✓ Meets 70%" : `Need ≥70%`) : "Directional"}
          </div>
          {/* Mini progress bar */}
          <div className="mt-1 h-1 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${passes4hRequirement ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(conf4h, 100)}%` }}
            />
          </div>
        </div>
        
        {/* 1H Timeframe */}
        <div className={`p-2 rounded border text-center ${passes1hRequirement ? 'bg-green-500/20 border-green-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground mb-1">1H Timeframe</div>
          <div className="flex items-center justify-center gap-1">
            {getTrendIcon(trend1h)}
            <span className={`text-xs font-medium capitalize ${getTrendColor(trend1h)}`}>{trend1h}</span>
          </div>
          <div className={`text-lg font-bold ${passes1hRequirement ? 'text-green-400' : 'text-muted-foreground'}`}>
            {conf1h}%
          </div>
          <div className="text-[9px] text-muted-foreground">
            {is1hDirectional ? (conf1h >= requiredFor1hDirectional ? "✓ Directional 65%+" : "Need ≥65%") : "Not directional"}
          </div>
          {/* Mini progress bar */}
          <div className="mt-1 h-1 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${passes1hRequirement ? 'bg-green-500' : 'bg-muted'}`}
              style={{ width: `${Math.min(conf1h, 100)}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* ADX Info */}
      {adx > 0 && (
        <div className="flex items-center justify-between p-1.5 bg-muted/20 rounded text-[10px]">
          <span className="text-muted-foreground">ADX Strength:</span>
          <span className={adx >= 25 ? 'text-green-400' : 'text-yellow-400'}>{adx.toFixed(1)}</span>
        </div>
      )}
      
      {/* Why Blocked */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> Neutral 4H trends with low confidence have poor win rates. 
        Wait for: 4H confidence to rise above 70%, or 1H to become directional ({">"}65%).
      </div>
    </div>
  );
};

// HARD GATE: Bollinger Band Overextension
const HardGateBollingerExtensionDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const percentB = coerceNumeric(filtersStatus?.percentB, 50);
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h, 50);
  const gate = filtersStatus?.gate || "";
  const message = filtersStatus?.message || "";
  
  const isOverextended = gate === "BOLLINGER_OVEREXTENSION_GATE" || percentB > 100;
  const isUnderextended = gate === "BOLLINGER_UNDEREXTENSION_GATE" || percentB < 0;
  
  const getPercentBColor = () => {
    if (percentB > 110 || percentB < -10) return "text-red-500";
    if (percentB > 100 || percentB < 0) return "text-orange-400";
    return "text-yellow-400";
  };
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${isOverextended ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className={`h-4 w-4 ${isOverextended ? 'text-red-500' : 'text-blue-500'}`} />
          <span className={`text-xs font-semibold ${isOverextended ? 'text-red-400' : 'text-blue-400'}`}>
            HARD GATE: Bollinger {isOverextended ? "Overextension" : "Underextension"}
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          %B = {percentB.toFixed(0)}
        </Badge>
      </div>
      
      {/* Bollinger Band Visual */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Bollinger %B Position</span>
          <span className={`font-mono font-bold ${getPercentBColor()}`}>
            {percentB.toFixed(1)}%
          </span>
        </div>
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          {/* Normal zone (0-100) */}
          <div className="absolute left-[15%] h-full w-[70%] bg-green-500/20" />
          {/* Danger zones */}
          <div className="absolute left-0 h-full w-[15%] bg-blue-500/30 rounded-l-full" />
          <div className="absolute right-0 h-full w-[15%] bg-red-500/30 rounded-r-full" />
          {/* Current %B marker - clamped to visible range */}
          <div 
            className={`absolute top-0 h-full w-1 rounded-full ${getPercentBColor().replace('text-', 'bg-')}`}
            style={{ left: `${Math.max(0, Math.min(100, (percentB + 20) / 1.4))}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span className="text-blue-400">&lt;0 Oversold</span>
          <span>Lower (0)</span>
          <span>Upper (100)</span>
          <span className="text-red-400">&gt;100 OB</span>
        </div>
      </div>
      
      {/* Context Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border text-center ${Math.abs(percentB - 50) > 60 ? 'bg-red-500/20 border-red-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">%B Value</div>
          <div className={`text-lg font-mono font-bold ${getPercentBColor()}`}>
            {percentB.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {isOverextended ? ">110 extreme" : isUnderextended ? "<-10 extreme" : "Normal"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${stochRsiK > 90 || stochRsiK < 10 ? 'bg-orange-500/20 border-orange-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">4H StochRSI K</div>
          <div className="text-lg font-mono font-bold text-muted-foreground">
            {stochRsiK.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {stochRsiK >= 90 ? "Overbought" : stochRsiK <= 10 ? "Oversold" : "Normal"}
          </div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={isOverextended ? "text-red-400" : "text-blue-400"}>⛔ Why blocked:</span> {message || (isOverextended 
          ? "Price extremely above upper Bollinger Band with overbought StochRSI. LONG entries blocked to avoid chasing extended moves."
          : "Price extremely below lower Bollinger Band with oversold StochRSI. SHORT entries blocked to avoid selling into exhausted move."
        )}
      </div>
    </div>
  );
};

// HARD GATE: StochRSI Direction Gate (Not Rising/Not Falling)
const HardGateStochRsiDirectionDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h, 50);
  const stochRsiD = coerceNumeric(filtersStatus?.stochRsiD4h, 50);
  const gate = filtersStatus?.gate || "";
  
  const isNotRising = gate === "STOCHRSI_NOT_RISING";
  const isNotFalling = gate === "STOCHRSI_NOT_FALLING";
  const direction = isNotRising ? "rising" : "falling";
  const requiredDirection = isNotRising ? "K > D" : "K < D";
  const currentDirection = stochRsiK > stochRsiD ? "K > D (rising)" : stochRsiK < stochRsiD ? "K < D (falling)" : "K = D (flat)";
  
  return (
    <div className="space-y-3 p-3 bg-orange-500/10 rounded-md border border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">
            HARD GATE: StochRSI Not {isNotRising ? "Rising" : "Falling"}
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-400 border-orange-500/30">
          {currentDirection}
        </Badge>
      </div>
      
      {/* K vs D Visual */}
      <div className="space-y-2">
        <div className="text-[10px] text-muted-foreground">
          Required: {requiredDirection} (StochRSI {direction})
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-muted/30 rounded border border-muted/50 text-center">
            <div className="text-[10px] text-muted-foreground">%K (Fast)</div>
            <div className="text-xl font-mono font-bold text-foreground">
              {stochRsiK.toFixed(1)}
            </div>
          </div>
          <div className="p-2 bg-muted/30 rounded border border-muted/50 text-center">
            <div className="text-[10px] text-muted-foreground">%D (Slow)</div>
            <div className="text-xl font-mono font-bold text-foreground">
              {stochRsiD.toFixed(1)}
            </div>
          </div>
        </div>
        
        {/* Direction indicator */}
        <div className={`flex items-center justify-center gap-2 p-2 rounded ${
          (isNotRising && stochRsiK <= stochRsiD) || (isNotFalling && stochRsiK >= stochRsiD) 
            ? 'bg-red-500/20 border border-red-500/30' 
            : 'bg-green-500/20 border border-green-500/30'
        }`}>
          {isNotRising ? (
            <>
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-xs text-red-400">StochRSI is falling or flat (K ≤ D)</span>
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4 text-red-400" />
              <span className="text-xs text-red-400">StochRSI is rising or flat (K ≥ D)</span>
            </>
          )}
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> At extreme StochRSI levels, momentum direction matters. 
        {isNotRising 
          ? " For LONG entries in overbought conditions, StochRSI must be rising (K > D) to confirm continuation."
          : " For SHORT entries in oversold conditions, StochRSI must be falling (K < D) to confirm continuation."
        }
      </div>
    </div>
  );
};

// HARD GATE: Divergence at Extreme
const HardGateDivergenceDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h, 50);
  const gate = filtersStatus?.gate || "";
  
  const isBearishDivergence = gate === "BEARISH_DIVERGENCE_AT_EXTREME" || filtersStatus?.hasBearishDivergence;
  const isBullishDivergence = gate === "BULLISH_DIVERGENCE_AT_EXTREME" || filtersStatus?.hasBullishDivergence;
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${isBearishDivergence ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className={`h-4 w-4 ${isBearishDivergence ? 'text-red-500' : 'text-blue-500'}`} />
          <span className={`text-xs font-semibold ${isBearishDivergence ? 'text-red-400' : 'text-blue-400'}`}>
            HARD GATE: {isBearishDivergence ? "Bearish" : "Bullish"} Divergence at Extreme
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          K = {stochRsiK.toFixed(1)}
        </Badge>
      </div>
      
      {/* Divergence Explanation */}
      <div className={`p-3 rounded border ${isBearishDivergence ? 'bg-red-500/20 border-red-500/30' : 'bg-blue-500/20 border-blue-500/30'}`}>
        <div className="flex items-center gap-2 mb-2">
          {isBearishDivergence ? (
            <>
              <ArrowUpCircle className="h-4 w-4 text-green-400" />
              <span className="text-[10px]">Price making higher highs</span>
            </>
          ) : (
            <>
              <ArrowDownCircle className="h-4 w-4 text-red-400" />
              <span className="text-[10px]">Price making lower lows</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isBearishDivergence ? (
            <>
              <ArrowDownCircle className="h-4 w-4 text-red-400" />
              <span className="text-[10px]">StochRSI making lower highs</span>
            </>
          ) : (
            <>
              <ArrowUpCircle className="h-4 w-4 text-green-400" />
              <span className="text-[10px]">StochRSI making higher lows</span>
            </>
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-muted/30 text-center">
          <span className={`text-xs font-medium ${isBearishDivergence ? 'text-red-400' : 'text-blue-400'}`}>
            = {isBearishDivergence ? "Bearish" : "Bullish"} Divergence
          </span>
        </div>
      </div>
      
      {/* StochRSI Context */}
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-[10px]">
        <span className="text-muted-foreground">4H StochRSI K:</span>
        <span className={`font-mono font-bold ${stochRsiK >= 90 ? 'text-red-400' : stochRsiK <= 10 ? 'text-blue-400' : 'text-foreground'}`}>
          {stochRsiK.toFixed(1)} ({stochRsiK >= 80 ? "Overbought" : stochRsiK <= 20 ? "Oversold" : "Normal"})
        </span>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={isBearishDivergence ? "text-red-400" : "text-blue-400"}>⛔ Why blocked:</span> {isBearishDivergence 
          ? "Bearish divergence at overbought levels is a strong reversal signal. LONG entries blocked as momentum is weakening despite higher prices."
          : "Bullish divergence at oversold levels is a strong reversal signal. SHORT entries blocked as selling pressure is weakening despite lower prices."
        }
      </div>
    </div>
  );
};

// HARD GATE: Momentum Score Too Low
const HardGateMomentumScoreDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const momentumScore = coerceNumeric(filtersStatus?.momentumScore, 0);
  const momentumRequired = coerceNumeric(filtersStatus?.momentumRequired, 5);
  const momentumState = filtersStatus?.momentumState || trendData?.momentum?.state || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  
  const scorePercent = (momentumScore / 20) * 100; // Assuming max momentum score of 20
  
  return (
    <div className="space-y-3 p-3 bg-orange-500/10 rounded-md border border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">HARD GATE: Momentum Score Too Low</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-400 border-orange-500/30">
          Need +{Math.max(0, momentumRequired - momentumScore)}
        </Badge>
      </div>
      
      {/* Momentum Score Visual */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Momentum Score</span>
          <span className="font-mono text-orange-400">{momentumScore} / {momentumRequired} required</span>
        </div>
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${momentumScore >= momentumRequired ? 'bg-green-500' : 'bg-orange-500'}`}
            style={{ width: `${Math.min(scorePercent, 100)}%` }}
          />
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400"
            style={{ left: `${(momentumRequired / 20) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Low (0)</span>
          <span>Required ({momentumRequired})</span>
          <span>Strong (20)</span>
        </div>
      </div>
      
      {/* Context Grid */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Score</div>
          <div className={`font-bold ${momentumScore >= momentumRequired ? 'text-green-400' : 'text-orange-400'}`}>
            {momentumScore}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">State</div>
          <div className="font-medium capitalize">{momentumState}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="font-medium">{adx.toFixed(1)}</div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> Trades with momentum score below {momentumRequired} have 
        extremely low win rates. Wait for stronger momentum confirmation before entry.
      </div>
    </div>
  );
};

// HARD GATE: MACD Misaligned
const HardGateMacdMisalignedDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const macdDirectionAligned = filtersStatus?.macdDirectionAligned ?? false;
  const hasMacdDivergence = filtersStatus?.hasMacdDivergence ?? false;
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trend = filtersStatus?.trend || trendData?.primaryTrend || "unknown";
  const momentum = filtersStatus?.momentum || trendData?.momentum;
  
  const macdHistogram = momentum?.macdHistogram ?? trendData?.timeframes?.['1h']?.indicators?.macdHistogram;
  const macdDisplay = typeof macdHistogram === 'number' ? macdHistogram.toFixed(4) : "N/A";
  
  return (
    <div className="space-y-3 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-400">HARD GATE: MACD Misaligned</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/30">
          ADX: {adx.toFixed(1)}
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        MACD must align with trade direction OR ADX ≥35 to override
      </div>
      
      {/* MACD Checks */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${macdDirectionAligned ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {macdDirectionAligned ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>MACD Direction: {macdDirectionAligned ? "Aligned" : "Not Aligned"}</span>
        </div>
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${!hasMacdDivergence ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {!hasMacdDivergence ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>MACD Divergence: {hasMacdDivergence ? "Detected" : "None"}</span>
        </div>
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${adx >= 35 ? 'bg-green-500/10' : 'bg-muted/30'}`}>
          {adx >= 35 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
          <span>ADX Override (≥35): {adx.toFixed(1)}</span>
        </div>
      </div>
      
      {/* Context */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Trend</div>
          <div className="font-medium capitalize">{trend}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">MACD Hist</div>
          <div className={`font-mono ${Number(macdHistogram) > 0 ? 'text-green-400' : Number(macdHistogram) < 0 ? 'text-red-400' : ''}`}>
            {macdDisplay}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Momentum</div>
          <div className="font-medium capitalize">{momentum?.state || "N/A"}</div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-yellow-400">⚠️ Why blocked:</span> MACD histogram must confirm trade direction. 
        {hasMacdDivergence 
          ? " Divergence detected between price and MACD, indicating weakening momentum."
          : " MACD direction does not match intended trade. Wait for MACD to align or for ADX to exceed 35 for override."
        }
      </div>
    </div>
  );
};

// Unified Reversal Display - for BLOCK/REDUCE decisions from unified reversal scoring
const UnifiedReversalDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const score = coerceNumeric(filtersStatus?.score ?? filtersStatus?.unifiedScore ?? filtersStatus?.reversalScore, 0);
  const decision = filtersStatus?.decision || "UNKNOWN";
  const breakdown = filtersStatus?.breakdown || filtersStatus?.scoreBreakdown || {};
  const reasons = filtersStatus?.reasons || filtersStatus?.reversalReasons || [];
  const momentumState = filtersStatus?.momentumState || trendData?.momentum?.state || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trend4h = filtersStatus?.trend4h || trendData?.primaryTrend || "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend || "unknown";
  
  const isBlock = decision === "BLOCK";
  const isReduce = decision === "REDUCE";
  
  const getDecisionColor = () => {
    if (isBlock) return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500' };
    if (isReduce) return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500' };
    return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500' };
  };
  
  const colors = getDecisionColor();
  
  // Score breakdown labels
  const breakdownLabels: Record<string, string> = {
    macd: 'MACD',
    momentum: 'Momentum',
    stochRsi: 'StochRSI',
    stochRsiZone: 'StochRSI Zone',
    timeInExtreme: 'Time in Extreme',
    timeframe: 'Timeframe',
    volume: 'Volume',
    macdScore: 'MACD',
    momentumScore: 'Momentum',
    stochRsiScore: 'StochRSI',
    stochRsiZoneScore: 'StochRSI Zone',
    timeInExtremeScore: 'Time in Extreme',
    timeframeScore: 'Timeframe',
    volumeScore: 'Volume',
  };
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${colors.bg} ${colors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isBlock ? (
            <Ban className={`h-4 w-4 ${colors.text}`} />
          ) : (
            <AlertTriangle className={`h-4 w-4 ${colors.text}`} />
          )}
          <span className={`text-xs font-semibold ${colors.text}`}>
            Unified Reversal: {decision}
          </span>
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 ${colors.badge} text-white`}>
          Score: {score}/100
        </Badge>
      </div>
      
      {/* Score Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Reversal Risk Score</span>
          <span className={`font-mono ${colors.text}`}>{score}/100</span>
        </div>
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              score >= 60 ? 'bg-red-500' : score >= 40 ? 'bg-orange-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${score}%` }}
          />
          {/* Thresholds */}
          <div className="absolute top-0 h-full w-0.5 bg-orange-400/50" style={{ left: '40%' }} />
          <div className="absolute top-0 h-full w-0.5 bg-red-400/50" style={{ left: '60%' }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Normal (0-39)</span>
          <span className="text-orange-400">Reduce (40-59)</span>
          <span className="text-red-400">Block (60+)</span>
        </div>
      </div>
      
      {/* Score Breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-muted/30">
          <div className="text-[10px] text-muted-foreground">Score Breakdown:</div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(breakdown).map(([key, value]) => {
              const label = breakdownLabels[key] || key.replace(/([A-Z])/g, ' $1').trim();
              const numValue = Number(value) || 0;
              return (
                <div key={key} className="flex justify-between px-2 py-1 bg-muted/20 rounded text-[10px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono ${numValue > 0 ? colors.text : 'text-muted-foreground'}`}>
                    {numValue > 0 ? `+${numValue}` : numValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Context Grid */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">4H Trend</div>
          <div className="font-medium capitalize">{trend4h}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">1H Trend</div>
          <div className="font-medium capitalize">{trend1h}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="font-medium">{adx.toFixed(1)}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Momentum</div>
          <div className="font-medium capitalize">{momentumState}</div>
        </div>
      </div>
      
      {/* Reversal Reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-muted/30">
          <div className="text-[10px] text-muted-foreground">Reversal Signals:</div>
          {reasons.slice(0, 4).map((reason: string, idx: number) => (
            <div key={idx} className="flex items-start gap-1.5 text-[10px]">
              <AlertTriangle className={`h-3 w-3 shrink-0 mt-0.5 ${colors.text}`} />
              <span className="text-muted-foreground">{reason}</span>
            </div>
          ))}
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={colors.text}>
          {isBlock ? "⛔ Why blocked:" : "⚠️ Why reduced:"}
        </span>{" "}
        {isBlock 
          ? `Unified reversal score of ${score} exceeds block threshold (60). Multiple reversal indicators suggest high probability of trend reversal.`
          : `Unified reversal score of ${score} is in reduction zone (40-59). Position size reduced due to elevated reversal risk.`
        }
      </div>
    </div>
  );
};

// No Direction Display - for NO_CLEAR_DIRECTION rejections
const NoDirectionDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const trend4h = filtersStatus?.trend4h || trendData?.primaryTrend || "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend || "unknown";
  const confidence4h = coerceNumeric(filtersStatus?.confidence4h ?? trendData?.timeframes?.['4h']?.confidence, 0);
  const confidence1h = coerceNumeric(filtersStatus?.confidence1h ?? trendData?.timeframes?.['1h']?.confidence, 0);
  const primaryTrend = filtersStatus?.primaryTrend || trendData?.primaryTrend || "unknown";
  const source = filtersStatus?.source || "direction_check";
  const reason = filtersStatus?.reason || "Could not determine clear trade direction from available signals";
  
  const is4hNeutral = trend4h === "neutral" || trend4h === "ranging";
  const is1hNeutral = trend1h === "neutral" || trend1h === "ranging";
  const bothNeutral = is4hNeutral && is1hNeutral;
  
  return (
    <div className="space-y-3 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Minus className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-400">No Clear Trade Direction</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/30">
          {bothNeutral ? "Both Neutral" : is4hNeutral ? "4H Neutral" : is1hNeutral ? "1H Neutral" : "Conflicting"}
        </Badge>
      </div>
      
      {/* Trend Overview */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border ${is4hNeutral ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/30 border-border/50'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">4H Trend</span>
            {is4hNeutral ? (
              <Minus className="h-3 w-3 text-yellow-400" />
            ) : trend4h === "bullish" ? (
              <TrendingUp className="h-3 w-3 text-green-400" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-400" />
            )}
          </div>
          <div className={`text-sm font-medium capitalize ${
            is4hNeutral ? 'text-yellow-400' : trend4h === "bullish" ? 'text-green-400' : 'text-red-400'
          }`}>
            {trend4h}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Confidence: {confidence4h}%
          </div>
        </div>
        
        <div className={`p-2 rounded border ${is1hNeutral ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/30 border-border/50'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">1H Trend</span>
            {is1hNeutral ? (
              <Minus className="h-3 w-3 text-yellow-400" />
            ) : trend1h === "bullish" ? (
              <TrendingUp className="h-3 w-3 text-green-400" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-400" />
            )}
          </div>
          <div className={`text-sm font-medium capitalize ${
            is1hNeutral ? 'text-yellow-400' : trend1h === "bullish" ? 'text-green-400' : 'text-red-400'
          }`}>
            {trend1h}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Confidence: {confidence1h}%
          </div>
        </div>
      </div>
      
      {/* Primary Trend Status */}
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-[10px]">
        <span className="text-muted-foreground">Primary Trend:</span>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${
          primaryTrend === "bullish" ? 'text-green-400 border-green-500/30' :
          primaryTrend === "bearish" ? 'text-red-400 border-red-500/30' :
          'text-yellow-400 border-yellow-500/30'
        }`}>
          {primaryTrend}
        </Badge>
      </div>
      
      {/* Source Info */}
      {source && source !== "direction_check" && (
        <div className="text-[10px] text-muted-foreground">
          Source: <span className="font-mono">{source}</span>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-yellow-400">⚠️ Why blocked:</span> {reason || 
          "Cannot determine a clear LONG or SHORT direction. Both timeframes must agree on direction, or a strong single-timeframe signal with sufficient confidence is required."
        }
      </div>
    </div>
  );
};

const ActiveSignalDisplay = () => {
  return (
    <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-md border border-green-500/20">
      <Zap className="h-4 w-4 text-green-500" />
      <span className="text-xs text-green-400">Signal already generated and awaiting execution</span>
    </div>
  );
};

const ReversalRiskDisplay = ({ filtersStatus }: { filtersStatus: any }) => {
  const riskScore = filtersStatus?.reversalRiskScore || 0;
  const signals = filtersStatus?.reversalSignals || [];
  const trend = filtersStatus?.trend;
  const trend1h = filtersStatus?.trend1h;
  const momentum = filtersStatus?.momentum;
  
  const getRiskColor = () => {
    if (riskScore >= 70) return "text-red-500";
    if (riskScore >= 50) return "text-orange-500";
    return "text-yellow-500";
  };
  
  return (
    <div className="space-y-2 p-2 bg-red-500/10 rounded-md border border-red-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          <span className="text-xs font-medium text-red-400">Reversal Risk</span>
        </div>
        <Badge 
          variant="destructive" 
          className="text-[10px] px-1.5 py-0"
        >
          {riskScore}/100
        </Badge>
      </div>
      
      {/* Risk Progress Bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${riskScore >= 70 ? 'bg-red-500' : riskScore >= 50 ? 'bg-orange-500' : 'bg-yellow-500'}`}
          style={{ width: `${riskScore}%` }}
        />
        <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: '50%' }} />
      </div>
      
      {/* Trend Info */}
      {(trend || trend1h) && (
        <div className="flex items-center gap-2 text-[10px]">
          {trend && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
              Trend: {trend}
            </Badge>
          )}
          {trend1h && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
              1H: {trend1h}
            </Badge>
          )}
          {momentum?.state && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
              Mom: {momentum.state}
            </Badge>
          )}
        </div>
      )}
      
      {/* Risk Signals */}
      {signals.length > 0 && (
        <div className="space-y-0.5">
          {signals.slice(0, 3).map((signal: string, idx: number) => (
            <div key={idx} className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="text-red-400">•</span>
              {signal}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StochRsiExtremeDisplay = ({
  filtersStatus,
  trendData,
}: {
  filtersStatus: any;
  trendData?: any;
}) => {
  const stochRsiK = parseFloat(filtersStatus?.stochRsiK4h) || 0;
  const threshold = filtersStatus?.threshold || (stochRsiK < 50 ? 10 : 90);
  const intendedDirection = filtersStatus?.intendedDirection;
  const trend =
    filtersStatus?.trend4h ||
    filtersStatus?.trend ||
    filtersStatus?.primaryTrend ||
    extractTimeframeTrend(trendData, "4h") ||
    "unknown";
  const reason = filtersStatus?.reason;

  const isOversold = stochRsiK < 50;
  const extremeLevel = isOversold ? 10 : 90;
  const dangerZone = isOversold ? 20 : 80;
  
  // Calculate how deep into extreme we are (0-100%)
  const extremeDepth = isOversold 
    ? Math.max(0, Math.min(100, ((extremeLevel - stochRsiK) / extremeLevel) * 100 + 50))
    : Math.max(0, Math.min(100, ((stochRsiK - dangerZone) / (100 - dangerZone)) * 100));
  
  // Get StochRSI zone label
  const getZoneLabel = () => {
    if (isOversold) {
      if (stochRsiK <= 5) return "Extreme Oversold";
      if (stochRsiK <= 10) return "Oversold";
      if (stochRsiK <= 20) return "Near Oversold";
      return "Neutral";
    } else {
      if (stochRsiK >= 95) return "Extreme Overbought";
      if (stochRsiK >= 90) return "Overbought";
      if (stochRsiK >= 80) return "Near Overbought";
      return "Neutral";
    }
  };
  
  const getZoneColor = () => {
    if (isOversold) {
      if (stochRsiK <= 5) return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' };
      if (stochRsiK <= 10) return { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400', bar: 'bg-orange-500' };
      return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400', bar: 'bg-yellow-500' };
    } else {
      if (stochRsiK >= 95) return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' };
      if (stochRsiK >= 90) return { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400', bar: 'bg-orange-500' };
      return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400', bar: 'bg-yellow-500' };
    }
  };
  
  const zoneColors = getZoneColor();
  
  return (
    <div className={`space-y-2 p-2 rounded-md border ${zoneColors.bg} ${zoneColors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge className={`h-3.5 w-3.5 ${zoneColors.text}`} />
          <span className="text-xs font-medium">StochRSI Extreme Filter</span>
        </div>
        <Badge 
          variant="outline" 
          className={`text-[10px] px-1.5 py-0 ${zoneColors.text} ${zoneColors.bg} ${zoneColors.border}`}
        >
          {getZoneLabel()}
        </Badge>
      </div>
      
      {/* Visual StochRSI Gauge */}
      <div className="relative">
        <div className="h-3 bg-gradient-to-r from-red-500/30 via-green-500/30 to-red-500/30 rounded-full overflow-hidden">
          {/* Marker for current value */}
          <div 
            className="absolute top-0 h-3 w-1 bg-foreground rounded-full shadow-lg transition-all"
            style={{ left: `calc(${stochRsiK}% - 2px)` }}
          />
          {/* Danger zone overlays */}
          <div className="absolute top-0 left-0 h-full w-[10%] bg-red-500/40 rounded-l-full" />
          <div className="absolute top-0 right-0 h-full w-[10%] bg-red-500/40 rounded-r-full" />
          {/* Warning zone */}
          <div className="absolute top-0 left-[10%] h-full w-[10%] bg-orange-500/30" />
          <div className="absolute top-0 right-[10%] h-full w-[10%] bg-orange-500/30" />
        </div>
        {/* Scale markers */}
        <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
          <span>0</span>
          <span>10</span>
          <span>50</span>
          <span>90</span>
          <span>100</span>
        </div>
      </div>
      
      {/* Detailed Info Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${zoneColors.bg} ${zoneColors.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">4H StochRSI K</div>
                <div className={`text-sm font-mono font-bold ${zoneColors.text}`}>
                  {stochRsiK.toFixed(1)}
                </div>
                <div className="text-[8px] text-muted-foreground">
                  {isOversold ? `< ${threshold} blocked` : `> ${threshold} blocked`}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
              <p>Current 4-hour StochRSI %K value</p>
              <p className="text-muted-foreground mt-1">
                {isOversold 
                  ? "Oversold = high bounce probability, SHORT entries blocked"
                  : "Overbought = high pullback probability, LONG entries blocked"
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center p-1.5 rounded border bg-muted/30 border-border/50">
                <div className="text-[9px] text-muted-foreground mb-0.5">Intended</div>
                <div className="flex items-center justify-center gap-1">
                  {intendedDirection === "short" ? (
                    <ArrowDownCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4 text-green-400" />
                  )}
                  <span className={`text-xs font-medium uppercase ${intendedDirection === "short" ? "text-red-400" : "text-green-400"}`}>
                    {intendedDirection}
                  </span>
                </div>
                <div className="text-[8px] text-muted-foreground">blocked</div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Trade direction that was blocked</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center p-1.5 rounded border bg-muted/30 border-border/50">
                <div className="text-[9px] text-muted-foreground mb-0.5">4H Trend</div>
                <div className={`text-xs font-medium capitalize ${
                  trend === "bullish" ? "text-green-400" : 
                  trend === "bearish" ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {trend || "—"}
                </div>
                <div className="text-[8px] text-muted-foreground">current</div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              <p>Dominant trend direction from 4H analysis</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Explanation */}
      <div className="pt-1.5 border-t border-border/50">
        <div className="flex items-start gap-1.5">
          <AlertCircle className={`h-3 w-3 mt-0.5 ${zoneColors.text} shrink-0`} />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {isOversold 
              ? `StochRSI at ${stochRsiK.toFixed(1)} indicates extreme oversold conditions. SHORT entries blocked to avoid entering before expected bounce.`
              : `StochRSI at ${stochRsiK.toFixed(1)} indicates extreme overbought conditions. LONG entries blocked to avoid entering before expected pullback.`
            }
          </p>
        </div>
      </div>
      
      {/* Wait Recommendation */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/50 rounded text-[10px]">
        <span className="text-muted-foreground">Wait for:</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {isOversold ? "StochRSI K > 15-20" : "StochRSI K < 80-85"}
        </Badge>
      </div>
    </div>
  );
};

// AI Analysis display component
const AIAnalysisCell = ({ 
  result, 
  isLoading, 
  error 
}: { 
  result?: AIValidationResult; 
  isLoading: boolean; 
  error?: string;
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Analyzing...</span>
      </div>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">Error</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            <p>{error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!result) {
    return (
      <span className="text-xs text-muted-foreground">-</span>
    );
  }

  const isValid = result.isValid;
  const hasIssues = result.issues && result.issues.length > 0;
  
  const confidenceColors = {
    high: "text-green-400",
    medium: "text-yellow-400",
    low: "text-orange-400",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-1 max-w-[180px]">
            <div className="flex items-center gap-1.5">
              {isValid && !hasIssues ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5">
                    OK
                  </Badge>
                </>
              ) : hasIssues ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5">
                    {result.issues.length} Issue{result.issues.length > 1 ? 's' : ''}
                  </Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5">
                    Invalid
                  </Badge>
                </>
              )}
              <span className={`text-[9px] ${confidenceColors[result.confidence]}`}>
                ({result.confidence})
              </span>
            </div>
            {hasIssues && (
              <div className="text-[10px] text-yellow-400 truncate">
                {result.issues[0]}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs max-w-[300px]">
          <div className="space-y-2">
            <p className="font-medium">{result.summary}</p>
            {hasIssues && (
              <div className="space-y-1">
                <p className="font-medium text-yellow-400">Issues Found:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {result.issues.map((issue, i) => (
                    <li key={i} className="text-muted-foreground">{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground">
              Confidence: <span className={confidenceColors[result.confidence]}>{result.confidence}</span>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const SignalRejectionReasons = () => {
  const { rejections, loading } = useSignalRejections();
  const { riskParams } = useRiskParameters();
  
  // Use global AI analysis toggle from risk parameters
  const aiEnabled = riskParams?.ai_analysis_enabled ?? false;

  // Severity levels: critical (red), high (orange), medium (yellow), low (blue), info (gray)
  type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
  
  const getSeverityLevel = (reason: string, filtersStatus: any): SeverityLevel => {
    const gate = filtersStatus?.gate || "";
    const decision = filtersStatus?.decision;
    
    // CRITICAL - Absolute blocks with no exceptions
    if (gate === "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK" || gate === "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK") return "critical";
    if (reason.includes("HARD BLOCK")) return "critical";
    if (gate === "BEARISH_DIVERGENCE_AT_EXTREME" || gate === "BULLISH_DIVERGENCE_AT_EXTREME") return "critical";
    if (reason.includes("Reversal risk") && filtersStatus?.reversalRiskScore >= 70) return "critical";
    if (decision === "BLOCK" || reason.includes("Unified Reversal BLOCK")) return "critical";
    
    // HIGH - Important gates that block trades
    if (gate === "ADX_TOO_LOW") return "high";
    if (gate === "NO_MOMENTUM_CONFIRMATION") return "high";
    if (gate === "BOLLINGER_OVEREXTENSION_GATE" || gate === "BOLLINGER_UNDEREXTENSION_GATE") return "high";
    if (gate === "STOCHRSI_NOT_RISING" || gate === "STOCHRSI_NOT_FALLING") return "high";
    if (gate === "NO_CLEAR_DIRECTION") return "high";
    if (reason.includes("HARD GATE")) return "high";
    if (reason.includes("StochRSI extreme")) return "high";
    if (reason.includes("Reversal risk")) return "high";
    if (reason.includes("No clear trade direction")) return "high";
    if (decision === "REDUCE" || reason.includes("Unified Reversal REDUCE")) return "high";
    
    // MEDIUM - Softer gates that can be bypassed
    if (gate === "NEUTRAL_4H_LOW_CONFIDENCE") return "medium";
    if (gate === "CONFIDENCE_DEAD_ZONE") return "medium";
    if (gate === "HTF_NOT_ALIGNED") return "medium";
    if (gate === "MACD_MISALIGNED") return "medium";
    if (gate === "MOMENTUM_SCORE_TOO_LOW") return "medium";
    if (reason.includes("Quality score")) return "medium";
    
    // LOW - Informational blocks
    if (reason.includes("Max trades")) return "low";
    if (reason.startsWith("EXECUTION:")) return "low";
    if (reason.includes("No strategy")) return "low";
    
    // INFO - Neutral states
    if (reason.includes("active signal")) return "info";
    
    return "medium";
  };
  
  const getSeverityStyles = (severity: SeverityLevel) => {
    switch (severity) {
      case "critical":
        return {
          border: "border-l-4 border-l-red-500",
          bg: "bg-red-500/5",
          badge: "bg-red-500/20 text-red-400 border-red-500/30",
          icon: "text-red-500",
          label: "CRITICAL",
        };
      case "high":
        return {
          border: "border-l-4 border-l-orange-500",
          bg: "bg-orange-500/5",
          badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
          icon: "text-orange-500",
          label: "HIGH",
        };
      case "medium":
        return {
          border: "border-l-4 border-l-yellow-500",
          bg: "bg-yellow-500/5",
          badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
          icon: "text-yellow-500",
          label: "MEDIUM",
        };
      case "low":
        return {
          border: "border-l-4 border-l-blue-500",
          bg: "bg-blue-500/5",
          badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
          icon: "text-blue-500",
          label: "LOW",
        };
      case "info":
        return {
          border: "border-l-4 border-l-muted-foreground",
          bg: "bg-muted/30",
          badge: "bg-muted text-muted-foreground border-muted-foreground/30",
          icon: "text-muted-foreground",
          label: "INFO",
        };
    }
  };

  const getReasonIcon = (reason: string) => {
    // Execution rejections - signals that were blocked during trade execution
    if (reason.startsWith("EXECUTION:")) return <Ban className="h-4 w-4 text-orange-500" />;
    if (reason.includes("Unified Reversal BLOCK")) return <Ban className="h-4 w-4 text-red-500" />;
    if (reason.includes("Unified Reversal")) return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    if (reason.includes("No clear trade direction")) return <Minus className="h-4 w-4 text-yellow-500" />;
    if (reason.includes("Max trades")) return <Layers className="h-4 w-4" />;
    if (reason.includes("Quality score")) return <BarChart3 className="h-4 w-4" />;
    if (reason.includes("active signal")) return <Zap className="h-4 w-4 text-green-500" />;
    if (reason.includes("Reversal risk")) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (reason.includes("StochRSI extreme")) return <Gauge className="h-4 w-4 text-orange-500" />;
    if (reason.includes("timeframe")) return <TrendingDown className="h-4 w-4" />;
    if (reason.includes("momentum")) return <Activity className="h-4 w-4" />;
    if (reason.includes("ranging")) return <Minimize2 className="h-4 w-4" />;
    if (reason.includes("pullback")) return <TrendingUp className="h-4 w-4" />;
    if (reason.includes("strategy")) return <Target className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };

  const getReasonBadgeVariant = (reason: string): "default" | "secondary" | "destructive" | "outline" => {
    if (reason.startsWith("EXECUTION:")) return "secondary"; // Orange-ish for execution blocks
    if (reason.includes("Unified Reversal BLOCK")) return "destructive";
    if (reason.includes("Unified Reversal")) return "secondary";
    if (reason.includes("No clear trade direction")) return "secondary";
    if (reason.includes("active signal")) return "default";
    if (reason.includes("Max trades")) return "secondary";
    if (reason.includes("Quality score")) return "destructive";
    if (reason.includes("Reversal risk")) return "destructive";
    if (reason.includes("StochRSI extreme")) return "secondary";
    if (reason.includes("No strategy")) return "outline";
    return "destructive";
  };

  const renderFilterDetails = (rejection: SignalRejection) => {
    const fs = rejection.filters_status;
    const reason = rejection.rejection_reason || "";
    
    // Execution rejections - signals blocked during trade execution
    if (reason.startsWith("EXECUTION:")) {
      return <ExecutionRejectionDisplay filtersStatus={fs} />;
    }
    
    // Already has active signal
    if (reason.includes("active signal")) {
      return <ActiveSignalDisplay />;
    }
    
    // Unified Reversal BLOCK/REDUCE
    if (reason.includes("Unified Reversal") || fs?.decision === "BLOCK" || fs?.decision === "REDUCE") {
      return <UnifiedReversalDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // No clear trade direction
    if (reason.includes("No clear trade direction") || fs?.gate === "NO_CLEAR_DIRECTION") {
      return <NoDirectionDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD BLOCK: Absolute max StochRSI (K >= 98)
    if (reason.includes("HARD BLOCK") || fs?.gate === "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK") {
      return <HardBlockStochRsiDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: ADX too low
    if (reason.includes("HARD GATE: ADX too low") || fs?.gate === "ADX_TOO_LOW") {
      return <HardGateAdxDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: No momentum confirmation
    if (reason.includes("HARD GATE: No momentum") || fs?.gate === "NO_MOMENTUM_CONFIRMATION") {
      return <HardGateMomentumDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: HTF not aligned
    if (reason.includes("HARD GATE: HTF not aligned") || fs?.gate === "HTF_NOT_ALIGNED") {
      return <HardGateHtfDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: Confidence dead zone
    if (reason.includes("HARD GATE: Confidence dead zone") || fs?.gate === "CONFIDENCE_DEAD_ZONE") {
      return <HardGateConfidenceDeadZoneDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: Neutral 4h requires 70%+ confidence OR directional 1h with 65%+
    if (reason.includes("Neutral 4h requires 70%") || reason.includes("NEUTRAL_4H") || fs?.gate === "NEUTRAL_4H_LOW_CONFIDENCE") {
      return <HardGateNeutral4hDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: Bollinger Band Overextension/Underextension
    if (fs?.gate === "BOLLINGER_OVEREXTENSION_GATE" || fs?.gate === "BOLLINGER_UNDEREXTENSION_GATE" || 
        reason.includes("overextended") || reason.includes("underextended")) {
      return <HardGateBollingerExtensionDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: StochRSI Not Rising/Not Falling
    if (fs?.gate === "STOCHRSI_NOT_RISING" || fs?.gate === "STOCHRSI_NOT_FALLING" ||
        reason.includes("StochRSI NOT rising") || reason.includes("StochRSI NOT falling")) {
      return <HardGateStochRsiDirectionDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: Divergence at Extreme (Bearish/Bullish)
    if (fs?.gate === "BEARISH_DIVERGENCE_AT_EXTREME" || fs?.gate === "BULLISH_DIVERGENCE_AT_EXTREME" ||
        (reason.includes("divergence") && reason.includes("extreme"))) {
      return <HardGateDivergenceDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: Momentum Score Too Low
    if (fs?.gate === "MOMENTUM_SCORE_TOO_LOW" || reason.includes("Momentum score too low")) {
      return <HardGateMomentumScoreDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD GATE: MACD Misaligned
    if (fs?.gate === "MACD_MISALIGNED" || reason.includes("MACD") && (reason.includes("misaligned") || reason.includes("not aligned"))) {
      return <HardGateMacdMisalignedDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD BLOCK: Absolute min StochRSI (K <= 2)
    if (fs?.gate === "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK") {
      return <HardBlockStochRsiDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Reversal risk rejection
    if (reason.includes("Reversal risk")) {
      return <ReversalRiskDisplay filtersStatus={fs} />;
    }
    
    // StochRSI extreme rejection
    if (reason.includes("StochRSI extreme")) {
      return <StochRsiExtremeDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }

    // Quality score rejection - show breakdown
    if (reason.includes("Quality score") || reason.includes("No strategy conditions met")) {
      return <QualityScoreBreakdown filtersStatus={fs} />;
    }
    
    // Max trades rejection
    if (reason.includes("Max trades")) {
      return <MaxTradesDisplay filtersStatus={fs} />;
    }
    
    // Market regime rejection (ranging, insufficient trend, etc.)
    if (reason.includes("Market regime") || reason.includes("Insufficient trend") || fs?.regime) {
      return <MarketRegimeDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Default filter details - also show alignment breakdown if available
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {getFilterDetails(fs)}
        </div>
        {rejection.trend_data?.alignmentBreakdown && (
          <MarketRegimeDisplay filtersStatus={fs} trendData={rejection.trend_data} />
        )}
      </div>
    );
  };

  const getFilterDetails = (filtersStatus: any) => {
    const details = [];
    
    // Handle NEUTRAL_4H_LOW_CONFIDENCE gate
    if (filtersStatus?.gate === "NEUTRAL_4H_LOW_CONFIDENCE") {
      details.push(`4h: ${filtersStatus.trend4h} @ ${filtersStatus.confidence4h}%`);
      details.push(`1h: ${filtersStatus.trend1h} @ ${filtersStatus.confidence1h}%`);
      if (filtersStatus.requiredConfidence) {
        details.push(`Required: ${filtersStatus.requiredConfidence}%`);
      }
      if (filtersStatus.adx !== undefined && filtersStatus.adx !== null) {
        const adxValue = typeof filtersStatus.adx === 'number' ? filtersStatus.adx : parseFloat(filtersStatus.adx);
        if (!isNaN(adxValue)) {
          details.push(`ADX: ${adxValue.toFixed(1)}`);
        }
      }
    }
    // Handle alignment issues
    else if (filtersStatus?.aligned === false) {
      details.push(`4h: ${filtersStatus.trend4h}, 1h: ${filtersStatus.trend1h}`);
    }
    
    // Handle confidence-related gates
    if (filtersStatus?.confidence4h !== undefined && filtersStatus?.confidence1h !== undefined && details.length === 0) {
      details.push(`4h: ${filtersStatus.confidence4h}%`);
      details.push(`1h: ${filtersStatus.confidence1h}%`);
    }
    
    if (filtersStatus?.momentumConfirms === false) {
      details.push(
        `Last close alignment: ${filtersStatus.lastCloseAlignsWithTrend ? "Yes" : "No"}`,
        `Divergence: ${filtersStatus.hasDivergence ? "Detected" : "None"}`,
      );
    }
    if (filtersStatus?.inPullback === false && filtersStatus.pullbackPercent !== undefined) {
      details.push(`Pullback: ${filtersStatus.pullbackPercent.toFixed(1)}%`);
    }
    return details.length > 0 ? details.join(" | ") : filtersStatus?.required || "No details available";
  };

  const getRejectionDetails = (rejection: SignalRejection) => {
    const details = [];
    const fs = rejection.filters_status;
    const td = rejection.trend_data;

    if (!fs && !td) return "No data";
    
    // Skip for quality score rejections (handled by visual component)
    if (rejection.rejection_reason?.includes("Quality score") || 
        rejection.rejection_reason?.includes("No strategy conditions met")) {
      // Show strategies evaluated if available
      if (fs?.strategiesEvaluated) {
        return `${fs.strategiesEvaluated} strategies evaluated`;
      }
      return null;
    }
    
    // Max trades rejection (handled by visual component)
    if (rejection.rejection_reason?.includes("Max trades")) {
      return null;
    }
    
    // Active signal rejection (handled by visual component)
    if (rejection.rejection_reason?.includes("active signal")) {
      return null;
    }
    
    // Reversal risk rejection (handled by visual component)
    if (rejection.rejection_reason?.includes("Reversal risk")) {
      return null;
    }
    
    // StochRSI extreme rejection (handled by visual component)
    if (rejection.rejection_reason?.includes("StochRSI extreme")) {
      return null;
    }

    // ADX below 20 rejection
    if (rejection.rejection_reason?.includes("ADX below 20")) {
      const adx = fs.adx ?? td?.volatility?.adx;
      if (adx !== undefined) {
        details.push(`ADX: ${adx.toFixed(1)} (needs ≥20)`);
      }
      return details.join(" | ");
    }

    // Timeframe alignment issues
    if (rejection.rejection_reason?.includes("timeframe")) {
      if (td?.multiTimeframe) {
        const mt = td.multiTimeframe;
        details.push(`4H: ${mt.trend4h ?? "?"} | 1H: ${mt.trend1h ?? "?"}`);
      }
      return details.join(" | ");
    }

    // Momentum issues
    if (rejection.rejection_reason?.includes("momentum")) {
      const m = td?.momentum || fs?.momentum;
      if (m) {
        if (!m.lastCloseAlignsWithTrend) details.push("Price not aligned");
        if (m.hasDivergence) details.push("Divergence detected");
        if (!m.macdDirectionAligned) details.push("MACD misaligned");
      }
      return details.join(" | ");
    }

    return details.length > 0 ? details.join(" | ") : null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>Loading rejection data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (rejections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>No signals rejected in the last 30 minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            All symbols are either generating signals or haven't been analyzed yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              Signal Rejection Reasons (Last 30 Minutes)
            </CardTitle>
            <CardDescription>Why signals are not being generated for each symbol</CardDescription>
          </div>
          {aiEnabled && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
              <Bot className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-500">AI Analysis On</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Symbol</TableHead>
              <TableHead className="w-[200px]">Rejection Reason</TableHead>
              <TableHead className="min-w-[250px]">Score Breakdown</TableHead>
              <TableHead>Details</TableHead>
              {aiEnabled && (
                <TableHead className="w-[180px]">
                <div className="flex items-center gap-1">
                    <Bot className="h-3.5 w-3.5" />
                    AI Analysis
                  </div>
                </TableHead>
              )}
              <TableHead className="w-[100px]">Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rejections.map((rejection) => {
              const severity = getSeverityLevel(rejection.rejection_reason ?? "", rejection.filters_status);
              const severityStyles = getSeverityStyles(severity);
              
              return (
                <TableRow key={rejection.id} className={`${severityStyles.border} ${severityStyles.bg}`}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{rejection.symbol}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] px-1.5 py-0 w-fit ${severityStyles.badge}`}
                            >
                              {severityStyles.label}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs max-w-[200px]">
                            {severity === "critical" && "Absolute block with no exceptions. Trade is completely blocked."}
                            {severity === "high" && "Important gate that blocks trades. Requires significant condition change."}
                            {severity === "medium" && "Softer gate that may be bypassed with strong signals."}
                            {severity === "low" && "Informational block due to limits or execution rules."}
                            {severity === "info" && "Neutral state - not necessarily a problem."}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-start gap-2">
                    {getReasonIcon(rejection.rejection_reason ?? "")}
                    <Badge 
                      variant={getReasonBadgeVariant(rejection.rejection_reason ?? "")}
                      className="text-[10px] font-normal whitespace-normal text-left leading-tight py-1"
                    >
                      {rejection.rejection_reason?.replace(/\s*\([^)]*\)/g, '')}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {renderFilterDetails(rejection)}
                </TableCell>
                <TableCell>
                  {getRejectionDetails(rejection) && (
                    <div className="text-xs text-muted-foreground">
                      {getRejectionDetails(rejection)}
                    </div>
                  )}
                </TableCell>
                {aiEnabled && (
                  <TableCell>
                    <AIAnalysisCell
                      result={rejection.ai_analysis}
                      isLoading={false}
                      error={undefined}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {formatDistanceToNow(new Date(rejection.checked_at), { addSuffix: true })}
                  </Badge>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
