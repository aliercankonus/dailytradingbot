import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  Info,
  ChevronDown,
  Code,
} from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { DirectionContextDisplay } from "@/components/DirectionContextDisplay";

// Helper component to display complex JSON values with tooltip
const JsonValueTooltip = ({ label, value, maxPreviewLength = 50 }: { label: string; value: unknown; maxPreviewLength?: number }) => {
  if (value === null || value === undefined) return null;
  
  const isComplex = typeof value === 'object';
  
  const formatPreview = (val: unknown): string => {
    if (typeof val === 'number') return val.toFixed(2);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') {
      try {
        const entries = Object.entries(val as Record<string, unknown>);
        if (entries.length === 0) return '-';
        const preview = entries.slice(0, 2).map(([k, v]) => `${k}: ${formatPreview(v)}`).join(', ');
        return entries.length > 2 ? `${preview} (+${entries.length - 2})` : preview;
      } catch {
        return '-';
      }
    }
    const str = String(val);
    return str.length > maxPreviewLength ? str.slice(0, maxPreviewLength) + '...' : str;
  };

  const getFullJson = (val: unknown): string => {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  if (!isComplex) {
    return (
      <div className="text-[10px]">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{formatPreview(value)}</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="text-[10px] cursor-help inline-flex items-center gap-1">
            <span className="text-muted-foreground">{label}: </span>
            <span className="font-medium">{formatPreview(value)}</span>
            <Info className="h-3 w-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[400px] max-h-[300px] overflow-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap">
            {getFullJson(value)}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Collapsible raw data viewer for debugging
const RawDataViewer = ({ filtersStatus, trendData }: { filtersStatus: unknown; trendData: unknown }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!filtersStatus && !trendData) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
        <Code className="h-3 w-3" />
        <span>Raw Data</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="space-y-2 p-2 bg-muted/30 rounded border border-border/50 max-h-[200px] overflow-auto">
          {filtersStatus && (
            <div>
              <div className="text-[9px] font-medium text-muted-foreground mb-1">filters_status:</div>
              <pre className="text-[9px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(filtersStatus, null, 2)}
              </pre>
            </div>
          )}
          {trendData && (
            <div className="pt-2 border-t border-border/30">
              <div className="text-[9px] font-medium text-muted-foreground mb-1">trend_data:</div>
              <pre className="text-[9px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(trendData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

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
  fakeBreakoutPenalty: number;
  genuineMomentumBonus: number;
  subtotal: number;
  total: number;
  minRequired: number;
}

const parseBreakdown = (breakdown: string): ScoreBreakdown | null => {
  if (!breakdown) return null;
  
  // Parse format like "ADX:22/25 MOM:0/20 ALIGN:12/20 TECH:10/15 ENTRY:12/25 CONF_PEN:-4 DIR_BONUS:+3 FAKE:-8 GMOM:+5"
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
  
  // Parse OF:-1 or OF:+5 format (can be with or without max value)
  // This handles cases where Order Flow is logged as "OF:-1" instead of "OF:-1/15"
  const ofMatch = breakdown.match(/OF:([+-]?\d+)(?:\/(\d+))?/);
  const orderFlowScore = ofMatch ? parseInt(ofMatch[1]) : 0;
  const orderFlowMax = ofMatch && ofMatch[2] ? parseInt(ofMatch[2]) : 15;
  
  // Parse FAKE:-8 format (fake breakout penalty)
  const fakeMatch = breakdown.match(/FAKE:(-?\d+)/);
  const fakeBreakoutPenalty = fakeMatch ? parseInt(fakeMatch[1]) : 0;
  
  // Parse GMOM:+5 format (genuine momentum bonus)
  const gmomMatch = breakdown.match(/GMOM:\+?(-?\d+)/);
  const genuineMomentumBonus = gmomMatch ? parseInt(gmomMatch[1]) : 0;
  
  if (Object.keys(scores).length === 0 && !ofMatch) return null;
  
  // Calculate subtotal from base components
  const subtotal = (scores.adx?.score ?? 0) + (scores.mom?.score ?? 0) + (scores.align?.score ?? 0) + (scores.tech?.score ?? 0) + (scores.entry?.score ?? 0) + (scores.vol?.score ?? 0) + orderFlowScore;
  
  return {
    adx: scores.adx || { score: 0, max: 25 },
    momentum: scores.mom || { score: 0, max: 20 },
    alignment: scores.align || { score: 0, max: 20 },
    technical: scores.tech || { score: 0, max: 15 },
    entry: scores.entry || { score: 0, max: 25 },
    volume: scores.vol || { score: 0, max: 10 },
    orderFlow: scores.of || { score: orderFlowScore, max: orderFlowMax },
    confidencePenalty,
    directionBonus,
    fakeBreakoutPenalty,
    genuineMomentumBonus,
    subtotal,
    total: subtotal + confidencePenalty + directionBonus + fakeBreakoutPenalty + genuineMomentumBonus,
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

// Helper to get a user-friendly trend label that explains why no direction was derived
const getTrendDisplayLabel = (
  trend: string, 
  trendData?: any, 
  trend4h?: string, 
  trend1h?: string
): { label: string; tooltip: string; variant: 'neutral' | 'conflicting' | 'unknown' } => {
  const normalizedTrend = trend?.toLowerCase();
  
  // Check for explicit directional trends
  if (normalizedTrend === 'bullish') return { label: 'Bullish', tooltip: 'Clear upward trend', variant: 'neutral' };
  if (normalizedTrend === 'bearish') return { label: 'Bearish', tooltip: 'Clear downward trend', variant: 'neutral' };
  
  // Check for neutral/ranging trends
  if (normalizedTrend === 'neutral' || normalizedTrend === 'ranging') {
    return { label: 'Neutral', tooltip: 'Market is ranging without clear direction', variant: 'neutral' };
  }
  
  // For "unknown" - determine WHY it's unknown
  const t4h = trend4h?.toLowerCase() || trendData?.primaryTrend?.toLowerCase() || trendData?.timeframes?.['4h']?.trend?.toLowerCase();
  const t1h = trend1h?.toLowerCase() || trendData?.timeframes?.['1h']?.trend?.toLowerCase();
  
  // Check if timeframes are conflicting (one bullish, one bearish)
  const is4hBullish = t4h === 'bullish';
  const is4hBearish = t4h === 'bearish';
  const is1hBullish = t1h === 'bullish';
  const is1hBearish = t1h === 'bearish';
  
  if ((is4hBullish && is1hBearish) || (is4hBearish && is1hBullish)) {
    return { 
      label: 'Conflicting', 
      tooltip: `Timeframes disagree: 4H is ${t4h || 'unclear'}, 1H is ${t1h || 'unclear'}`, 
      variant: 'conflicting' 
    };
  }
  
  // Check if both are neutral/ranging
  const is4hNeutral = t4h === 'neutral' || t4h === 'ranging';
  const is1hNeutral = t1h === 'neutral' || t1h === 'ranging';
  
  if (is4hNeutral && is1hNeutral) {
    return { label: 'Neutral', tooltip: 'Both timeframes are ranging', variant: 'neutral' };
  }
  
  if (is4hNeutral || is1hNeutral) {
    const directional = is4hNeutral ? '1H' : '4H';
    const neutral = is4hNeutral ? '4H' : '1H';
    return { 
      label: 'Mixed', 
      tooltip: `${neutral} is neutral while ${directional} shows direction`, 
      variant: 'conflicting' 
    };
  }
  
  // Truly unknown - no data available
  return { label: 'Unclear', tooltip: 'Insufficient data to determine trend', variant: 'unknown' };
};

// Helper to get trend label color based on variant
const getTrendLabelStyles = (variant: 'neutral' | 'conflicting' | 'unknown'): string => {
  switch (variant) {
    case 'neutral': return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
    case 'conflicting': return 'text-orange-300 bg-orange-500/20 border-orange-500/40';
    case 'unknown': return 'text-muted-foreground bg-muted/30 border-muted/50';
  }
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
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope ?? trendData?.volatility?.adxSlope, undefined as any);
  const adxRising = filtersStatus?.adxRising ?? trendData?.volatility?.adxRising ?? trendData?.momentum?.adxRising;
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
  
  // ADX slope status for mean reversion diagnostics
  const getAdxSlopeStatus = () => {
    if (adxSlope === undefined || typeof adxSlope !== 'number') return null;
    const isRising = adxRising === true || adxSlope > 0;
    const isFlat = Math.abs(adxSlope) < 0.05;
    const isDeclining = adxSlope < 0;
    
    if (isFlat) return { label: 'Flat', color: 'text-yellow-400', icon: Minus };
    if (isRising) return { label: 'Rising', color: 'text-green-400', icon: TrendingUp };
    if (isDeclining) return { label: 'Declining', color: 'text-red-400', icon: TrendingDown };
    return null;
  };
  
  const adxSlopeStatus = getAdxSlopeStatus();
  
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
      
      {/* ADX Slope indicator for mean reversion diagnostics */}
      {adxSlope !== undefined && typeof adxSlope === 'number' && (
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">ADX Slope</span>
          </div>
          <div className="flex items-center gap-1.5">
            {adxSlopeStatus && (
              <>
                <adxSlopeStatus.icon className={`h-3 w-3 ${adxSlopeStatus.color}`} />
                <span className={`text-[10px] font-medium ${adxSlopeStatus.color}`}>
                  {adxSlopeStatus.label}
                </span>
              </>
            )}
            <span className="text-[10px] font-mono text-muted-foreground">
              ({adxSlope >= 0 ? '+' : ''}{adxSlope.toFixed(3)})
            </span>
          </div>
        </div>
      )}
      
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
  const hasFakeBreakoutPenalty = breakdown && breakdown.fakeBreakoutPenalty !== 0;
  const hasGenuineMomentumBonus = breakdown && breakdown.genuineMomentumBonus > 0;
  const hasAnyAdjustments = hasConfidencePenalty || hasDirectionBonus || hasFakeBreakoutPenalty || hasGenuineMomentumBonus;
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
                    {hasFakeBreakoutPenalty && ` ${breakdown.fakeBreakoutPenalty}`}
                    {hasGenuineMomentumBonus && ` +${breakdown.genuineMomentumBonus}`}
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
          {hasAnyAdjustments && (
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
              {hasFakeBreakoutPenalty && (
                <div className="flex items-center justify-between text-[10px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-400 cursor-help flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fake Breakout:
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px]">
                        <p>-8 penalty when MACD is expanding but ADX is falling, indicating potential fake breakout risk.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-mono text-red-400">{breakdown.fakeBreakoutPenalty}</span>
                </div>
              )}
              {hasGenuineMomentumBonus && (
                <div className="flex items-center justify-between text-[10px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-green-400 cursor-help flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Genuine Momentum:
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px]">
                        <p>+5 bonus when both MACD is expanding AND ADX is rising, indicating genuine momentum buildup.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-mono text-green-400">+{breakdown.genuineMomentumBonus}</span>
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
      {/* Strategy Near-Misses (for NO_STRATEGY_MATCH) */}
      {filtersStatus?.strategyNearMisses && filtersStatus.strategyNearMisses.length > 0 && (
        <StrategyNearMissesDisplay nearMisses={filtersStatus.strategyNearMisses} />
      )}
      
      {/* Fallback Check Info (for NO_STRATEGY_MATCH) */}
      {filtersStatus?.fallbackCheck && (
        <FallbackCheckDisplay fallbackCheck={filtersStatus.fallbackCheck} />
      )}
    </div>
  );
};

// ============= STRATEGY NEAR-MISSES DISPLAY =============
// Shows which strategies came closest to matching for debugging NO_STRATEGY_MATCH
const StrategyNearMissesDisplay = ({ nearMisses }: { nearMisses: any[] }) => {
  if (!nearMisses || nearMisses.length === 0) return null;
  
  return (
    <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
      <div className="flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-xs font-medium text-orange-400">Closest Strategies</span>
      </div>
      <div className="space-y-1.5">
        {nearMisses.slice(0, 3).map((miss, idx) => {
          const passRatio = miss.totalConditions > 0 ? (miss.passedCount / miss.totalConditions) * 100 : 0;
          const isClose = passRatio >= 50;
          
          return (
            <div 
              key={idx} 
              className={`p-1.5 rounded border ${isClose ? 'bg-orange-500/10 border-orange-500/30' : 'bg-muted/30 border-border/50'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-medium ${isClose ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {miss.name}
                </span>
                <span className={`text-[10px] font-mono ${isClose ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {miss.passedCount}/{miss.totalConditions} ({passRatio.toFixed(0)}%)
                </span>
              </div>
              {miss.skipReason && (
                <div className="text-[9px] text-muted-foreground italic">
                  Skip: {miss.skipReason}
                </div>
              )}
              {miss.failedConditions && miss.failedConditions.length > 0 && (
                <div className="text-[9px] text-muted-foreground space-y-0.5">
                  {miss.failedConditions.slice(0, 2).map((fc: any, fcIdx: number) => (
                    <div key={fcIdx} className="flex items-center gap-1">
                      <XCircle className="h-2.5 w-2.5 text-red-400/70" />
                      <span>{fc.condition}</span>
                      {fc.currentValue !== undefined && (
                        <span className="font-mono text-red-400">
                          (got: {typeof fc.currentValue === 'number' ? fc.currentValue.toFixed(2) : fc.currentValue})
                        </span>
                      )}
                    </div>
                  ))}
                  {miss.failedConditions.length > 2 && (
                    <span className="text-muted-foreground/60">+{miss.failedConditions.length - 2} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============= FALLBACK CHECK DISPLAY =============
// Shows why the high-quality fallback was not used
const FallbackCheckDisplay = ({ fallbackCheck }: { fallbackCheck: any }) => {
  if (!fallbackCheck) return null;
  
  const qualityPasses = fallbackCheck.qualityScore >= fallbackCheck.minRequired;
  
  return (
    <div className="pt-2 mt-2 border-t border-border/50 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-medium text-purple-400">Fallback Entry Check</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[9px]">
        <div className={`p-1 rounded ${qualityPasses ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          Quality: {fallbackCheck.qualityScore}/{fallbackCheck.minRequired}
        </div>
        <div className="p-1 rounded bg-muted/30 text-muted-foreground">
          4h: {fallbackCheck.htf4h}
        </div>
        <div className="p-1 rounded bg-muted/30 text-muted-foreground">
          1h: {fallbackCheck.htf1h}
        </div>
        <div className="p-1 rounded bg-muted/30 text-muted-foreground">
          Mom: {fallbackCheck.momentumState}
        </div>
      </div>
      <div className="text-[9px] text-muted-foreground">
        <span className={fallbackCheck.eligible === 'yes' ? 'text-green-400' : 'text-red-400'}>
          {fallbackCheck.eligible === 'yes' ? '✓ Eligible' : `✗ ${fallbackCheck.eligible}`}
        </span>
        {fallbackCheck.reversalScore !== undefined && (
          <span className="ml-2">Reversal: {fallbackCheck.reversalScore}</span>
        )}
      </div>
    </div>
  );
};

// Order Flow Display - shows volume spikes, price rejection, and pressure analysis
const OrderFlowDisplay = ({ orderFlow }: { orderFlow: any }) => {
  if (!orderFlow) return null;
  
  const getScoreColor = (score: number) => {
    if (score >= 60) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };
  
  const getSignalBadge = (signal: string) => {
    switch (signal) {
      case "strong_bullish": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "bullish": return "bg-green-500/10 text-green-400 border-green-500/20";
      case "strong_bearish": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "bearish": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };
  
  return (
    <div className="mt-2 p-2 bg-muted/30 rounded-md space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Order Flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-mono font-medium ${getScoreColor(orderFlow.score || 0)}`}>
            {orderFlow.score || 0}/100
          </span>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${getSignalBadge(orderFlow.signal)}`}>
            {orderFlow.signal || "neutral"}
          </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        {/* Volume Spike */}
        <div className="text-center">
          <div className="text-muted-foreground">Volume</div>
          {orderFlow.volumeSpike?.detected ? (
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${orderFlow.volumeSpike.type === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {orderFlow.volumeSpike.magnitude?.toFixed(1)}x {orderFlow.volumeSpike.type}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Normal</span>
          )}
        </div>
        
        {/* Price Rejection */}
        <div className="text-center">
          <div className="text-muted-foreground">Rejection</div>
          {orderFlow.priceRejection?.detected ? (
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${orderFlow.priceRejection.type?.includes('bullish') ? 'text-green-400' : 'text-red-400'}`}>
              {orderFlow.priceRejection.strength || "weak"}
            </Badge>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </div>
        
        {/* Pressure */}
        <div className="text-center">
          <div className="text-muted-foreground">Pressure</div>
          <span className={orderFlow.pressure?.delta > 0 ? "text-green-400" : orderFlow.pressure?.delta < 0 ? "text-red-400" : "text-muted-foreground"}>
            {orderFlow.pressure?.trend || "neutral"}
          </span>
        </div>
      </div>
      
      {/* Reasons */}
      {orderFlow.reasons?.length > 0 && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30 truncate">
          {orderFlow.reasons.slice(0, 2).join(' | ')}
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
  const reversalRawScore = coerceNumeric(filtersStatus?.reversal_raw_score, 0);
  const reversalAdxWeight = coerceNumeric(filtersStatus?.reversal_adx_weight, 1.0);
  const reversalDecision = filtersStatus?.reversal_decision || "";
  const reversalBreakdown = filtersStatus?.reversal_breakdown || {};
  const reversalReasons = filtersStatus?.reversal_reasons || [];
  
  // Additional context
  const trendRaw = filtersStatus?.trend || trendData?.primaryTrend || "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend;
  const trendInfo = getTrendDisplayLabel(trendRaw, trendData, trendRaw, trend1h);
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
      {(reversalScore > 0 || reversalRawScore > 0) && (
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
          
          {/* Score Calculation Breakdown - shows how raw score becomes final score */}
          {reversalRawScore > 0 && reversalAdxWeight !== 1.0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded text-[9px] cursor-help">
                    <span className="text-muted-foreground">Calculation:</span>
                    <span className="font-mono">
                      <span className="text-orange-400">{reversalRawScore}</span>
                      <span className="text-muted-foreground"> × </span>
                      <span className="text-cyan-400">{reversalAdxWeight.toFixed(2)}</span>
                      <span className="text-muted-foreground"> = </span>
                      <span className={getReversalColor(reversalScore)}>{reversalScore}</span>
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
                  <p>Raw component sum ({reversalRawScore}) × ADX weight ({reversalAdxWeight.toFixed(2)}) = Final score ({reversalScore})</p>
                  <p className="text-muted-foreground mt-1">Lower ADX = lower weight, reducing final score</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Score Breakdown */}
          {Object.keys(reversalBreakdown).length > 0 && (
            <div className="grid grid-cols-2 gap-1 text-[9px]">
              {Object.entries(reversalBreakdown).map(([key, value]) => (
                <div key={key} className="flex justify-between px-1.5 py-0.5 bg-muted/20 rounded">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ').replace('Score', '')}</span>
                  <span className={`font-mono ${Number(value) > 0 ? 'text-orange-400' : Number(value) < 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {Number(value) > 0 ? '+' : ''}{Number(value)}
                  </span>
                </div>
              ))}
              {/* Show raw sum */}
              {reversalRawScore > 0 && (
                <div className="flex justify-between px-1.5 py-0.5 bg-muted/40 rounded col-span-2 border-t border-muted/50 mt-0.5">
                  <span className="text-muted-foreground font-medium">Raw Sum</span>
                  <span className="font-mono text-orange-400 font-medium">{reversalRawScore}</span>
                </div>
              )}
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
  const adxRequired = coerceNumeric(filtersStatus?.adxRequired, 22); // Default per ADX_TOO_LOW doc
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope ?? trendData?.volatility?.adxSlope, 0);
  const adxSlopeLabel = adxSlope > 0.05 ? "Rising" : adxSlope < -0.05 ? "Declining" : "Flat";
  const trendRaw =
    filtersStatus?.trend ||
    trendData?.primaryTrend ||
    trendData?.dominantTrend ||
    trendData?.trend ||
    "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend;
  const trendInfo = getTrendDisplayLabel(trendRaw, trendData, trendRaw, trend1h);
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
    filtersStatus?.macdHistogram ??
    trendData?.timeframes?.["1h"]?.indicators?.macdHistogram ??
    trendData?.timeframes?.["4h"]?.indicators?.macdHistogram;
  const macdHistogramDisplay =
    typeof macdHistogramValue === "number"
      ? macdHistogramValue.toFixed(4)
      : typeof macdHistogramValue === 'string' && macdHistogramValue !== ''
        ? macdHistogramValue
        : "N/A";
  const stochRsi =
    filtersStatus?.stochRsi ||
    trendData?.stochasticRsi?.aggregated ||
    trendData?.stochasticRsi?.["4h"];
  const volatility = filtersStatus?.volatility || trendData?.volatility;
  
  // NEW: Momentum context fields from enriched ADX logging
  const momentumScore = coerceNumeric(filtersStatus?.momentumScore, null);
  const momentumDirection = filtersStatus?.momentumDirection || filtersStatus?.momentum?.direction;
  const momentumState = filtersStatus?.momentumState || filtersStatus?.momentum?.state;
  const derivedDirection = filtersStatus?.derivedDirection || filtersStatus?.direction;
  
  // NEW: Mean reversion context
  const meanReversionChecked = filtersStatus?.meanReversionChecked ?? false;
  const meanReversionDetected = filtersStatus?.meanReversionDetected ?? false;
  const meanReversionDirection = filtersStatus?.meanReversionDirection;
  const meanReversionScore = coerceNumeric(filtersStatus?.meanReversionScore, null);
  const meanReversionAllowed = filtersStatus?.meanReversionAllowed ?? false;
  
  // NEW: Bypass eligibility checks
  const squeezeCheck = filtersStatus?.squeezeCheck;
  const earlyIgnitionCheck = filtersStatus?.earlyIgnitionCheck;
  
  const adxPercent = Math.min((adx / 40) * 100, 100);
  const adxDeficit = Math.max(adxRequired - adx, 0);
  
  // Determine if this is transitional zone (18-22)
  const isTransitionalZone = adx >= 18 && adx < 22;
  const isHardFloor = adx < 18;
  
  return (
    <div className="space-y-3 p-3 bg-red-500/10 rounded-md border border-red-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold text-red-400">
            HARD GATE: ADX Too Low {isHardFloor && "(Hard Floor)"}
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {isHardFloor ? "< 18 Absolute" : `Need +${adxDeficit.toFixed(1)}`}
        </Badge>
      </div>
      
      {/* ADX Visual Bar with zones */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">ADX Trend Strength</span>
          <span className="font-mono text-red-400">{adx.toFixed(1)} / {adxRequired} required</span>
        </div>
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${isHardFloor ? 'bg-red-600' : isTransitionalZone ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${adxPercent}%` }}
          />
          {/* Hard floor marker at 18 */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-red-400"
            style={{ left: `${(18 / 40) * 100}%` }}
          />
          {/* Required threshold marker */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400"
            style={{ left: `${(adxRequired / 40) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Weak (0)</span>
          <span className="text-red-400">Floor (18)</span>
          <span className="text-yellow-400">Req ({adxRequired})</span>
          <span>Strong (40+)</span>
        </div>
      </div>
      
      {/* ADX Slope indicator */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">ADX Slope:</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
          adxSlope > 0.05 ? 'text-green-400 border-green-400/50' : 
          adxSlope < -0.05 ? 'text-red-400 border-red-400/50' : 
          'text-muted-foreground'
        }`}>
          {adxSlope > 0 ? '+' : ''}{adxSlope.toFixed(2)} ({adxSlopeLabel})
        </Badge>
        {isTransitionalZone && adxSlope < 0.05 && (
          <span className="text-amber-400 text-[9px]">⚠️ Slope too low for Squeeze/Ignition bypass</span>
        )}
      </div>
      
      {/* Context Grid - Original 4 fields */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1.5 bg-muted/30 rounded text-center cursor-help">
                <div className="text-muted-foreground">Trend</div>
                <div className={`font-medium ${
                  trendRaw === "bullish" ? "text-green-400" : 
                  trendRaw === "bearish" ? "text-red-400" : 
                  getTrendLabelStyles(trendInfo.variant)
                }`}>
                  {trendRaw === "bullish" || trendRaw === "bearish" 
                    ? trendRaw.charAt(0).toUpperCase() + trendRaw.slice(1)
                    : trendInfo.label}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[180px]">
              <p>{trendInfo.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
          <div className="font-medium capitalize">{momentumState || momentum?.state || "none"}</div>
        </div>
      </div>
      
      {/* NEW: Momentum Context Section */}
      {(momentumScore !== null || momentumDirection || derivedDirection) && (
        <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
          <div className="text-[10px] font-medium text-blue-400 mb-1.5">Momentum Context</div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="p-1 bg-muted/20 rounded text-center">
              <div className="text-muted-foreground text-[9px]">Score</div>
              <div className={`font-mono font-medium ${
                momentumScore !== null && momentumScore > 20 ? 'text-green-400' :
                momentumScore !== null && momentumScore < -20 ? 'text-red-400' :
                'text-muted-foreground'
              }`}>
                {momentumScore !== null ? (momentumScore > 0 ? '+' : '') + momentumScore : '—'}
              </div>
            </div>
            <div className="p-1 bg-muted/20 rounded text-center">
              <div className="text-muted-foreground text-[9px]">Direction</div>
              <div className={`font-medium capitalize ${
                momentumDirection === 'bullish' ? 'text-green-400' :
                momentumDirection === 'bearish' ? 'text-red-400' :
                'text-muted-foreground'
              }`}>
                {momentumDirection || '—'}
              </div>
            </div>
            <div className="p-1 bg-muted/20 rounded text-center">
              <div className="text-muted-foreground text-[9px]">Derived</div>
              <div className={`font-medium uppercase ${
                derivedDirection === 'long' ? 'text-green-400' :
                derivedDirection === 'short' ? 'text-red-400' :
                'text-muted-foreground'
              }`}>
                {derivedDirection || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* NEW: Mean Reversion Status */}
      {meanReversionChecked && (
        <div className={`p-2 rounded border ${
          meanReversionDetected 
            ? meanReversionAllowed 
              ? 'bg-green-500/10 border-green-500/20' 
              : 'bg-amber-500/10 border-amber-500/20'
            : 'bg-muted/20 border-muted/30'
        }`}>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-medium">
              MR Status: {meanReversionDetected ? (meanReversionAllowed ? '✅ Allowed' : '⚠️ Detected but blocked') : '❌ Not detected'}
            </span>
            {meanReversionScore !== null && (
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                Score: {meanReversionScore}
              </Badge>
            )}
          </div>
          {meanReversionDirection && (
            <div className="text-[9px] text-muted-foreground mt-1">
              MR Direction: <span className="font-medium capitalize">{meanReversionDirection}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Bypass Eligibility Checks (for transitional zone) */}
      {isTransitionalZone && (squeezeCheck || earlyIgnitionCheck) && (
        <div className="space-y-1.5 p-2 bg-muted/20 rounded border border-muted/30">
          <div className="text-[10px] font-medium text-muted-foreground">Bypass Checks (18-22 Zone)</div>
          
          {squeezeCheck && (
            <div className="flex items-center justify-between text-[9px]">
              <span>Squeeze Expansion:</span>
              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${squeezeCheck.wouldPass ? 'text-green-400' : 'text-red-400'}`}>
                {squeezeCheck.wouldPass ? '✓ Would Pass' : '✗ Failed'}
              </Badge>
            </div>
          )}
          {squeezeCheck?.failReasons && squeezeCheck.failReasons.length > 0 && (
            <div className="text-[9px] text-muted-foreground pl-2">
              Missing: {squeezeCheck.failReasons.join(', ')}
            </div>
          )}
          
          {earlyIgnitionCheck && (
            <div className="flex items-center justify-between text-[9px]">
              <span>Early Ignition:</span>
              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${earlyIgnitionCheck.wouldPass ? 'text-green-400' : 'text-red-400'}`}>
                {earlyIgnitionCheck.wouldPass ? '✓ Would Pass' : '✗ Failed'}
              </Badge>
            </div>
          )}
          {earlyIgnitionCheck?.failReasons && earlyIgnitionCheck.failReasons.length > 0 && (
            <div className="text-[9px] text-muted-foreground pl-2">
              Missing: {earlyIgnitionCheck.failReasons.join(', ')}
            </div>
          )}
        </div>
      )}
      
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
        <span className="text-red-400">⚠️ Why blocked:</span>{' '}
        {isHardFloor 
          ? "ADX below 18 is an absolute block (no exceptions). Market has no trend energy."
          : isTransitionalZone
            ? `ADX ${adx.toFixed(1)} in transitional zone (18-22). Requires Squeeze Expansion or Early Ignition bypass to proceed.`
            : `ADX ${adx.toFixed(1)} below adaptive threshold of ${adxRequired}. Wait for trend strength to develop.`
        }
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
    filtersStatus?.macdHistogram ??
    trendData?.timeframes?.["1h"]?.indicators?.macdHistogram ??
    trendData?.timeframes?.["4h"]?.indicators?.macdHistogram;
  const macdHistogramDisplay =
    typeof macdHistogramValue === "number"
      ? macdHistogramValue.toFixed(4)
      : typeof macdHistogramValue === 'string' && macdHistogramValue !== ''
        ? macdHistogramValue
        : "N/A";
  
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
      
      {/* Consecutive Candle Counts */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground mb-1">Consecutive Candles (Price Action):</div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className={`p-1.5 rounded text-center text-[10px] ${(momentum?.consecutiveBars1h ?? 0) >= 5 ? 'bg-green-500/20 border border-green-500/30' : 'bg-muted/30'}`}>
            <div className="text-muted-foreground">1H Bars</div>
            <div className={`font-bold ${(momentum?.consecutiveBars1h ?? 0) >= 5 ? 'text-green-400' : (momentum?.consecutiveBars1h ?? 0) >= 3 ? 'text-yellow-400' : ''}`}>
              {momentum?.consecutiveBars1h ?? 'N/A'}
            </div>
            <div className="text-[8px] text-muted-foreground">need 5+</div>
          </div>
          <div className={`p-1.5 rounded text-center text-[10px] ${(momentum?.consecutiveBars30m ?? 0) >= 4 ? 'bg-green-500/20 border border-green-500/30' : 'bg-muted/30'}`}>
            <div className="text-muted-foreground">30M Bars</div>
            <div className={`font-bold ${(momentum?.consecutiveBars30m ?? 0) >= 4 ? 'text-green-400' : (momentum?.consecutiveBars30m ?? 0) >= 3 ? 'text-yellow-400' : ''}`}>
              {momentum?.consecutiveBars30m ?? 'N/A'}
            </div>
            <div className="text-[8px] text-muted-foreground">need 4+</div>
          </div>
          <div className={`p-1.5 rounded text-center text-[10px] ${(momentum?.consecutiveBars15m ?? 0) >= 4 ? 'bg-green-500/20 border border-green-500/30' : 'bg-muted/30'}`}>
            <div className="text-muted-foreground">15M Bars</div>
            <div className={`font-bold ${(momentum?.consecutiveBars15m ?? 0) >= 4 ? 'text-green-400' : (momentum?.consecutiveBars15m ?? 0) >= 3 ? 'text-yellow-400' : ''}`}>
              {momentum?.consecutiveBars15m ?? 'N/A'}
            </div>
            <div className="text-[8px] text-muted-foreground">need 4+</div>
          </div>
        </div>
      </div>
      
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
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
      
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
  const confidenceLocal = coerceNumeric(filtersStatus?.confidenceLocal, 0);
  const trend4h = filtersStatus?.trend4h || extractTimeframeTrend(trendData, "4h");
  const trend1h = filtersStatus?.trend1h || extractTimeframeTrend(trendData, "1h");
  const conf4h = coerceNumeric(trendData?.timeframes?.['4h']?.confidence, 0);
  const conf1h = coerceNumeric(trendData?.timeframes?.['1h']?.confidence, 0);
  const conf30m = coerceNumeric(trendData?.timeframes?.['30m']?.confidence, 0);
  const conf15m = coerceNumeric(trendData?.timeframes?.['15m']?.confidence, 0);
  const is1hCounterTrend = filtersStatus?.is1hCounterTrendTo4h ?? false;
  
  // Determine if 4H is neutral (no directional bias)
  const is4hNeutral = trend4h?.toLowerCase() === 'neutral' || trend4h?.toLowerCase() === 'ranging';
  const is1hDirectional = trend1h?.toLowerCase() !== 'neutral' && trend1h?.toLowerCase() !== 'ranging';
  
  // Calculate local confidence if not provided
  const calculatedLocalConf = confidenceLocal > 0 ? confidenceLocal : 
    Math.round((conf1h * 0.5) + (conf30m * 0.3) + (conf15m * 0.2));
  
  // Bypass hints
  const bypassHints = filtersStatus?.bypassHints;
  const needsConfLocal = bypassHints?.needsConfidenceLocal ?? (65 - calculatedLocalConf);
  const needs1hConf = bypassHints?.needs1hConfidence ?? (65 - conf1h);
  
  // Strong 1H bypass logic: when 4H is neutral, 1H is NOT counter-trend
  // Counter-trend only applies when 4H has a directional bias (bullish/bearish)
  const is1hActuallyCounterTrend = !is4hNeutral && is1hCounterTrend;
  const strong1hPasses = conf1h >= 65 && !is1hActuallyCounterTrend;
  
  // Determine 1H status text
  const get1hStatusText = () => {
    if (conf1h >= 65) {
      if (is4hNeutral) {
        return '(4H neutral - no counter-trend check)';
      } else if (is1hActuallyCounterTrend) {
        return '(blocked: counter-trend to 4H)';
      } else {
        return '(aligned with 4H)';
      }
    }
    return '';
  };
  
  return (
    <div className="space-y-3 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-400">HARD GATE: HTF Not Aligned</span>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/30">
            Global: {confidence}%
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-500/30">
            Local: {calculatedLocalConf}%
          </Badge>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Uses <span className="text-blue-400 font-medium">Local Confidence</span> (15m/30m/1h only) for bypass logic to avoid HTF double-counting
      </div>
      
      {/* Timeframe Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border ${htfAligned ? 'bg-green-500/10 border-green-500/30' : is4hNeutral ? 'bg-blue-500/10 border-blue-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">4H Trend</div>
          <div className="font-medium capitalize text-sm">{trend4h}</div>
          <div className="text-[9px] text-muted-foreground">Conf: {conf4h}%</div>
          {is4hNeutral && (
            <div className="text-[9px] text-blue-400 mt-0.5">ℹ️ No directional bias</div>
          )}
        </div>
        <div className={`p-2 rounded border ${htfAligned ? 'bg-green-500/10 border-green-500/30' : is1hActuallyCounterTrend ? 'bg-orange-500/10 border-orange-500/30' : is1hDirectional ? 'bg-blue-500/10 border-blue-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">1H Trend</div>
          <div className="font-medium capitalize text-sm">{trend1h}</div>
          <div className="text-[9px] text-muted-foreground">Conf: {conf1h}%</div>
          {is1hActuallyCounterTrend && (
            <div className="text-[9px] text-orange-400 mt-0.5">⚠️ Counter-trend to 4H</div>
          )}
          {is4hNeutral && is1hDirectional && (
            <div className="text-[9px] text-blue-400 mt-0.5">ℹ️ 4H neutral - not blocked</div>
          )}
        </div>
      </div>
      
      {/* Requirements Check */}
      <div className="space-y-1">
        <div className={`flex items-center gap-1.5 text-[10px] ${htfAligned ? 'text-green-400' : 'text-red-400'}`}>
          {htfAligned ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          HTF Aligned: {htfAligned ? "Yes" : "No"}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] ${calculatedLocalConf >= 65 ? 'text-green-400' : 'text-red-400'}`}>
          {calculatedLocalConf >= 65 ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          Local Confidence ≥ 65%: {calculatedLocalConf}%
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] ${strong1hPasses ? 'text-green-400' : 'text-red-400'}`}>
          {strong1hPasses ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          Strong 1H (≥65%{!is4hNeutral ? ' + non-counter-trend' : ''}): {conf1h}% {get1hStatusText()}
        </div>
      </div>
      
      {/* What Would Have Passed - FIX #4 */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2 space-y-1">
        <div className="text-[10px] font-semibold text-blue-400 flex items-center gap-1">
          <Info className="h-3 w-3" />
          What would pass this gate:
        </div>
        <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-4 list-disc">
          <li>Local Confidence ≥ 65% <span className="text-blue-400">(need +{Math.max(0, needsConfLocal).toFixed(0)}%)</span></li>
          {is4hNeutral ? (
            <li>1H Confidence ≥ 65% <span className="text-blue-400">(need +{Math.max(0, needs1hConf).toFixed(0)}%)</span> <span className="text-green-400">— 4H neutral, no alignment needed</span></li>
          ) : (
            <li>1H Confidence ≥ 65% + aligned with 4H <span className="text-blue-400">(need +{Math.max(0, needs1hConf).toFixed(0)}%)</span></li>
          )}
          <li>Valid micro-trend (ADX ≥23, volume, 3+ bars, not counter-4H)</li>
          <li>Active override aligned with trade direction</li>
        </ul>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-yellow-400">⚠️ Why blocked:</span>{' '}
        {is4hNeutral ? (
          <>4H is neutral (no directional bias). 1H needs ≥65% confidence to bypass, or local confidence must reach ≥65%.</>
        ) : is1hActuallyCounterTrend ? (
          <>1H trend ({trend1h}) is counter-trend to 4H ({trend4h}). Strong 1H bypass blocked. Need local confidence ≥65% or aligned override.</>
        ) : (
          <>4H and 1H trends don't agree ({trend4h} vs {trend1h}). Need local confidence ≥65% or strong 1H (≥65%) to bypass.</>
        )}
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
  const baseMomentumThreshold = coerceNumeric(filtersStatus?.baseMomentumThreshold, 5);
  const momentumState = filtersStatus?.momentumState || filtersStatus?.momentumStateForGate || trendData?.momentum?.state || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope, 0);
  
  // Threshold adjustment tracking
  const regimeAwareApplied = filtersStatus?.regimeAwareApplied ?? false;
  const regimeAwareTier = filtersStatus?.regimeAwareTier || 'none';
  const regimeAwareMomentumThreshold = coerceNumeric(filtersStatus?.regimeAwareMomentumThreshold, baseMomentumThreshold);
  const momentumStateAdjustmentApplied = filtersStatus?.momentumStateAdjustmentApplied ?? false;
  const momentumStateAdjustmentDelta = coerceNumeric(filtersStatus?.momentumStateAdjustmentDelta, 0);
  
  // Override tracking
  const strongAdxOverrideAttempted = filtersStatus?.strongAdxOverrideAttempted ?? false;
  const strongAdxOverrideApplied = filtersStatus?.strongAdxOverrideApplied ?? false;
  const strongAdxOverrideTier = filtersStatus?.strongAdxOverrideTier || 'none';
  
  // Accelerating trend exception tracking
  const acceleratingTrendExceptionAttempted = filtersStatus?.acceleratingTrendExceptionAttempted ?? false;
  const acceleratingTrendExceptionApplied = filtersStatus?.acceleratingTrendExceptionApplied ?? false;
  const acceleratingTrendExceptionReason = filtersStatus?.acceleratingTrendExceptionReason;
  
  const scorePercent = (momentumScore / 20) * 100; // Assuming max momentum score of 20
  
  // Calculate threshold adjustment chain for display
  const hasThresholdAdjustments = regimeAwareApplied || momentumStateAdjustmentApplied;
  
  return (
    <div className="space-y-3 p-3 bg-orange-500/10 rounded-md border border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">HARD GATE: Momentum Score Too Low</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-400 border-orange-500/30 cursor-help">
                Need +{Math.max(0, momentumRequired - momentumScore)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[280px] text-xs">
              <p className="font-medium mb-1">Threshold adjusts based on trend strength:</p>
              <ul className="space-y-0.5 text-[10px]">
                <li>• ADX ≥35: Threshold = 0 (very strong trend)</li>
                <li>• ADX 33-35: Threshold = 1 (near very strong)</li>
                <li>• ADX ≥30 rising: Threshold = 2 (strong trend)</li>
                <li>• Otherwise: Threshold = 5 (normal)</li>
                <li className="pt-1 border-t border-border/50">• Confirmed state: -1</li>
                <li>• Exhausted state: +1</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
      
      {/* Threshold Adjustment Breakdown */}
      {hasThresholdAdjustments && (
        <div className="space-y-1 text-[10px] p-2 bg-muted/20 rounded border border-border/30">
          <div className="text-muted-foreground font-medium">Threshold Adjustments:</div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Base:</span>
            <span className="font-mono">{baseMomentumThreshold}</span>
          </div>
          {regimeAwareApplied && (
            <div className="flex items-center gap-1">
              <span className="text-blue-400">→ Regime [{regimeAwareTier}]:</span>
              <span className="font-mono text-blue-400">{regimeAwareMomentumThreshold}</span>
            </div>
          )}
          {momentumStateAdjustmentApplied && (
            <div className="flex items-center gap-1">
              <span className={momentumStateAdjustmentDelta < 0 ? "text-green-400" : "text-red-400"}>
                → State [{momentumState}]:
              </span>
              <span className={`font-mono ${momentumStateAdjustmentDelta < 0 ? "text-green-400" : "text-red-400"}`}>
                {momentumStateAdjustmentDelta > 0 ? '+' : ''}{momentumStateAdjustmentDelta}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 pt-1 border-t border-border/30">
            <span className="font-medium text-orange-400">Final required:</span>
            <span className="font-mono font-bold text-orange-400">{momentumRequired}</span>
          </div>
        </div>
      )}
      
      {/* Context Grid */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Score</div>
          <div className={`font-bold ${momentumScore >= momentumRequired ? 'text-green-400' : 'text-orange-400'}`}>
            {momentumScore}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">State</div>
          <div className={`font-medium capitalize ${
            momentumState === 'confirmed' ? 'text-green-400' : 
            momentumState === 'exhausted' ? 'text-red-400' : 
            momentumState === 'building' ? 'text-blue-400' : ''
          }`}>{momentumState}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="font-medium">{adx.toFixed(1)}</div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Slope</div>
          <div className={`font-medium ${adxSlope > 0 ? 'text-green-400' : adxSlope < 0 ? 'text-red-400' : ''}`}>
            {adxSlope > 0 ? '+' : ''}{adxSlope.toFixed(2)}
          </div>
        </div>
      </div>
      
      {/* Override Attempts Info */}
      {strongAdxOverrideAttempted && !strongAdxOverrideApplied && (
        <div className="text-[9px] text-yellow-400 p-1.5 bg-yellow-500/10 rounded border border-yellow-500/20">
          <span className="font-medium">⚠️ Strong ADX Override attempted but failed</span>
          {adx < 30 && <div className="text-muted-foreground">• ADX {adx.toFixed(1)} {"<"} 30 required</div>}
          {adx >= 30 && adxSlope <= 0 && <div className="text-muted-foreground">• ADX slope {adxSlope.toFixed(2)} ≤ 0 (not rising)</div>}
        </div>
      )}
      
      {acceleratingTrendExceptionReason && (
        <div className="text-[9px] text-yellow-400 p-1.5 bg-yellow-500/10 rounded border border-yellow-500/20">
          <span className="font-medium">⚠️ Accelerating Trend Exception not eligible</span>
          <div className="text-muted-foreground">• {acceleratingTrendExceptionReason}</div>
        </div>
      )}
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> Trades with momentum score below {momentumRequired} have 
        extremely low win rates. Wait for stronger momentum confirmation before entry.
      </div>
    </div>
  );
};

// HARD GATE: MACD Misaligned / Order Flow Not Aligned - COMPREHENSIVE DISPLAY
const HardGateMacdMisalignedDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const macdDirectionAligned = filtersStatus?.macdDirectionAligned ?? false;
  const hasMacdDivergence = filtersStatus?.hasMacdDivergence ?? false;
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trendRaw = filtersStatus?.trend || trendData?.primaryTrend || "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend;
  const trendInfo = getTrendDisplayLabel(trendRaw, trendData, trendRaw, trend1h);
  const momentum = filtersStatus?.momentum || trendData?.momentum;
  const derivedDirection = filtersStatus?.derivedDirection || filtersStatus?.direction;
  const regime = filtersStatus?.regime || filtersStatus?.adxPhase || trendData?.marketRegime;
  
  // Order Flow data
  const orderFlow = filtersStatus?.orderFlow || filtersStatus?.order_flow || trendData?.orderFlow;
  const orderFlowScore = orderFlow?.score ?? filtersStatus?.orderFlowScore;
  const orderFlowSignal = orderFlow?.signal ?? filtersStatus?.orderFlowSignal;
  const orderFlowConfirms = filtersStatus?.orderFlowConfirms ?? (orderFlowSignal === derivedDirection);
  
  // Fallback logic data - KEY FIX for user's finding #2
  const fallbackDirection = filtersStatus?.fallbackDirection;
  const fallbackAttempted = filtersStatus?.fallbackAttempted;
  const fallbackReason = filtersStatus?.fallbackReason;
  const fallbackEvaluated = filtersStatus?.fallbackEvaluated ?? false;
  
  // StochRSI data for context
  const stochK4h = coerceNumeric(filtersStatus?.stochRsiK4h ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const stochK1h = coerceNumeric(filtersStatus?.stochRsiK1h ?? trendData?.stochasticRsi?.['1h']?.k, 50);
  const isOversold = stochK4h <= 20;
  const isOverbought = stochK4h >= 80;
  
  // Momentum direction data
  const momentumDirection = filtersStatus?.momentumDirection || momentum?.direction;
  const momentumState = momentum?.state || filtersStatus?.momentumState || 'unknown';
  
  // MACD values
  const macdHistogram = momentum?.macdHistogram ?? trendData?.timeframes?.['1h']?.indicators?.macdHistogram;
  const macdDisplay = typeof macdHistogram === 'number' 
    ? macdHistogram.toFixed(4) 
    : typeof macdHistogram === 'string' && macdHistogram !== '' 
      ? macdHistogram 
      : "N/A";
  
  // Blocking reasons reconstruction
  const blockingReasons: string[] = [];
  if (!macdDirectionAligned) blockingReasons.push("MACD direction not aligned");
  if (hasMacdDivergence) blockingReasons.push("MACD divergence detected");
  if (!orderFlowConfirms && orderFlowScore !== undefined) blockingReasons.push("Order flow not confirming");
  if (regime === 'PARABOLIC' || regime === 'EXHAUSTION') blockingReasons.push(`Counter-trend in ${regime} regime`);
  if (momentumDirection && momentumDirection !== derivedDirection) blockingReasons.push(`Momentum ${momentumDirection} vs ${derivedDirection} entry`);
  if (isOversold && derivedDirection === 'short') blockingReasons.push("HTF StochRSI oversold (bounce risk)");
  if (isOverbought && derivedDirection === 'long') blockingReasons.push("HTF StochRSI overbought (pullback risk)");
  
  // If no specific reasons found, use generic
  if (blockingReasons.length === 0) {
    blockingReasons.push("Price/momentum indicators not aligned with entry direction");
  }
  
  // Determine if this is a fallback logic issue
  const hasFallbackIssue = fallbackDirection && fallbackReason && !fallbackEvaluated;
  const fallbackRegimeMismatch = fallbackReason === 'regime_ranging' && regime && regime !== 'RANGING' && regime !== 'ranging';
  
  return (
    <div className="space-y-3 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-semibold text-yellow-400">
            {orderFlowScore !== undefined ? "Order Flow / MACD Not Aligned" : "HARD GATE: MACD Misaligned"}
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/30">
          ADX: {adx.toFixed(1)} | {regime || 'Unknown'} Regime
        </Badge>
      </div>
      
      {/* Blocking Reasons - KEY FIX for user's finding #1 */}
      <div className="space-y-1.5 p-2 bg-red-500/10 rounded border border-red-500/20">
        <div className="text-[10px] text-red-400 font-medium flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Blocking Reasons:
        </div>
        <div className="space-y-0.5">
          {blockingReasons.map((reason, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-[10px]">
              <XCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
              <span className="text-muted-foreground">{reason}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Direction Context */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">Derived</div>
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 ${
              derivedDirection === 'long' ? 'text-green-400 border-green-500/30' : 
              derivedDirection === 'short' ? 'text-red-400 border-red-500/30' : ''
            }`}
          >
            {derivedDirection?.toUpperCase() || 'N/A'}
          </Badge>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">Momentum</div>
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 ${
              momentumDirection === 'bullish' ? 'text-green-400 border-green-500/30' : 
              momentumDirection === 'bearish' ? 'text-red-400 border-red-500/30' : ''
            }`}
          >
            {momentumDirection || 'Neutral'}
          </Badge>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-[9px] text-muted-foreground">Order Flow</div>
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 ${
              orderFlowSignal === 'bullish' ? 'text-green-400 border-green-500/30' : 
              orderFlowSignal === 'bearish' ? 'text-red-400 border-red-500/30' : ''
            }`}
          >
            {orderFlowSignal || orderFlowScore !== undefined ? `${orderFlowScore}/100` : 'N/A'}
          </Badge>
        </div>
      </div>
      
      {/* MACD & Momentum Checks */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${macdDirectionAligned ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {macdDirectionAligned ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>MACD Direction: {macdDirectionAligned ? "Aligned" : "Not Aligned"}</span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">{macdDisplay}</span>
        </div>
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${!hasMacdDivergence ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {!hasMacdDivergence ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>MACD Divergence: {hasMacdDivergence ? "Detected" : "None"}</span>
        </div>
        {orderFlowScore !== undefined && (
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${orderFlowConfirms ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {orderFlowConfirms ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>Order Flow Confirms: {orderFlowConfirms ? "Yes" : "No"} ({orderFlowScore}/100)</span>
          </div>
        )}
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${adx >= 35 ? 'bg-green-500/10' : 'bg-muted/30'}`}>
          {adx >= 35 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
          <span>ADX Override (≥35): {adx.toFixed(1)}</span>
        </div>
      </div>
      
      {/* StochRSI Context */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className={`p-1.5 rounded border text-center ${isOversold ? 'bg-blue-500/10 border-blue-500/30' : isOverbought ? 'bg-red-500/10 border-red-500/30' : 'bg-muted/30 border-border/50'}`}>
          <div className="text-muted-foreground">4H StochRSI</div>
          <div className={`font-mono font-bold ${isOversold ? 'text-blue-400' : isOverbought ? 'text-red-400' : ''}`}>
            K: {stochK4h.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {isOversold ? "Oversold (bounce risk)" : isOverbought ? "Overbought (pullback risk)" : "Normal"}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded border border-border/50 text-center">
          <div className="text-muted-foreground">1H StochRSI</div>
          <div className="font-mono font-bold">K: {stochK1h.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground">Mom: {momentumState}</div>
        </div>
      </div>
      
      {/* Fallback Logic Analysis - KEY FIX for user's finding #2 */}
      {(fallbackDirection || fallbackReason) && (
        <div className={`p-2 rounded border ${fallbackRegimeMismatch ? 'bg-orange-500/10 border-orange-500/30' : 'bg-muted/30 border-border/50'}`}>
          <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <AlertTriangle className={`h-3 w-3 ${fallbackRegimeMismatch ? 'text-orange-400' : 'text-muted-foreground'}`} />
            Fallback Evaluation:
          </div>
          <div className="grid grid-cols-2 gap-1 text-[9px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fallback Dir:</span>
              <span className={`font-mono ${fallbackDirection === 'long' ? 'text-green-400' : fallbackDirection === 'short' ? 'text-red-400' : ''}`}>
                {fallbackDirection || 'none'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Attempted:</span>
              <span className={fallbackAttempted ? 'text-green-400' : 'text-red-400'}>
                {fallbackAttempted ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Reason:</span>
              <span className={`font-mono ${fallbackRegimeMismatch ? 'text-orange-400' : ''}`}>
                {fallbackReason || 'N/A'}
                {fallbackRegimeMismatch && ` (actual: ${regime})`}
              </span>
            </div>
          </div>
          {fallbackRegimeMismatch && (
            <div className="text-[9px] text-orange-400 mt-1 pt-1 border-t border-orange-500/20">
              ⚠️ Fallback reason mismatch: logged "{fallbackReason}" but actual regime is "{regime}"
            </div>
          )}
          {!fallbackAttempted && fallbackDirection && (
            <div className="text-[9px] text-yellow-400 mt-1 pt-1 border-t border-yellow-500/20">
              💡 Design note: {derivedDirection?.toUpperCase()} blocked → {fallbackDirection?.toUpperCase()} not evaluated
            </div>
          )}
        </div>
      )}
      
      {/* Trend Context */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1.5 bg-muted/30 rounded text-center cursor-help">
                <div className="text-muted-foreground">Trend</div>
                <div className={`font-medium ${
                  trendRaw === "bullish" ? "text-green-400" : 
                  trendRaw === "bearish" ? "text-red-400" : 
                  getTrendLabelStyles(trendInfo.variant)
                }`}>
                  {trendRaw === "bullish" || trendRaw === "bearish" 
                    ? trendRaw.charAt(0).toUpperCase() + trendRaw.slice(1)
                    : trendInfo.label}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[180px]">
              <p>{trendInfo.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">MACD Hist</div>
          <div className={`font-mono ${Number(macdHistogram) > 0 ? 'text-green-400' : Number(macdHistogram) < 0 ? 'text-red-400' : ''}`}>
            {macdDisplay}
          </div>
        </div>
        <div className="p-1.5 bg-muted/30 rounded text-center">
          <div className="text-muted-foreground">Momentum</div>
          <div className={`font-medium capitalize ${
            momentumState === 'confirmed' ? 'text-green-400' :
            momentumState === 'building' ? 'text-blue-400' :
            momentumState === 'exhausted' ? 'text-red-400' : ''
          }`}>{momentumState}</div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-yellow-400">⚠️ Why blocked:</span> {blockingReasons[0]}.{' '}
        {hasMacdDivergence 
          ? "Divergence detected between price and MACD, indicating weakening momentum."
          : adx < 35 
            ? "Wait for MACD to align with entry direction or for ADX to exceed 35 for override."
            : "Multiple alignment issues detected. Review the checks above."
        }
      </div>
    </div>
  );
};

// HTF Extreme Gate Display - for 4h oversold/overbought blocking
const HTFExtremeGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const stochRsiK4h = coerceNumeric(filtersStatus?.stochRsiK4h ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const percentB = coerceNumeric(filtersStatus?.percentB ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "unknown";
  const isOversold = stochRsiK4h <= 20 && percentB <= 20;
  const isOverbought = stochRsiK4h >= 80 && percentB >= 80;
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${isOversold ? 'bg-blue-500/10 border-blue-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Ban className={`h-4 w-4 ${isOversold ? 'text-blue-500' : 'text-red-500'}`} />
          <span className={`text-xs font-semibold ${isOversold ? 'text-blue-400' : 'text-red-400'}`}>
            HTF EXTREME GATE: 4H {isOversold ? "Oversold" : "Overbought"}
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {direction.toUpperCase()} Blocked
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {isOversold 
          ? "SHORT blocked: 4H is oversold - high probability of bounce/reversal"
          : "LONG blocked: 4H is overbought - high probability of pullback/reversal"
        }
      </div>
      
      {/* Indicators Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border text-center ${stochRsiK4h <= 20 || stochRsiK4h >= 80 ? 'bg-red-500/20 border-red-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">4H StochRSI K</div>
          <div className={`text-lg font-bold ${stochRsiK4h <= 20 ? 'text-blue-400' : stochRsiK4h >= 80 ? 'text-red-400' : ''}`}>
            {stochRsiK4h.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {stochRsiK4h <= 20 ? "≤20 Oversold" : stochRsiK4h >= 80 ? "≥80 Overbought" : "Normal"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${percentB <= 20 || percentB >= 80 ? 'bg-red-500/20 border-red-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">4H Bollinger %B</div>
          <div className={`text-lg font-bold ${percentB <= 20 ? 'text-blue-400' : percentB >= 80 ? 'text-red-400' : ''}`}>
            {percentB.toFixed(1)}%
          </div>
          <div className="text-[9px] text-muted-foreground">
            {percentB <= 20 ? "≤20 Lower zone" : percentB >= 80 ? "≥80 Upper zone" : "Normal"}
          </div>
        </div>
      </div>
      
      {/* NEW: Multi-TF StochRSI Panel for complete picture */}
      <MultiTimeframeStochRSIPanel filtersStatus={filtersStatus} trendData={trendData} />
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={isOversold ? "text-blue-400" : "text-red-400"}>⚠️ Why blocked:</span>{" "}
        {isOversold 
          ? "When both StochRSI K ≤20 AND %B ≤20 on 4H, shorting against a potential reversal is statistically poor. Wait for bounce confirmation."
          : "When both StochRSI K ≥80 AND %B ≥80 on 4H, going long at extreme overbought is high risk. Wait for pullback."
        }
      </div>
    </div>
  );
};

// Bollinger Long Gate Display - for longs above upper BB
const BollingerLongGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const percentB = coerceNumeric(filtersStatus?.percentB ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const isStrongBullishTrend = filtersStatus?.isStrongBullishTrend ?? false;
  const isBullishTrendConfirmed = filtersStatus?.isBullishTrendConfirmed ?? false;
  const isInSqueeze = filtersStatus?.isInSqueeze4h ?? filtersStatus?.isInSqueeze ?? false;
  
  // Dynamic threshold based on trend
  const required = isStrongBullishTrend ? 95 : isBullishTrendConfirmed ? 85 : 65;
  const excess = percentB - required;
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-orange-500/10 border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Ban className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">
            BOLLINGER LONG GATE
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          %B = {percentB.toFixed(1)} (need -{excess.toFixed(1)})
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Longs require %B ≤{required} to avoid buying at resistance
        {isStrongBullishTrend && " (relaxed: strong bullish trend)"}
        {!isStrongBullishTrend && isBullishTrendConfirmed && " (relaxed: bullish trend confirmed)"}
      </div>
      
      {/* Visual %B position - inverted from SHORT */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Bollinger %B Position</span>
          <span className="font-mono text-orange-400">{percentB.toFixed(1)}% / ≤{required}% required</span>
        </div>
        <div className="relative h-3 bg-muted/30 rounded-full overflow-hidden">
          {/* Green zone on LEFT (low %B allowed) */}
          <div className="absolute left-0 h-full bg-green-500/30" style={{ width: `${required}%` }} />
          {/* Red zone on RIGHT (high %B blocked) */}
          <div className="absolute h-full bg-red-500/30" style={{ left: `${required}%`, right: 0 }} />
          {/* Current position marker */}
          <div 
            className="absolute h-full w-1 bg-orange-500 rounded-full"
            style={{ left: `${Math.min(Math.max(percentB, 0), 100)}%` }}
          />
          {/* Threshold marker */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400"
            style={{ left: `${required}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span className="text-green-400">Allowed (≤{required}%)</span>
          <span className="text-red-400">Blocked (&gt;{required}%)</span>
        </div>
      </div>
      
      {/* Trend context */}
      {(isStrongBullishTrend || isBullishTrendConfirmed) && (
        <div className="flex items-center gap-1.5 p-1.5 bg-green-500/20 rounded text-[10px] text-green-400">
          <TrendingUp className="h-3 w-3" />
          <span>
            {isStrongBullishTrend ? "Strong bullish trend - threshold relaxed to 95%" : "Bullish trend confirmed - threshold relaxed to 85%"}
          </span>
        </div>
      )}
      
      {isInSqueeze && (
        <div className="flex items-center gap-1.5 p-1.5 bg-purple-500/20 rounded text-[10px] text-purple-400">
          <Layers className="h-3 w-3" />
          <span>Squeeze active - volatility compression detected</span>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> Buying above upper Bollinger Band (%B &gt; {required}) has poor risk/reward - price is extended. Wait for pullback to %B ≤{required}%.
      </div>
    </div>
  );
};

// Bollinger Short Gate Display - for shorts below lower BB
const BollingerShortGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const percentB = coerceNumeric(filtersStatus?.percentB ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const required = coerceNumeric(filtersStatus?.requiredPercentB, 40);
  const isInSqueeze = filtersStatus?.isInSqueeze4h ?? filtersStatus?.isInSqueeze ?? false;
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "short";
  const deficit = required - percentB;
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-orange-500/10 border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Ban className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-orange-400">
            BOLLINGER {direction.toUpperCase()} GATE
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          %B = {percentB.toFixed(1)} (need +{deficit.toFixed(1)})
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {direction === "short" ? "Shorts" : "Longs"} require %B ≥{required} to avoid {direction === "short" ? "shorting in bounce zones" : "entering at resistance"}
        {isInSqueeze && " (stricter threshold during squeeze)"}
      </div>
      
      {/* Visual %B position */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Bollinger %B Position</span>
          <span className="font-mono text-orange-400">{percentB.toFixed(1)}% / {required}% required</span>
        </div>
        <div className="relative h-3 bg-muted/30 rounded-full overflow-hidden">
          <div className="absolute left-0 h-full bg-red-500/30" style={{ width: `${required}%` }} />
          <div className="absolute h-full bg-green-500/30" style={{ left: `${required}%`, right: 0 }} />
          <div 
            className="absolute h-full w-1 bg-orange-500 rounded-full"
            style={{ left: `${Math.min(Math.max(percentB, 0), 100)}%` }}
          />
          {/* Threshold marker */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400"
            style={{ left: `${required}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span className="text-red-400">Blocked (&lt;{required}%)</span>
          <span className="text-green-400">Allowed (≥{required}%)</span>
        </div>
      </div>
      
      {/* Squeeze indicator */}
      {isInSqueeze && (
        <div className="flex items-center gap-1.5 p-1.5 bg-purple-500/20 rounded text-[10px] text-purple-400">
          <Layers className="h-3 w-3" />
          <span>Squeeze active - using stricter threshold</span>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span> {direction === "short" 
          ? `Shorting below lower Bollinger Band (%B < ${required}) has poor statistics - price is likely to revert to mean. Wait for %B to rise above ${required}%.`
          : `Buying above upper Bollinger Band has poor risk/reward. Wait for pullback.`
        }
      </div>
    </div>
  );
};

// Squeeze Context Gate Display - for mean-reversion regime blocking
const SqueezeContextGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const marketContext = filtersStatus?.marketContext || "MEAN_REVERSION";
  const stochRsiK4h = coerceNumeric(filtersStatus?.stochRsiK4h ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const squeezePercent = coerceNumeric(filtersStatus?.squeezePercent ?? trendData?.bollingerBands?.['4h']?.squeezeIntensity ?? trendData?.bb?.['4h']?.squeezePercent, 0);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "short";
  const isInSqueeze = filtersStatus?.isInSqueeze4h ?? filtersStatus?.isInSqueeze ?? true;
  const isOversold = stochRsiK4h <= 20;
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-purple-500/10 border-purple-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-purple-500" />
          <span className="text-xs font-semibold text-purple-400">
            SQUEEZE CONTEXT GATE
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {direction.toUpperCase()} Blocked
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        4H squeeze active + extreme StochRSI → {marketContext} context → trend-continuation {direction}s blocked
      </div>
      
      {/* Context Indicators */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border text-center ${isInSqueeze ? 'bg-purple-500/20 border-purple-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">4H Squeeze</div>
          <div className={`text-lg font-bold ${isInSqueeze ? 'text-purple-400' : 'text-muted-foreground'}`}>
            {squeezePercent > 0 ? `${squeezePercent.toFixed(0)}%` : 'Active'}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {isInSqueeze ? "Volatility compression" : "Normal"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${isOversold ? 'bg-blue-500/20 border-blue-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">4H StochRSI K</div>
          <div className={`text-lg font-bold ${isOversold ? 'text-blue-400' : 'text-red-400'}`}>
            {stochRsiK4h.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {isOversold ? "Oversold zone" : "Overbought zone"}
          </div>
        </div>
      </div>
      
      {/* Context explanation */}
      <div className="flex items-center gap-1.5 p-1.5 bg-purple-500/20 rounded text-[10px] text-purple-400">
        <Target className="h-3 w-3" />
        <span>Context: {marketContext} - favor reversions, not continuation</span>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-purple-400">⚠️ Why blocked:</span> Squeeze + extreme StochRSI = mean-reversion context. 
        {isOversold 
          ? ` Trend-continuation ${direction}s are blocked. Only pullbacks or squeeze breakouts in the opposite direction are valid.`
          : ` Trend-continuation ${direction}s are blocked. Wait for squeeze resolution or extreme to normalize.`
        }
      </div>
    </div>
  );
};

// ============= BE PREVENTION GATES =============
// These gates focus on preventing break-even trades through graduated position sizing

// ADX Slope Graduated Gate - blocks/reduces when ADX is declining with low energy
const AdxSlopeGraduatedDisplay = ({ filtersStatus, trendData, rejectionReason }: { filtersStatus: any; trendData?: any; rejectionReason?: string }) => {
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope ?? trendData?.volatility?.adxSlope, 0);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "unknown";
  
  // Bollinger Breakdown Override data
  const percentB = coerceNumeric(filtersStatus?.percentB ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const stochRsiK4h = coerceNumeric(filtersStatus?.stochRsiK4h ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const bollingerBreakdownChecked = filtersStatus?.bollingerBreakdownChecked === true;
  
  // Check if rejection reason indicates a block (fallback for missing positionMultiplier)
  const reasonIndicatesBlock = rejectionReason?.toLowerCase().includes('blocked') ?? false;
  
  // Determine actual outcome - use positionMultiplier if present, otherwise infer from rejection reason
  const hasExplicitMultiplier = filtersStatus?.positionMultiplier !== undefined || filtersStatus?.multiplier !== undefined;
  const positionMultiplier = hasExplicitMultiplier 
    ? coerceNumeric(filtersStatus?.positionMultiplier ?? filtersStatus?.multiplier, 1)
    : (reasonIndicatesBlock ? 0 : 1);
  
  const isHardBlock = positionMultiplier <= 0 || filtersStatus?.blocked === true || reasonIndicatesBlock;
  const isSizeReduced = !isHardBlock && positionMultiplier < 1;
  const isAllowed = !isHardBlock && positionMultiplier >= 1;
  
  // Check if this was allowed via Bollinger Breakdown Override
  const isBollingerOverride = isSizeReduced && bollingerBreakdownChecked && (
    (direction === 'short' && percentB <= 20 && stochRsiK4h > 15 && stochRsiK4h < 85) ||
    (direction === 'long' && percentB >= 80 && stochRsiK4h > 15 && stochRsiK4h < 85)
  );
  
  // ADX thresholds
  const highAdxThreshold = 55;
  const lowEnergyThreshold = 50;
  const hasHighAdxException = adx >= highAdxThreshold;
  const isLowEnergy = adx < lowEnergyThreshold;
  
  // Slope classification - MUST match actual values
  const isDecliningSlope = adxSlope < 0;
  const isSeverelyDeclining = adxSlope < -0.5;
  const isModeratelyDeclining = adxSlope >= -0.5 && adxSlope < -0.2;
  const isSlightlyDeclining = adxSlope >= -0.2 && adxSlope < 0;
  const isRisingOrStable = adxSlope >= 0;
  
  const slopeStatus = isSeverelyDeclining ? "Severely Declining" : 
                     isModeratelyDeclining ? "Moderately Declining" : 
                     isSlightlyDeclining ? "Slightly Declining" : 
                     adxSlope > 0.1 ? "Rising" : "Stable";
  
  // Color scheme based on outcome
  const outcomeColors = isHardBlock 
    ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-500' }
    : isSizeReduced
    ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-500' }
    : { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-500' };
  
  // Header description MUST match actual values
  const getHeaderDescription = () => {
    if (isAllowed) {
      if (isRisingOrStable && adx >= 25) {
        return "ADX strength and slope support continuation. No BE sizing applied.";
      }
      if (hasHighAdxException && isDecliningSlope) {
        return "ADX slope is declining but high energy reservoir (≥55) provides exception.";
      }
      return "ADX conditions sufficient for full position sizing.";
    }
    if (isSizeReduced) {
      if (isBollingerOverride) {
        return `Bollinger Breakdown Override: Price ${direction === 'short' ? 'below lower band' : 'above upper band'} with StochRSI runway allows reduced entry despite declining ADX slope.`;
      }
      if (isDecliningSlope && isLowEnergy) {
        return "ADX slope is declining while energy reservoir is low for reliable continuation.";
      }
      if (isDecliningSlope) {
        return "ADX slope is declining, reducing position size to manage late-entry risk.";
      }
      return "Position sized down based on ADX conditions.";
    }
    // Hard block
    if (isSeverelyDeclining && isLowEnergy) {
      return "ADX slope is severely declining with exhausted energy reservoir.";
    }
    return "ADX conditions indicate elevated BE risk.";
  };
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${outcomeColors.bg} ${outcomeColors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isAllowed ? (
            <CheckCircle2 className={`h-4 w-4 ${outcomeColors.icon}`} />
          ) : (
            <TrendingDown className={`h-4 w-4 ${outcomeColors.icon}`} />
          )}
          <span className={`text-xs font-semibold ${outcomeColors.text}`}>
            ADX SLOPE GRADUATED {isAllowed ? "– ALLOWED" : isBollingerOverride ? "– BB OVERRIDE" : "GATE"}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
            BE Prevention
          </Badge>
          {isBollingerOverride && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/20 text-blue-400 border-blue-500/30">
              Bollinger Override
            </Badge>
          )}
        </div>
        <Badge 
          variant={isHardBlock ? "destructive" : isAllowed ? "secondary" : "secondary"} 
          className={`text-[10px] px-1.5 py-0 ${isAllowed ? 'bg-green-500/20 text-green-400' : ''}`}
        >
          {isHardBlock ? "🚫 BLOCKED" : isAllowed ? "✓ 100% Size" : `📉 ${(positionMultiplier * 100).toFixed(0)}% Size`}
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {getHeaderDescription()}
      </div>
      
      {/* ADX & Slope Gauges */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded border text-center ${adx >= 55 ? 'bg-green-500/20 border-green-500/30' : adx >= 50 ? 'bg-yellow-500/20 border-yellow-500/30' : adx >= 25 ? 'bg-blue-500/20 border-blue-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">ADX (Energy)</div>
          <div className={`text-lg font-bold ${adx >= 55 ? 'text-green-400' : adx >= 50 ? 'text-yellow-400' : adx >= 25 ? 'text-blue-400' : 'text-red-400'}`}>
            {adx.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {adx >= 55 ? "High (Exception)" : adx >= 50 ? "Moderate" : adx >= 25 ? "Healthy" : "Low Risk"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${isRisingOrStable ? 'bg-green-500/20 border-green-500/30' : isSlightlyDeclining ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">ADX Slope</div>
          <div className={`text-lg font-bold ${isRisingOrStable ? 'text-green-400' : isSlightlyDeclining ? 'text-yellow-400' : 'text-red-400'}`}>
            {adxSlope >= 0 ? '+' : ''}{adxSlope.toFixed(2)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {slopeStatus}
          </div>
        </div>
      </div>
      
      {/* Bollinger Breakdown Override Details - show when applicable */}
      {(isBollingerOverride || bollingerBreakdownChecked) && (
        <div className={`grid grid-cols-2 gap-2 p-2 rounded border ${isBollingerOverride ? 'bg-blue-500/10 border-blue-500/30' : 'bg-muted/30 border-muted/30'}`}>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">Bollinger %B (4H)</div>
            <div className={`text-sm font-bold ${percentB <= 20 ? 'text-red-400' : percentB >= 80 ? 'text-green-400' : 'text-muted-foreground'}`}>
              {percentB.toFixed(1)}%
            </div>
            <div className="text-[9px] text-muted-foreground">
              {percentB <= 20 ? "Below Lower Band" : percentB >= 80 ? "Above Upper Band" : "Within Bands"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">StochRSI K (4H)</div>
            <div className={`text-sm font-bold ${stochRsiK4h <= 15 || stochRsiK4h >= 85 ? 'text-red-400' : 'text-green-400'}`}>
              {stochRsiK4h.toFixed(1)}
            </div>
            <div className="text-[9px] text-muted-foreground">
              {stochRsiK4h <= 15 ? "Oversold (No Runway)" : stochRsiK4h >= 85 ? "Overbought (No Runway)" : "Has Runway"}
            </div>
          </div>
        </div>
      )}
      
      {/* Exception Check - only show if applicable */}
      {hasHighAdxException && isDecliningSlope && !isBollingerOverride && (
        <div className="flex items-center gap-1.5 p-1.5 bg-green-500/20 rounded text-[10px] text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          <span>High ADX Exception: Energy reservoir ≥{highAdxThreshold} allows reduced entry at {(positionMultiplier * 100).toFixed(0)}%</span>
        </div>
      )}
      
      {/* Bollinger Override Exception notice */}
      {isBollingerOverride && (
        <div className="flex items-center gap-1.5 p-1.5 bg-blue-500/20 rounded text-[10px] text-blue-400">
          <CheckCircle2 className="h-3 w-3" />
          <span>Bollinger Breakdown Override: {direction === 'short' ? 'Price below lower band' : 'Price above upper band'} (%B={percentB.toFixed(1)}) with StochRSI runway (K={stochRsiK4h.toFixed(1)}) bypasses declining ADX slope block</span>
        </div>
      )}
      
      {/* Contextual Assessment - ONLY show relevant messaging */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        {isHardBlock ? (
          <>
            <span className="text-red-400">🚫 Why rejected: </span>
            ADX &lt; 50 with severely declining slope (&lt; -0.5) indicates exhausted trend energy. 
            {bollingerBreakdownChecked && ` Bollinger override not satisfied (%B=${percentB.toFixed(1)}, K=${stochRsiK4h.toFixed(1)}).`}
            {' '}Entry blocked to prevent BE outcome.
          </>
        ) : isSizeReduced ? (
          <>
            <span className="text-amber-400">📉 Why size reduced: </span>
            {isBollingerOverride 
              ? `Bollinger breakdown override allows entry despite declining ADX slope (${adxSlope.toFixed(2)}). Position sized at ${(positionMultiplier * 100).toFixed(0)}% due to lagging ADX confirmation.`
              : isDecliningSlope 
              ? `Declining ADX slope (${adxSlope.toFixed(2)}) suggests fading momentum. Position sized at ${(positionMultiplier * 100).toFixed(0)}% to manage late-entry risk.`
              : `ADX conditions warrant caution. Position sized at ${(positionMultiplier * 100).toFixed(0)}%.`
            }
          </>
        ) : (
          <>
            <span className="text-green-400">ℹ️ Assessment: </span>
            {isRisingOrStable && adx >= 25 
              ? "ADX strength and positive/stable slope support continuation. Full position size permitted."
              : hasHighAdxException
              ? "High energy reservoir provides sufficient buffer. Full position size permitted."
              : "No BE risk factors detected. Full position size permitted."
            }
          </>
        )}
      </div>
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
    </div>
  );
};

// High ADX 1h Confirmation Gate - requires LTF confirmation when HTF is strong
const HighAdx1hConfirmationDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend || "neutral";
  const trend30m = filtersStatus?.trend30m || trendData?.timeframes?.['30m']?.trend || "unknown";
  const positionMultiplier = coerceNumeric(filtersStatus?.positionMultiplier ?? filtersStatus?.multiplier, 1);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "unknown";
  
  // Determine actual outcome
  const isHardBlock = positionMultiplier <= 0 || filtersStatus?.blocked === true;
  const isSizeReduced = !isHardBlock && positionMultiplier < 1;
  const isAllowed = !isHardBlock && positionMultiplier >= 1;
  
  const is1hNeutral = trend1h.toLowerCase() === "neutral" || trend1h.toLowerCase() === "ranging";
  const is1hAligned = (direction.toLowerCase() === "long" && trend1h.toLowerCase() === "bullish") ||
                      (direction.toLowerCase() === "short" && trend1h.toLowerCase() === "bearish");
  const is30mAligned = trend30m.toLowerCase() === direction.toLowerCase() || 
                       (direction === "long" && trend30m.toLowerCase() === "bullish") ||
                       (direction === "short" && trend30m.toLowerCase() === "bearish");
  const has30mException = is1hNeutral && is30mAligned;
  
  // Gate only relevant when ADX >= 55 AND 1h is neutral
  const gateConditionsMet = adx >= 55 && is1hNeutral;
  
  // Color scheme based on outcome
  const outcomeColors = isHardBlock 
    ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-500' }
    : isSizeReduced
    ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-500' }
    : { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-500' };
  
  // Header description based on actual conditions
  const getHeaderDescription = () => {
    if (isAllowed) {
      if (is1hAligned) {
        return "1h timeframe confirms the trade direction. Full position size permitted.";
      }
      if (adx < 55) {
        return "ADX below high threshold (55). Standard confirmation rules apply.";
      }
      return "LTF confirmation conditions met. Full position size permitted.";
    }
    if (isSizeReduced) {
      if (gateConditionsMet) {
        return "ADX is strong (≥55) but 1h timeframe hasn't confirmed the move yet - a key BE pattern.";
      }
      return "Position size reduced based on confirmation status.";
    }
    return "Entry blocked due to missing LTF confirmation with high ADX.";
  };
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${outcomeColors.bg} ${outcomeColors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isAllowed ? (
            <CheckCircle2 className={`h-4 w-4 ${outcomeColors.icon}`} />
          ) : (
            <Timer className={`h-4 w-4 ${outcomeColors.icon}`} />
          )}
          <span className={`text-xs font-semibold ${outcomeColors.text}`}>
            HIGH ADX 1H CONFIRMATION {isAllowed ? "– ALLOWED" : "GATE"}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
            BE Prevention
          </Badge>
        </div>
        <Badge 
          variant={isHardBlock ? "destructive" : "secondary"} 
          className={`text-[10px] px-1.5 py-0 ${isAllowed ? 'bg-green-500/20 text-green-400' : ''}`}
        >
          {isHardBlock ? "🚫 BLOCKED" : isAllowed ? "✓ 100% Size" : `📉 ${(positionMultiplier * 100).toFixed(0)}% Size`}
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {getHeaderDescription()}
      </div>
      
      {/* Confirmation Status */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`p-2 rounded border text-center ${adx >= 55 ? 'bg-green-500/20 border-green-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">ADX</div>
          <div className={`text-lg font-bold ${adx >= 55 ? 'text-green-400' : 'text-muted-foreground'}`}>
            {adx.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {adx >= 55 ? "Strong" : "Below Threshold"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${is1hAligned ? 'bg-green-500/20 border-green-500/30' : is1hNeutral ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
          <div className="text-[10px] text-muted-foreground">1h Trend</div>
          <div className={`text-sm font-bold ${is1hAligned ? 'text-green-400' : is1hNeutral ? 'text-yellow-400' : 'text-red-400'}`}>
            {trend1h}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {is1hAligned ? "✓ Confirmed" : is1hNeutral ? "⚠️ Neutral" : "✗ Opposing"}
          </div>
        </div>
        <div className={`p-2 rounded border text-center ${is30mAligned ? 'bg-green-500/20 border-green-500/30' : 'bg-muted/30 border-muted/50'}`}>
          <div className="text-[10px] text-muted-foreground">30m Trend</div>
          <div className={`text-sm font-bold ${is30mAligned ? 'text-green-400' : 'text-muted-foreground'}`}>
            {trend30m}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {is30mAligned ? "✓ Aligned" : "Not Aligned"}
          </div>
        </div>
      </div>
      
      {/* Exception Note - only when applicable */}
      {has30mException && isSizeReduced && (
        <div className="flex items-center gap-1.5 p-1.5 bg-blue-500/20 rounded text-[10px] text-blue-400">
          <Info className="h-3 w-3" />
          <span>30m Exception: 30m trend aligned → position allowed at 60% instead of 40%</span>
        </div>
      )}
      
      {/* Contextual Assessment */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        {isHardBlock ? (
          <>
            <span className="text-red-400">🚫 Why rejected: </span>
            High ADX with no LTF confirmation indicates elevated BE risk. Entry blocked.
          </>
        ) : isSizeReduced ? (
          <>
            <span className="text-amber-400">📉 Why size reduced: </span>
            {`83% of BE trades with high ADX had 1h = neutral. This is an HTF-only entry before LTF ignition. Position sized at ${(positionMultiplier * 100).toFixed(0)}% to reduce BE risk.`}
          </>
        ) : (
          <>
            <span className="text-green-400">ℹ️ Assessment: </span>
            {is1hAligned 
              ? "1h trend confirms trade direction. LTF ignition complete - full position size permitted."
              : adx < 55
              ? "ADX below high threshold. Standard entry criteria apply - full position size permitted."
              : "Confirmation conditions satisfied. Full position size permitted."
            }
          </>
        )}
      </div>
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
    </div>
  );
};

// StochRSI Runway Gate - prevents entries with limited directional room
const StochRsiRunwayDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK ?? filtersStatus?.stochK ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope ?? trendData?.volatility?.adxSlope, 0);
  const positionMultiplier = coerceNumeric(filtersStatus?.positionMultiplier ?? filtersStatus?.multiplier, 1);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "unknown";
  const bothLtfNeutral = filtersStatus?.bothLtfNeutral ?? false;
  
  // Determine actual outcome
  const isHardBlock = positionMultiplier <= 0 || filtersStatus?.blocked === true;
  const isSizeReduced = !isHardBlock && positionMultiplier < 1;
  const isAllowed = !isHardBlock && positionMultiplier >= 1;
  
  const isShort = direction.toLowerCase() === "short" || direction.toLowerCase() === "bearish";
  const isLong = direction.toLowerCase() === "long" || direction.toLowerCase() === "bullish";
  
  // Runway calculation
  const runwayPercent = isShort ? stochRsiK : (100 - stochRsiK);
  const runwayThreshold = 30; // Need 30% runway
  const hasLimitedRunway = runwayPercent < runwayThreshold;
  const hasHighAdxException = adx >= 60;
  
  // Color scheme based on outcome
  const outcomeColors = isHardBlock 
    ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-500' }
    : isSizeReduced
    ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-500' }
    : { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-500' };
  
  // Header description based on actual conditions
  const getHeaderDescription = () => {
    if (isAllowed) {
      if (!hasLimitedRunway) {
        return `Sufficient directional runway for ${direction.toUpperCase()} entry (${runwayPercent.toFixed(0)}% available). Full position size permitted.`;
      }
      if (hasHighAdxException) {
        return `Limited runway but ADX ≥60 provides strong momentum exception. Full position size permitted.`;
      }
      return "Runway conditions acceptable. Full position size permitted.";
    }
    if (isSizeReduced) {
      return `Limited directional runway detected for ${direction.toUpperCase()} entry - StochRSI already ${isShort ? "near oversold" : "near overbought"}.`;
    }
    return `Critically limited runway for ${direction.toUpperCase()} entry. Entry blocked.`;
  };
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${outcomeColors.bg} ${outcomeColors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isAllowed ? (
            <CheckCircle2 className={`h-4 w-4 ${outcomeColors.icon}`} />
          ) : (
            <Gauge className={`h-4 w-4 ${outcomeColors.icon}`} />
          )}
          <span className={`text-xs font-semibold ${outcomeColors.text}`}>
            STOCHRSI RUNWAY {isAllowed ? "– ALLOWED" : "GATE"}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
            BE Prevention
          </Badge>
        </div>
        <Badge 
          variant={isHardBlock ? "destructive" : "secondary"} 
          className={`text-[10px] px-1.5 py-0 ${isAllowed ? 'bg-green-500/20 text-green-400' : ''}`}
        >
          {isHardBlock ? "🚫 BLOCKED" : isAllowed ? "✓ 100% Size" : `📉 ${(positionMultiplier * 100).toFixed(0)}% Size`}
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {getHeaderDescription()}
      </div>
      
      {/* Runway Visualization */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Directional Runway</span>
          <span className={`font-mono ${hasLimitedRunway ? 'text-red-400' : 'text-green-400'}`}>
            {runwayPercent.toFixed(0)}% {hasLimitedRunway ? '(Limited)' : '(Sufficient)'}
          </span>
        </div>
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          {isShort ? (
            <>
              {/* For shorts: green on right (high StochRSI = room to fall), red on left */}
              <div className="absolute left-0 h-full bg-red-500/30" style={{ width: '30%' }} />
              <div className="absolute h-full bg-green-500/30" style={{ left: '30%', right: 0 }} />
              <div 
                className="absolute h-full w-1 bg-amber-500 rounded-full"
                style={{ left: `${Math.min(Math.max(stochRsiK, 0), 100)}%` }}
              />
            </>
          ) : (
            <>
              {/* For longs: green on left (low StochRSI = room to rise), red on right */}
              <div className="absolute left-0 h-full bg-green-500/30" style={{ width: '70%' }} />
              <div className="absolute h-full bg-red-500/30" style={{ left: '70%', right: 0 }} />
              <div 
                className="absolute h-full w-1 bg-amber-500 rounded-full"
                style={{ left: `${Math.min(Math.max(stochRsiK, 0), 100)}%` }}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>{isShort ? "Limited (Oversold)" : "Room (Oversold)"}</span>
          <span>StochRSI K: {stochRsiK.toFixed(1)}</span>
          <span>{isShort ? "Room (Overbought)" : "Limited (Overbought)"}</span>
        </div>
      </div>
      
      {/* Context Indicators */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-1.5 rounded border text-center text-[10px] ${adxSlope < 0 ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-muted/30 border-muted/50 text-muted-foreground'}`}>
          ADX Slope: {adxSlope >= 0 ? '+' : ''}{adxSlope.toFixed(2)} {adxSlope < 0 ? '(Declining)' : adxSlope > 0.1 ? '(Rising)' : '(Stable)'}
        </div>
        <div className={`p-1.5 rounded border text-center text-[10px] ${bothLtfNeutral ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-muted/30 border-muted/50 text-muted-foreground'}`}>
          LTF Status: {bothLtfNeutral ? 'Both Neutral' : 'Active'}
        </div>
      </div>
      
      {/* Exception Note - only when applicable */}
      {hasHighAdxException && hasLimitedRunway && (
        <div className="flex items-center gap-1.5 p-1.5 bg-green-500/20 rounded text-[10px] text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          <span>ADX ≥60 Exception: Strong momentum continuation overrides runway concern</span>
        </div>
      )}
      
      {/* Contextual Assessment */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        {isHardBlock ? (
          <>
            <span className="text-red-400">🚫 Why rejected: </span>
            {`Critically limited runway (${runwayPercent.toFixed(0)}%) for ${direction.toUpperCase()} entry. Entry blocked to prevent late-entry loss.`}
          </>
        ) : isSizeReduced ? (
          <>
            <span className="text-amber-400">📉 Why size reduced: </span>
            {`75% of BE ${isShort ? 'shorts' : 'longs'} entered with StochRSI ${isShort ? '< 40' : '> 60'} (limited runway). Position sized at ${(positionMultiplier * 100).toFixed(0)}% to reduce late-entry risk.`}
          </>
        ) : (
          <>
            <span className="text-green-400">ℹ️ Assessment: </span>
            {!hasLimitedRunway 
              ? `Directional runway of ${runwayPercent.toFixed(0)}% provides sufficient room for ${direction.toUpperCase()} continuation. Full position size permitted.`
              : hasHighAdxException
              ? "Strong ADX momentum (≥60) provides exception to limited runway. Full position size permitted."
              : "Runway conditions acceptable for entry. Full position size permitted."
            }
          </>
        )}
      </div>
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
    </div>
  );
};

// ============= TRIPLE-STACK REDUCTION MONITOR =============
// Warns when multiple BE gates combine to create dangerously small positions

interface ActiveGateInfo {
  name: string;
  multiplier: number;
  reason: string;
}

const TripleStackReductionMonitor = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  // Extract all gate multipliers from filters_status
  const gates: ActiveGateInfo[] = [];
  
  // Check each BE prevention gate
  const adxSlopeMultiplier = coerceNumeric(filtersStatus?.adxSlopeMultiplier, 1);
  const highAdx1hMultiplier = coerceNumeric(filtersStatus?.highAdx1hMultiplier, 1);
  const stochRsiRunwayMultiplier = coerceNumeric(filtersStatus?.stochRsiRunwayMultiplier, 1);
  const ltfConfirmationMultiplier = coerceNumeric(filtersStatus?.ltfConfirmationMultiplier, 1);
  const moveExhaustionMultiplier = coerceNumeric(filtersStatus?.moveExhaustionMultiplier ?? filtersStatus?.moveZoneDetails?.positionMultiplier, 1);
  const momentumMultiplier = coerceNumeric(filtersStatus?.momentumMultiplier, 1);
  
  // Add active gates (multiplier < 1)
  if (adxSlopeMultiplier < 1) {
    gates.push({ name: "ADX_SLOPE_GRADUATED", multiplier: adxSlopeMultiplier, reason: "Declining ADX slope" });
  }
  if (highAdx1hMultiplier < 1) {
    gates.push({ name: "HIGH_ADX_1H_CONFIRMATION", multiplier: highAdx1hMultiplier, reason: "1h not confirmed" });
  }
  if (stochRsiRunwayMultiplier < 1) {
    gates.push({ name: "STOCHRSI_RUNWAY", multiplier: stochRsiRunwayMultiplier, reason: "Limited directional runway" });
  }
  if (ltfConfirmationMultiplier < 1) {
    gates.push({ name: "LTF_CONFIRMATION", multiplier: ltfConfirmationMultiplier, reason: "LTF not aligned" });
  }
  if (moveExhaustionMultiplier < 1) {
    gates.push({ name: "MOVE_EXHAUSTION", multiplier: moveExhaustionMultiplier, reason: "Late-cycle exhaustion" });
  }
  if (momentumMultiplier < 1) {
    gates.push({ name: "MOMENTUM", multiplier: momentumMultiplier, reason: "Weak/opposing momentum" });
  }
  
  // Calculate combined multiplier
  const combinedMultiplier = gates.reduce((acc, gate) => acc * gate.multiplier, 1);
  const finalPositionPercent = combinedMultiplier * 100;
  
  // Determine severity
  const isTripleStack = gates.length >= 3;
  const isDoubleStack = gates.length >= 2;
  const isDangerouslySmall = finalPositionPercent < 15;
  const isVerySmall = finalPositionPercent < 25;
  
  // Don't show if no stacking or position is reasonable
  if (gates.length < 2) return null;
  
  const getSeverityColor = () => {
    if (isDangerouslySmall) return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-500' };
    if (isVerySmall) return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', icon: 'text-orange-500' };
    return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-500' };
  };
  
  const colors = getSeverityColor();
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${colors.bg} ${colors.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className={`h-4 w-4 ${colors.icon}`} />
          <span className={`text-xs font-semibold ${colors.text}`}>
            {isTripleStack ? "TRIPLE-STACK" : "DOUBLE-STACK"} REDUCTION
          </span>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${colors.bg} ${colors.text} ${colors.border}`}>
            {gates.length} Gates Active
          </Badge>
        </div>
        <Badge 
          variant={isDangerouslySmall ? "destructive" : "secondary"} 
          className="text-[10px] px-1.5 py-0"
        >
          ⚠️ {finalPositionPercent.toFixed(1)}% Final Size
        </Badge>
      </div>
      
      <div className={`text-[10px] ${colors.text}`}>
        {isDangerouslySmall 
          ? "⚠️ CRITICAL: Multiple BE prevention gates have combined to reduce position to dangerously small size."
          : isVerySmall
            ? "Warning: Multiple gates are stacking to significantly reduce position size."
            : "Notice: Multiple size reduction gates are active simultaneously."
        }
      </div>
      
      {/* Gate Breakdown */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground font-medium">Active Gates:</div>
        {gates.map((gate, idx) => (
          <div key={gate.name} className="flex items-center justify-between p-1.5 bg-muted/30 rounded text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{idx + 1}.</span>
              <span className="font-mono text-xs">{gate.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{gate.reason}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {(gate.multiplier * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
        ))}
      </div>
      
      {/* Multiplication Breakdown */}
      <div className="p-2 bg-muted/50 rounded">
        <div className="text-[10px] text-muted-foreground mb-1">Size Calculation:</div>
        <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
          <span>100%</span>
          {gates.map((gate, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <span className="text-muted-foreground">×</span>
              <span className={gate.multiplier < 0.5 ? 'text-red-400' : 'text-amber-400'}>
                {(gate.multiplier * 100).toFixed(0)}%
              </span>
            </span>
          ))}
          <span className="text-muted-foreground">=</span>
          <span className={`font-bold ${isDangerouslySmall ? 'text-red-400' : isVerySmall ? 'text-orange-400' : 'text-amber-400'}`}>
            {finalPositionPercent.toFixed(1)}%
          </span>
        </div>
      </div>
      
      {/* Critical Warning */}
      {isDangerouslySmall && (
        <div className="flex items-center gap-1.5 p-1.5 bg-red-500/20 rounded text-[10px] text-red-400">
          <AlertTriangle className="h-3 w-3" />
          <span>Position size below 15% threshold. Consider whether this trade is worth the risk.</span>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={colors.text}>ℹ️ Context:</span>
        {` Each BE prevention gate applies its own size reduction. When ${gates.length} gates activate simultaneously, the multiplicative effect results in a ${finalPositionPercent.toFixed(1)}% position size.`}
      </div>
    </div>
  );
};

// Strategy Constraint Gate Display - for strategy-specific validation failures
const StrategyConstraintGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const strategyName = filtersStatus?.strategyName || "Unknown Strategy";
  const reason = filtersStatus?.constraintReason || filtersStatus?.reason || "Constraint failed";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const stochRsiK4h = coerceNumeric(filtersStatus?.stochRsiK4h ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const percentB = coerceNumeric(filtersStatus?.percentB ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const fakeBreakoutRisk = filtersStatus?.fakeBreakoutRisk || trendData?.momentum?.fakeBreakoutRisk || false;
  
  const isEMADeathCross = strategyName.toLowerCase().includes("death cross");
  const isEMAGoldenCross = strategyName.toLowerCase().includes("golden cross");
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-amber-500/10 border-amber-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-400">
            STRATEGY CONSTRAINT
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400">
          {strategyName}
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Strategy-specific validation failed: {reason}
      </div>
      
      {/* Constraint Checklist */}
      {(isEMADeathCross || isEMAGoldenCross) && (
        <div className="space-y-1.5">
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${adx >= 25 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {adx >= 25 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>ADX ≥25: {adx.toFixed(1)}</span>
          </div>
          {isEMADeathCross && (
            <>
              <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${stochRsiK4h > 30 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {stochRsiK4h > 30 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                <span>StochRSI K {">"} 30: {stochRsiK4h.toFixed(1)}</span>
              </div>
              <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${percentB >= 40 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {percentB >= 40 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                <span>%B ≥40: {percentB.toFixed(1)}%</span>
              </div>
            </>
          )}
          {isEMAGoldenCross && (
            <>
              <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${stochRsiK4h < 70 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {stochRsiK4h < 70 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                <span>StochRSI K {"<"} 70: {stochRsiK4h.toFixed(1)}</span>
              </div>
              <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${percentB <= 60 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {percentB <= 60 ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                <span>%B ≤60: {percentB.toFixed(1)}%</span>
              </div>
            </>
          )}
          <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${!fakeBreakoutRisk ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {!fakeBreakoutRisk ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>No Fake Breakout Risk: {fakeBreakoutRisk ? "Risk detected" : "Clear"}</span>
          </div>
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-amber-400">⚠️ Why blocked:</span> {strategyName} has specific conditions that must be met. 
        This strategy works poorly when conditions aren't optimal. Wait for better setup.
      </div>
    </div>
  );
};

// ============= TIER 0/1 SEVERE HTF GATE DISPLAY =============
// For TIER_0_DEEP_OVERSOLD, TIER_0_DEEP_OVERBOUGHT, SEVERE_HTF_OVERSOLD, SEVERE_HTF_OVERBOUGHT
const SevereHTFGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const gate = filtersStatus?.gate || "";
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h ?? filtersStatus?.stochRsiK ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const stochRsiD = coerceNumeric(filtersStatus?.stochRsiD4h ?? filtersStatus?.stochRsiD ?? trendData?.stochasticRsi?.['4h']?.d, 50);
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || (stochRsiK < 50 ? "short" : "long");
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  
  // Determine tier
  const isTier0 = gate.includes("TIER_0") || gate.includes("DEEP") || stochRsiK < 5 || stochRsiK > 95;
  const tierLabel = isTier0 ? "TIER 0 (DEEP)" : "TIER 1 (SEVERE)";
  const tierBg = isTier0 ? "bg-red-600/20" : "bg-red-500/20";
  const tierBorder = isTier0 ? "border-red-600/40" : "border-red-500/40";
  const tierText = isTier0 ? "text-red-400" : "text-red-400";
  
  // Thresholds
  const tier0Threshold = stochRsiK < 50 ? 5 : 95;
  const tier1LowerThreshold = stochRsiK < 50 ? 5 : 85;
  const tier1UpperThreshold = stochRsiK < 50 ? 15 : 95;
  
  const isOversold = stochRsiK < 50;
  const blockedDirection = isOversold ? "SHORT" : "LONG";
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${tierBg} ${tierBorder}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Ban className={`h-4 w-4 ${tierText}`} />
          <span className={`text-xs font-semibold ${tierText}`}>
            {tierLabel}: StochRSI HARD GATE
          </span>
        </div>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {blockedDirection} Blocked
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        4H StochRSI K is at extreme level. {isTier0 ? "NO bypass is allowed at this level." : "NO bypass is allowed for Tier 1."}
      </div>
      
      {/* StochRSI Gauge */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">4H StochRSI K</span>
          <span className={`font-mono font-bold ${tierText}`}>{stochRsiK.toFixed(1)}</span>
        </div>
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${isTier0 ? 'bg-red-600' : 'bg-red-500'}`}
            style={{ width: `${stochRsiK}%` }}
          />
          {/* Threshold markers */}
          <div className="absolute top-0 h-full w-0.5 bg-red-600/70" style={{ left: '5%' }} title="Tier 0: K=5" />
          <div className="absolute top-0 h-full w-0.5 bg-orange-500/70" style={{ left: '15%' }} title="Tier 1: K=15" />
          <div className="absolute top-0 h-full w-0.5 bg-orange-500/70" style={{ left: '85%' }} title="Tier 1: K=85" />
          <div className="absolute top-0 h-full w-0.5 bg-red-600/70" style={{ left: '95%' }} title="Tier 0: K=95" />
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span>0</span>
          <span className="text-red-400">T0: 5</span>
          <span className="text-orange-400">T1: 15</span>
          <span className="text-muted-foreground">50</span>
          <span className="text-orange-400">T1: 85</span>
          <span className="text-red-400">T0: 95</span>
          <span>100</span>
        </div>
      </div>
      
      {/* Context Grid */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">StochRSI K</div>
          <div className={`text-lg font-bold ${tierText}`}>{stochRsiK.toFixed(1)}</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">StochRSI D</div>
          <div className="text-lg font-bold text-foreground">{stochRsiD.toFixed(1)}</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="text-lg font-bold text-foreground">{adx.toFixed(1)}</div>
        </div>
      </div>
      
      {/* No bypass explanation */}
      <div className="flex items-center gap-1.5 p-2 bg-red-500/20 rounded text-[10px] text-red-400">
        <Ban className="h-3.5 w-3.5" />
        <span className="font-medium">NO BYPASS ALLOWED - {tierLabel}</span>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={tierText}>⛔ Why blocked:</span> StochRSI K={stochRsiK.toFixed(1)} is in the 
        {isTier0 ? ` Tier 0 (Deep) zone (K ${isOversold ? '<5' : '>95'})` : ` Tier 1 (Severe) zone (K ${isOversold ? '5-15' : '85-95'})`}. 
        {isOversold 
          ? " Market is deeply oversold - SHORT entries are blocked to prevent catching a falling knife."
          : " Market is deeply overbought - LONG entries are blocked to prevent buying the top."
        }
      </div>
      
      {/* NEW: Multi-TF StochRSI Panel for context on lower timeframes */}
      <MultiTimeframeStochRSIPanel filtersStatus={filtersStatus} trendData={trendData} />
    </div>
  );
};

// ============= MOVE EXHAUSTION DISPLAY =============
// For MOVE_EXHAUSTED_SHORT and MOVE_EXHAUSTED_LONG gates
const MoveExhaustionDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "short";
  const isShort = direction.toLowerCase() === "short";
  
  // FIX: Extract price distance from nested priceDistanceFromSwing object
  // Backend logs: priceDistanceFromSwing: { high24h, low24h, distanceFromHighPercent, distanceFromLowPercent }
  const priceDistanceFromSwing = filtersStatus?.priceDistanceFromSwing;
  const rawDistancePercent = isShort 
    ? (priceDistanceFromSwing?.distanceFromHighPercent ?? filtersStatus?.priceDistancePercent ?? filtersStatus?.movePercent)
    : (priceDistanceFromSwing?.distanceFromLowPercent ?? filtersStatus?.priceDistancePercent ?? filtersStatus?.movePercent);
  const priceDistancePercent = coerceNumeric(rawDistancePercent, 0);
  
  // Extract swing prices for context
  const swingHigh24h = coerceNumeric(priceDistanceFromSwing?.high24h ?? filtersStatus?.swingHigh24h, 0);
  const swingLow24h = coerceNumeric(priceDistanceFromSwing?.low24h ?? filtersStatus?.swingLow24h, 0);
  const currentPrice = coerceNumeric(filtersStatus?.currentPrice ?? trendData?.currentPrice, 0);
  
  const stochRsiK = coerceNumeric(filtersStatus?.stochRsiK4h ?? filtersStatus?.stochRsiK ?? trendData?.stochasticRsi?.['4h']?.k, 50);
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const adxSlope = coerceNumeric(filtersStatus?.adxSlope ?? trendData?.volatility?.adxSlope, 0);
  
  // CRITICAL FIX: Use backend's moveZoneDetails for authoritative outcome
  // The backend may block/reduce based on StochRSI and other factors, not just distance
  const moveZoneDetails = filtersStatus?.moveZoneDetails;
  const backendOutcome = moveZoneDetails?.outcome;
  const backendZone = moveZoneDetails?.zone;
  const backendMultiplier = coerceNumeric(moveZoneDetails?.positionMultiplier, 1);
  const overrideReason = moveZoneDetails?.overrideReason;
  
  // NEW: Relaxation tracking for strong trend threshold adjustments
  const relaxationApplied = moveZoneDetails?.relaxationApplied ?? false;
  const relaxationCondition = moveZoneDetails?.relaxationCondition ?? '';
  
  // Get thresholds from backend (with relaxation info)
  const thresholds = filtersStatus?.thresholds ?? {};
  const effectiveHardThreshold = coerceNumeric(thresholds.hardThresholdPercent, 5);
  const effectiveSoftThreshold = coerceNumeric(thresholds.softThresholdPercent, 3.5);
  const originalHardThreshold = coerceNumeric(thresholds.originalHardThreshold ?? 5, 5);
  const originalSoftThreshold = coerceNumeric(thresholds.originalSoftThreshold ?? 3.5, 3.5);
  
  // Determine actual outcome from backend data (authoritative) or fallback to distance-based calculation
  const getExhaustionLevel = () => {
    // If we have backend outcome, use it
    if (backendOutcome) {
      if (backendOutcome === 'BLOCKED') {
        const isRelaxedZone = backendZone === 'RELAXED_HARD';
        return { 
          label: isRelaxedZone 
            ? `RELAXED HARD BLOCK (≥${effectiveHardThreshold}%)` 
            : backendZone === 'HARD' ? `HARD BLOCK (≥${effectiveHardThreshold}%)` : `${backendZone || 'SOFT'} ZONE - Override Blocked`, 
          color: "text-red-400", 
          bg: "bg-red-500/20", 
          border: "border-red-500/30",
          outcome: "BLOCKED",
          outcomeLabel: "Entry Rejected",
          isBlocked: true,
          isReduced: false
        };
      }
      if (backendOutcome === 'REDUCED' || backendMultiplier < 1) {
        const isRelaxedZone = backendZone === 'RELAXED_SOFT';
        return { 
          label: isRelaxedZone 
            ? `RELAXED SOFT (${(backendMultiplier * 100).toFixed(0)}% size)` 
            : `${backendZone || 'SOFT'} ZONE (${(backendMultiplier * 100).toFixed(0)}% size)`, 
          color: "text-yellow-400", 
          bg: "bg-yellow-500/20", 
          border: "border-yellow-500/30",
          outcome: "SIZE_REDUCED",
          outcomeLabel: `${(backendMultiplier * 100).toFixed(0)}% Size`,
          isBlocked: false,
          isReduced: true
        };
      }
      if (backendOutcome === 'EXCEPTION_ALLOWED') {
        return { 
          label: "Exception Allowed", 
          color: "text-blue-400", 
          bg: "bg-blue-500/20", 
          border: "border-blue-500/30",
          outcome: "EXCEPTION",
          outcomeLabel: `${(backendMultiplier * 100).toFixed(0)}% Size`,
          isBlocked: false,
          isReduced: backendMultiplier < 1
        };
      }
      if (backendOutcome === 'ALLOWED') {
        return { 
          label: "Fresh Zone", 
          color: "text-green-400", 
          bg: "bg-green-500/10", 
          border: "border-green-500/30",
          outcome: "ALLOWED",
          outcomeLabel: "Full Size",
          isBlocked: false,
          isReduced: false
        };
      }
    }
    
    // Fallback: distance-based calculation (legacy compatibility)
    if (priceDistancePercent >= effectiveHardThreshold) return { 
      label: `HARD BLOCK (≥${effectiveHardThreshold}%)`, 
      color: "text-red-400", 
      bg: "bg-red-500/20", 
      border: "border-red-500/30",
      outcome: "BLOCKED",
      outcomeLabel: "Entry Rejected",
      isBlocked: true,
      isReduced: false
    };
    if (priceDistancePercent >= effectiveSoftThreshold) return { 
      label: `Soft Exhaustion (${effectiveSoftThreshold}-${effectiveHardThreshold}%)`, 
      color: "text-yellow-400", 
      bg: "bg-yellow-500/20", 
      border: "border-yellow-500/30",
      outcome: "SIZE_REDUCED",
      outcomeLabel: "0.35x Size",
      isBlocked: false,
      isReduced: true
    };
    return { 
      label: "Fresh Zone", 
      color: "text-green-400", 
      bg: "bg-green-500/10", 
      border: "border-green-500/30",
      outcome: "ALLOWED",
      outcomeLabel: "Full Size",
      isBlocked: false,
      isReduced: false
    };
  };
  
  const exhaustionLevel = getExhaustionLevel();
  const swingLabel = isShort ? "24h High" : "24h Low";
  const swingPrice = isShort ? swingHigh24h : swingLow24h;
  
  return (
    <div className={`space-y-3 p-3 rounded-md border ${exhaustionLevel.bg} ${exhaustionLevel.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown className={`h-4 w-4 ${exhaustionLevel.color}`} />
          <span className={`text-xs font-semibold ${exhaustionLevel.color}`}>
            MOVE EXHAUSTION: {direction.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Relaxation Badge - shows when strong trend thresholds apply */}
          {relaxationApplied && (
            <Badge 
              variant="outline" 
              className="text-[9px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-500/40"
            >
              📈 RELAXED ({relaxationCondition})
            </Badge>
          )}
          {/* Outcome Badge - uses backend's authoritative outcome */}
          <Badge 
            variant="outline" 
            className={`text-[9px] px-1.5 py-0 ${
              exhaustionLevel.isBlocked ? 'bg-red-500/20 text-red-400 border-red-500/40' : 
              exhaustionLevel.isReduced ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' :
              'bg-green-500/20 text-green-400 border-green-500/40'
            }`}
          >
            {exhaustionLevel.isBlocked ? '🚫 BLOCKED' : exhaustionLevel.isReduced ? '📉 SIZE REDUCED' : '✓ ALLOWED'}
          </Badge>
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${exhaustionLevel.color}`}>
            {exhaustionLevel.label}
          </Badge>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        Price has moved {priceDistancePercent.toFixed(1)}% from {swingLabel}. 
        {relaxationApplied && (
          <span className="text-blue-400">
            {` Strong trend detected (${relaxationCondition}) - thresholds relaxed to ${effectiveSoftThreshold}%/${effectiveHardThreshold}%. `}
          </span>
        )}
        {exhaustionLevel.isBlocked 
          ? " Entry is rejected due to extreme move exhaustion." 
          : exhaustionLevel.isReduced 
            ? ` Entry allowed at reduced size (${exhaustionLevel.outcomeLabel}) due to late-cycle risk.`
            : " Move within acceptable range for full position."
        }
      </div>
      
      {/* Override Reason Display - Shows StochRSI or other blocking factors */}
      {overrideReason && (
        <div className="text-[10px] p-2 rounded border bg-amber-500/10 border-amber-500/30 text-amber-400">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          <span className="font-medium">Override blocked:</span> {overrideReason}
        </div>
      )}
      
      {/* Exhaustion Progress - Dynamic thresholds based on relaxation */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Distance from {swingLabel}</span>
          <span className={`font-mono font-bold ${exhaustionLevel.color}`}>{priceDistancePercent.toFixed(1)}%</span>
        </div>
        <div className="relative h-2.5 bg-muted/50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              priceDistancePercent >= effectiveHardThreshold ? 'bg-red-500' : 
              priceDistancePercent >= effectiveSoftThreshold ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min((priceDistancePercent / effectiveHardThreshold) * 80, 100)}%` }}
          />
          {/* Threshold markers - dynamic based on relaxation */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-yellow-400/60" 
            style={{ left: `${(effectiveSoftThreshold / effectiveHardThreshold) * 80}%` }} 
            title={`${effectiveSoftThreshold}% Soft`} 
          />
          <div 
            className="absolute top-0 h-full w-0.5 bg-red-400/60" 
            style={{ left: '80%' }} 
            title={`${effectiveHardThreshold}% Hard`} 
          />
          {/* Show original thresholds as faded markers when relaxation is applied */}
          {relaxationApplied && (
            <>
              <div 
                className="absolute top-0 h-full w-0.5 bg-yellow-400/20" 
                style={{ left: `${(originalSoftThreshold / effectiveHardThreshold) * 80}%` }} 
                title={`Original ${originalSoftThreshold}%`} 
              />
              <div 
                className="absolute top-0 h-full w-0.5 bg-red-400/20" 
                style={{ left: `${(originalHardThreshold / effectiveHardThreshold) * 80}%` }} 
                title={`Original ${originalHardThreshold}%`} 
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span className="text-green-400">0-{effectiveSoftThreshold}% (1.0x)</span>
          <span className="text-yellow-400">{effectiveSoftThreshold}-{effectiveHardThreshold}% (0.35-0.45x)</span>
          <span className="text-red-400">≥{effectiveHardThreshold}% (Block)</span>
        </div>
      </div>
      
      {/* Context Grid - Enhanced with swing price info */}
      <div className="grid grid-cols-4 gap-2 text-[10px]">
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">Move %</div>
          <div className={`text-lg font-bold ${exhaustionLevel.color}`}>{priceDistancePercent.toFixed(1)}%</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">{swingLabel}</div>
          <div className="text-sm font-bold text-foreground">${swingPrice > 0 ? swingPrice.toFixed(2) : 'N/A'}</div>
          {currentPrice > 0 && <div className="text-[8px] text-muted-foreground">Now: ${currentPrice.toFixed(2)}</div>}
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">StochRSI K</div>
          <div className={`text-lg font-bold ${stochRsiK < 30 || stochRsiK > 70 ? 'text-orange-400' : 'text-foreground'}`}>
            {stochRsiK.toFixed(1)}
          </div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className="text-lg font-bold text-foreground">{adx.toFixed(1)}</div>
          <div className={`text-[8px] ${adxSlope > 0 ? 'text-green-400' : adxSlope < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
            Slope: {adxSlope > 0 ? '+' : ''}{adxSlope.toFixed(2)}
          </div>
        </div>
      </div>
      
      {/* Dynamic assessment based on backend outcome */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className={exhaustionLevel.color}>
          {exhaustionLevel.isBlocked ? '🚫 Why rejected:' : exhaustionLevel.isReduced ? '📉 Why size reduced:' : 'ℹ️ Assessment:'}
        </span>{' '}
        Price has already moved {priceDistancePercent.toFixed(1)}% from {swingLabel}
        {swingPrice > 0 ? ` ($${swingPrice.toFixed(2)})` : ''}.
        {exhaustionLevel.isBlocked 
          ? overrideReason 
            ? ` ${overrideReason}. Entry rejected despite distance being within fresh zone.`
            : ` Moves ≥10% indicate extreme exhaustion with minimal remaining runway. Entry rejected to prevent late chase.`
          : exhaustionLevel.isReduced
            ? ` Moves in soft zone indicate late-cycle risk. Entry allowed at ${exhaustionLevel.outcomeLabel} to limit exposure while capturing potential continuation.`
            : ` Move is within fresh zone. Full position size permitted.`
        }
      </div>
      
      {/* NEW: Multi-TF StochRSI Panel for exhaustion context */}
      <MultiTimeframeStochRSIPanel filtersStatus={filtersStatus} trendData={trendData} />
    </div>
  );
};

// ============= PRE-RECOVERY STRUCTURE DISPLAY =============
// For PRE_RECOVERY_STRUCTURE gate
const PreRecoveryGateDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const consecutiveLosses = coerceNumeric(filtersStatus?.consecutiveLosses ?? filtersStatus?.consecutive_losses, 0);
  const lossThreshold = coerceNumeric(filtersStatus?.lossThreshold ?? filtersStatus?.consecutive_loss_threshold, 3);
  const rsi = coerceNumeric(filtersStatus?.rsi ?? trendData?.technicalIndicators?.rsi ?? trendData?.timeframes?.['1h']?.indicators?.rsi, 50);
  const squeezeValid = filtersStatus?.squeezeValid ?? false;
  const squeezeReasons = filtersStatus?.squeezeReasons ?? [];
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  // FIXED: Read derivedDirection (the actual field name in the log)
  const direction = filtersStatus?.derivedDirection || filtersStatus?.direction || "unknown";
  // Also read explicit hasDeepPullback from backend if available
  const backendHasDeepPullback = filtersStatus?.hasDeepPullback;
  
  // Squeeze breakdown data from backend
  const squeeze4h = filtersStatus?.squeeze4h ?? trendData?.bollingerBands?.['4h']?.squeeze ?? false;
  const squeeze1h = filtersStatus?.squeeze1h ?? trendData?.bollingerBands?.['1h']?.squeeze ?? false;
  const percentB4h = coerceNumeric(filtersStatus?.percentB4h ?? trendData?.bollingerBands?.['4h']?.percentB, 50);
  const percentB1h = coerceNumeric(filtersStatus?.percentB1h ?? trendData?.bollingerBands?.['1h']?.percentB, 50);
  
  // Requirements for pre-recovery entry (match backend thresholds from PRE_RECOVERY_PARAMS)
  // FIXED: Backend uses 35/65, not 30/70
  const DEEP_PULLBACK_RSI_LONG = 35;   // RSI must be below this for LONG pullback
  const DEEP_PULLBACK_RSI_SHORT = 65;  // RSI must be above this for SHORT pullback
  
  // Use backend value if available, otherwise calculate locally
  const hasDeepPullback = backendHasDeepPullback !== undefined 
    ? backendHasDeepPullback 
    : ((direction === "long" && rsi < DEEP_PULLBACK_RSI_LONG) || (direction === "short" && rsi > DEEP_PULLBACK_RSI_SHORT));
  const hasSqueeze = squeezeValid;
  const hasHighADX = adx >= 25;
  
  // Derive squeeze failure reason for display
  const getSqueezeFailureReason = () => {
    if (squeezeReasons && squeezeReasons.length > 0) {
      return squeezeReasons[0]; // Backend provides specific reason
    }
    // Fallback: derive from available data
    if (!squeeze4h && !squeeze1h) return "No HTF squeeze detected";
    const isLong = direction === "long";
    const priceAtEdge = isLong 
      ? (percentB4h > 70 || percentB1h > 70)
      : (percentB4h < 30 || percentB1h < 30);
    if (!priceAtEdge) return `Price not at band edge (%B4h=${percentB4h.toFixed(0)}, %B1h=${percentB1h.toFixed(0)})`;
    return "Momentum or divergence check failed";
  };
  
  // Squeeze breakout requires 4 conditions:
  // 1. HTF Squeeze (4h or 1h)
  // 2. Price at Band Edge (%B >70 for LONG, <30 for SHORT)
  // 3. Momentum Building
  // 4. No Divergence
  const hasHTFSqueeze = squeeze4h || squeeze1h;
  const isLong = direction === "long";
  const priceAtCorrectEdge = isLong 
    ? (percentB4h > 70 || percentB1h > 70)
    : (percentB4h < 30 || percentB1h < 30);
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-amber-500/10 border-amber-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">
            PRE-RECOVERY STRUCTURE
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400">
          {consecutiveLosses} consecutive losses
        </Badge>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        System is in pre-recovery mode after {consecutiveLosses} consecutive losses. 
        Stricter entry requirements are enforced.
      </div>
      
      {/* Requirements Checklist */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground font-medium">Entry Requirements (need at least ONE):</div>
        
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${hasDeepPullback ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {hasDeepPullback ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>Deep Pullback (RSI {direction === "long" ? `<${DEEP_PULLBACK_RSI_LONG}` : `>${DEEP_PULLBACK_RSI_SHORT}`}): </span>
          <span className="font-mono">{rsi.toFixed(1)}</span>
        </div>
        
        {/* Enhanced Squeeze Breakout Display */}
        <div className={`p-1.5 rounded text-[10px] ${hasSqueeze ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className="flex items-center gap-1.5">
            {hasSqueeze ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
            <span>Squeeze Breakout Valid: </span>
            <span className="font-mono">{hasSqueeze ? "Yes" : "No"}</span>
          </div>
          
          {/* Show specific failure reason when squeeze invalid */}
          {!hasSqueeze && (
            <div className="mt-1.5 ml-4 space-y-1">
              <div className="text-orange-400 text-[9px] font-medium">
                ↳ {getSqueezeFailureReason()}
              </div>
              
              {/* Squeeze Breakdown - show 4 conditions */}
              <div className="grid grid-cols-2 gap-1 mt-1">
                <div className={`flex items-center gap-1 ${hasHTFSqueeze ? 'text-green-400' : 'text-red-400'}`}>
                  {hasHTFSqueeze ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                  <span className="text-[9px]">HTF Squeeze: {squeeze4h ? '4h' : squeeze1h ? '1h' : 'None'}</span>
                </div>
                <div className={`flex items-center gap-1 ${priceAtCorrectEdge ? 'text-green-400' : 'text-red-400'}`}>
                  {priceAtCorrectEdge ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                  <span className="text-[9px]">Band Edge: %B {isLong ? '>70' : '<30'}</span>
                </div>
              </div>
              
              {/* %B Values */}
              <div className="flex gap-2 text-[9px] text-muted-foreground">
                <span>%B4h: <span className="font-mono">{percentB4h.toFixed(0)}</span></span>
                <span>%B1h: <span className="font-mono">{percentB1h.toFixed(0)}</span></span>
              </div>
            </div>
          )}
        </div>
        
        <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${hasHighADX ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {hasHighADX ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
          <span>ADX ≥25: </span>
          <span className="font-mono">{adx.toFixed(1)}</span>
        </div>
      </div>
      
      {/* Context Grid */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">Losses</div>
          <div className="text-lg font-bold text-amber-400">{consecutiveLosses}/{lossThreshold}</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">RSI</div>
          <div className={`text-lg font-bold ${hasDeepPullback ? 'text-green-400' : 'text-muted-foreground'}`}>
            {rsi.toFixed(1)}
          </div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className={`text-lg font-bold ${hasHighADX ? 'text-green-400' : 'text-muted-foreground'}`}>
            {adx.toFixed(1)}
          </div>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-amber-400">⚠️ Why blocked:</span> After {consecutiveLosses} consecutive losses, 
        the system requires stricter entry conditions: deep pullback OR valid squeeze breakout. 
        Current conditions don't meet these requirements.
      </div>
    </div>
  );
};

// ============= MOMENTUM DIRECTION OPPOSING DISPLAY =============
// For MOMENTUM_DIRECTION_OPPOSING gate
// ARCHITECTURE: Two-phase momentum gate with accurate threshold mapping from backend
//
// PHASE 1: MOMENTUM SCORE POLARITY (runs first, uses score thresholds)
//   - Extreme: Score beyond ±50 → ABSOLUTE BLOCK (no bypasses)
//   - Moderate: Score -50 to -20 (LONG) or +20 to +50 (SHORT) → 1h Trend Agreement bypass only (50-70% position)
//   - Neutral zone: Score in ±10 range → Phase 1 passes, proceeds to Phase 2
//
// PHASE 2: MACD DIRECTION (only runs if Phase 1 passes with neutral momentum)
//   - Checks if MACD histogram direction opposes trade direction
//   - Bypass: Weak MACD (ATR-normalized threshold) OR Exceptional ADX (≥35)
//
const MomentumDirectionOpposingDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const signalDirection = filtersStatus?.signalDirection || filtersStatus?.derivedDirection || filtersStatus?.direction || "long";
  const momentumScore = coerceNumeric(filtersStatus?.momentumScore ?? trendData?.momentum?.score, 0);
  // Derive momentum direction from score if not explicitly provided
  const derivedMomentumDir = momentumScore > 10 ? "bullish" : momentumScore < -10 ? "bearish" : "neutral";
  const momentumDirection = filtersStatus?.momentumDirection || trendData?.momentum?.direction || derivedMomentumDir;
  const momentumState = filtersStatus?.momentumState || trendData?.momentum?.state || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const macdHistogram = coerceNumeric(filtersStatus?.macdHistogram ?? trendData?.macd?.histogram, 0);
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.direction || trendData?.timeframes?.['1h']?.trend || "unknown";
  const regimeTrendDirection = filtersStatus?.regimeTrendDirection || trendData?.masterRegime?.trendDirection || trend1h;
  
  // Backend thresholds (from constants.ts)
  const STRONG_OPPOSITE_THRESHOLD = 20; // ±20 triggers Phase 1 Moderate
  const EXTREME_THRESHOLD = 50; // ±50 is absolute block
  const NEUTRAL_MAX = 10; // ±10 is neutral zone
  const EXCEPTIONAL_ADX = 35;
  
  // ATR-normalized weak MACD threshold (backend uses ATR * 0.0001)
  const atr = coerceNumeric(filtersStatus?.atr ?? trendData?.atr ?? trendData?.atrValue, 0);
  const weakMacdThreshold = atr > 0 ? atr * 0.0001 : 0.0001; // Fallback if no ATR
  
  const isLong = signalDirection.toLowerCase() === "long";
  const opposingDirection = isLong ? "bearish" : "bullish";
  
  // ===== PHASE DETECTION (matches backend logic) =====
  // Phase 1 triggers based on score vs direction
  const scoreVsThreshold = isLong ? momentumScore : -momentumScore; // Normalize: negative = opposing for LONG, positive = opposing for SHORT
  const absScore = Math.abs(momentumScore);
  
  // Phase 1 Extreme: Score beyond ±50 (absolute block)
  const isPhase1Extreme = absScore > EXTREME_THRESHOLD;
  
  // Phase 1 Moderate: Score in opposing range but not extreme
  // LONG: blocked when momentum < -20 (opposing) → check if -50 < score < -20
  // SHORT: blocked when momentum > +20 (opposing) → check if +20 < score < +50
  const isPhase1Moderate = !isPhase1Extreme && (
    (isLong && momentumScore < -STRONG_OPPOSITE_THRESHOLD) ||
    (!isLong && momentumScore > STRONG_OPPOSITE_THRESHOLD)
  );
  
  // Phase 2: Momentum is in neutral zone (±10) but MACD direction opposes
  // This only runs if Phase 1 passed (score not strongly opposing)
  const isPhase2 = filtersStatus?.phase === 2 || (!isPhase1Extreme && !isPhase1Moderate && absScore <= NEUTRAL_MAX);
  
  // ===== PHASE 1 BYPASS: Early Trend Detection (1h Trend Agreement) =====
  const expectedTrendDir = isLong ? "bullish" : "bearish";
  const is1hTrendAligned = regimeTrendDirection?.toLowerCase() === expectedTrendDir;
  
  // ===== PHASE 2 BYPASS: MACD Weak OR Exceptional ADX =====
  const isWeakMomentum = Math.abs(macdHistogram) < weakMacdThreshold;
  const isExceptionalADX = adx >= EXCEPTIONAL_ADX;
  
  // Momentum state styling
  const getMomentumStateColor = (state: string) => {
    switch (state?.toLowerCase()) {
      case 'confirmed': return 'text-green-400';
      case 'building': return 'text-blue-400';
      case 'mixed': return 'text-yellow-400';
      case 'none': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };
  
  // Phase badge color
  const getPhaseColor = () => {
    if (isPhase1Extreme) return 'bg-red-500/20 text-red-400 border-red-500/40';
    if (isPhase1Moderate) return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  };
  
  const getPhaseName = () => {
    if (isPhase1Extreme) return 'Phase 1: EXTREME';
    if (isPhase1Moderate) return 'Phase 1: MODERATE';
    return 'Phase 2: MACD Direction';
  };
  
  const getPhaseExplanation = () => {
    if (isPhase1Extreme) return `Score ${momentumScore > 0 ? '>' : '<'} ±50 (absolute block)`;
    if (isPhase1Moderate) return `Score ${isLong ? '< -20' : '> +20'} (opposing threshold)`;
    return `Score in neutral zone (±10), MACD direction check`;
  };
  
  return (
    <div className="space-y-3 p-3 rounded-md border bg-orange-500/10 border-orange-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-orange-400" />
          <span className="text-xs font-semibold text-orange-400">
            MOMENTUM DIRECTION OPPOSING
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getPhaseColor()}`}>
            {getPhaseName()}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-500/20 text-orange-400">
            {signalDirection.toUpperCase()} vs {opposingDirection.toUpperCase()}
          </Badge>
        </div>
      </div>
      
      <div className="text-[10px] text-muted-foreground">
        {getPhaseExplanation()}
        {isPhase1Extreme && " — Extreme momentum score blocks all bypasses."}
        {isPhase1Moderate && " — Only 1h trend agreement can bypass this block (50-70% position)."}
        {isPhase2 && " — MACD weakness or exceptional ADX may bypass."}
      </div>
      
      {/* Momentum Gauge */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Momentum Score</span>
          <span className={`font-mono font-bold ${
            momentumScore > 30 ? 'text-green-400' : 
            momentumScore < -30 ? 'text-red-400' : 'text-yellow-400'
          }`}>{momentumScore > 0 ? '+' : ''}{momentumScore.toFixed(0)}</span>
        </div>
        <div className="relative h-2.5 bg-muted/50 rounded-full overflow-hidden">
          {/* Center at 50%, scale from -100 to +100 */}
          <div 
            className={`absolute h-full rounded-full ${momentumScore >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ 
              left: momentumScore >= 0 ? '50%' : `${50 + (momentumScore / 2)}%`,
              width: `${Math.abs(momentumScore) / 2}%`
            }}
          />
          {/* Center line */}
          <div className="absolute top-0 h-full w-0.5 bg-foreground/30" style={{ left: '50%' }} />
          {/* Threshold lines: ±10 (neutral), ±20 (moderate), ±50 (extreme) */}
          <div className="absolute top-0 h-full w-0.5 bg-blue-400/50" style={{ left: '45%' }} title="-10 (neutral)" />
          <div className="absolute top-0 h-full w-0.5 bg-blue-400/50" style={{ left: '55%' }} title="+10 (neutral)" />
          <div className="absolute top-0 h-full w-0.5 bg-orange-400/50" style={{ left: '40%' }} title="-20 (moderate)" />
          <div className="absolute top-0 h-full w-0.5 bg-orange-400/50" style={{ left: '60%' }} title="+20 (moderate)" />
          <div className="absolute top-0 h-full w-0.5 bg-red-400/60" style={{ left: '25%' }} title="-50 (extreme)" />
          <div className="absolute top-0 h-full w-0.5 bg-red-400/60" style={{ left: '75%' }} title="+50 (extreme)" />
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span className="text-red-400">-100</span>
          <span className="text-red-400/70">-50</span>
          <span className="text-orange-400/70">-20</span>
          <span className="text-blue-400/70">-10</span>
          <span>0</span>
          <span className="text-blue-400/70">+10</span>
          <span className="text-orange-400/70">+20</span>
          <span className="text-green-400/70">+50</span>
          <span className="text-green-400">+100</span>
        </div>
      </div>
      
      {/* Context Grid - 4 columns including Momentum State */}
      <div className="grid grid-cols-4 gap-2 text-[10px]">
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">Direction</div>
          <div className={`text-sm font-bold capitalize ${
            momentumDirection === 'bullish' ? 'text-green-400' : 
            momentumDirection === 'bearish' ? 'text-red-400' : 'text-yellow-400'
          }`}>{momentumDirection}</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">State</div>
          <div className={`text-sm font-bold capitalize ${getMomentumStateColor(momentumState)}`}>
            {momentumState}
          </div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">ADX</div>
          <div className={`text-lg font-bold ${adx >= EXCEPTIONAL_ADX ? 'text-green-400' : 'text-foreground'}`}>
            {parseFloat(String(adx)).toFixed(1)}
          </div>
          <div className="text-[8px] text-muted-foreground">{adx >= EXCEPTIONAL_ADX ? "Exceptional" : "Normal"}</div>
        </div>
        <div className="p-2 rounded border bg-muted/30 text-center">
          <div className="text-muted-foreground">1H Trend</div>
          <div className={`text-sm font-bold capitalize ${
            trend1h === 'bullish' ? 'text-green-400' : 
            trend1h === 'bearish' ? 'text-red-400' : 'text-yellow-400'
          }`}>{trend1h}</div>
        </div>
      </div>
      
      {/* Phase-Specific Bypass Conditions */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
          Applicable Bypass Conditions
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${getPhaseColor()}`}>
            {getPhaseName()}
          </Badge>
        </div>
        
        {isPhase1Extreme && (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-1.5 text-[10px] text-red-400">
              <Ban className="h-3.5 w-3.5" />
              <span className="font-semibold">ABSOLUTE BLOCK - No Bypasses Available</span>
            </div>
            <div className="text-[9px] text-red-300/80 mt-1">
              Momentum score {momentumScore > 0 ? '>' : '<'} {momentumScore > 0 ? '+50' : '-50'} is too extreme.
              Even 1h trend agreement cannot override this level of opposing momentum.
            </div>
          </div>
        )}
        
        {isPhase1Moderate && (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${is1hTrendAligned ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {is1hTrendAligned ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
              <span>1H Trend Agreement ({expectedTrendDir}): </span>
              <span className={`font-mono font-semibold ${is1hTrendAligned ? 'text-green-400' : 'text-red-400'}`}>
                {regimeTrendDirection || 'neutral'}
              </span>
            </div>
            {!is1hTrendAligned && (
              <div className="text-[9px] text-muted-foreground pl-5">
                If 1h trend were {expectedTrendDir}, entry would be allowed with 50-70% position size (Early Trend Detection).
              </div>
            )}
            <div className="p-1.5 rounded bg-muted/20 text-[9px] text-muted-foreground border border-muted/30">
              <span className="text-yellow-400">ℹ️</span> Phase 1 bypasses only check 1h trend alignment. 
              MACD weakness and ADX strength do NOT apply at this momentum level.
            </div>
          </div>
        )}
        
        {isPhase2 && (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${isWeakMomentum ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {isWeakMomentum ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
              <span>Weak MACD (ATR-normalized): </span>
              <span className="font-mono">{Math.abs(macdHistogram).toFixed(5)}</span>
              <span className="text-muted-foreground"> vs threshold </span>
              <span className="font-mono text-muted-foreground">{weakMacdThreshold.toFixed(5)}</span>
            </div>
            <div className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${isExceptionalADX ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {isExceptionalADX ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
              <span>Exceptional ADX (≥{EXCEPTIONAL_ADX}): </span>
              <span className="font-mono">{adx.toFixed(1)}</span>
            </div>
            {atr > 0 && (
              <div className="text-[9px] text-muted-foreground pl-5">
                ATR: {atr.toFixed(2)} → Weak MACD threshold: {weakMacdThreshold.toFixed(6)}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Graduated Momentum Effect Visualization (if direction was affected) */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
      
      {/* Explanation Footer */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2">
        <span className="text-orange-400">⚠️ Why blocked:</span>{' '}
        {isPhase2 ? (
          <>
            Attempting {signalDirection.toUpperCase()} entry while MACD direction is {momentumDirection} 
            (histogram: {macdHistogram >= 0 ? '+' : ''}{macdHistogram.toFixed(2)}).
            Neither MACD weakness (|hist| {'<'} {weakMacdThreshold.toFixed(5)}) nor exceptional ADX (≥{EXCEPTIONAL_ADX}, current: {adx.toFixed(1)}) conditions were met.
          </>
        ) : (
          <>
            Attempting {signalDirection.toUpperCase()} entry while momentum score is {momentumScore.toFixed(0)} ({momentumDirection}).
            {isPhase1Extreme && ` Score beyond ±${EXTREME_THRESHOLD} threshold cannot be bypassed by any condition.`}
            {isPhase1Moderate && ` Only 1h trend agreement (currently ${regimeTrendDirection || 'neutral'}) could allow entry with reduced position.`}
          </>
        )}
      </div>
    </div>
  );
};

// Unified Reversal Display - for BLOCK/REDUCE decisions from unified reversal scoring
const UnifiedReversalDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const score = coerceNumeric(filtersStatus?.unifiedReversalScore ?? filtersStatus?.score ?? filtersStatus?.unifiedScore ?? filtersStatus?.reversalScore, 0);
  const rawScore = coerceNumeric(filtersStatus?.unifiedReversalRawScore ?? filtersStatus?.rawScore, 0);
  const adxWeight = coerceNumeric(filtersStatus?.unifiedReversalAdxWeight ?? filtersStatus?.adxWeight, 1.0);
  const decision = filtersStatus?.decision || "UNKNOWN";
  const breakdown = filtersStatus?.breakdown || filtersStatus?.scoreBreakdown || {};
  const reasons = filtersStatus?.reasons || filtersStatus?.reversalReasons || filtersStatus?.reversalSignals || [];
  const momentumState = filtersStatus?.momentumState || filtersStatus?.momentum?.state || trendData?.momentum?.state || "unknown";
  const adx = coerceNumeric(filtersStatus?.adx ?? trendData?.volatility?.adx, 0);
  const trend4hRaw = filtersStatus?.trend4h || trendData?.primaryTrend || "unknown";
  const trend1hRaw = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend || "unknown";
  
  // Get smart trend labels
  const trend4hInfo = getTrendDisplayLabel(trend4hRaw, trendData, trend4hRaw, trend1hRaw);
  const trend1hInfo = getTrendDisplayLabel(trend1hRaw, trendData, trend4hRaw, trend1hRaw);
  
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
              const label = breakdownLabels[key] || key.replace(/([A-Z])/g, ' $1').replace('Score', '').trim();
              const numValue = Number(value) || 0;
              return (
                <div key={key} className="flex justify-between px-2 py-1 bg-muted/20 rounded text-[10px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono ${numValue > 0 ? colors.text : numValue < 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {numValue > 0 ? `+${numValue}` : numValue}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Score Calculation - shows how raw score becomes final score */}
          {rawScore > 0 && adxWeight !== 1.0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between px-2 py-1.5 bg-muted/40 rounded text-[10px] cursor-help border-t border-muted/50 mt-1">
                    <span className="text-muted-foreground font-medium">Calculation:</span>
                    <span className="font-mono">
                      <span className="text-orange-400">{rawScore}</span>
                      <span className="text-muted-foreground"> × </span>
                      <span className="text-cyan-400">{adxWeight.toFixed(2)}</span>
                      <span className="text-muted-foreground"> = </span>
                      <span className={colors.text}>{score}</span>
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] max-w-[220px]">
                  <p>Raw component sum ({rawScore}) × ADX weight ({adxWeight.toFixed(2)}) = Final score ({score})</p>
                  <p className="text-muted-foreground mt-1">ADX weight adjusts score based on trend strength. Lower ADX = less reliable reversal signals.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Show raw sum when different from display */}
          {rawScore > 0 && rawScore !== score && adxWeight === 1.0 && (
            <div className="flex justify-between px-2 py-1 bg-muted/40 rounded text-[10px] border-t border-muted/50 mt-1">
              <span className="text-muted-foreground font-medium">Raw Sum</span>
              <span className="font-mono text-orange-400 font-medium">{rawScore}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Context Grid */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1.5 bg-muted/30 rounded text-center cursor-help">
                <div className="text-muted-foreground">4H Trend</div>
                <div className={`font-medium ${
                  trend4hRaw === "bullish" ? "text-green-400" : 
                  trend4hRaw === "bearish" ? "text-red-400" : 
                  getTrendLabelStyles(trend4hInfo.variant)
                }`}>
                  {trend4hRaw === "bullish" || trend4hRaw === "bearish" 
                    ? trend4hRaw.charAt(0).toUpperCase() + trend4hRaw.slice(1)
                    : trend4hInfo.label}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[180px]">
              <p>{trend4hInfo.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1.5 bg-muted/30 rounded text-center cursor-help">
                <div className="text-muted-foreground">1H Trend</div>
                <div className={`font-medium ${
                  trend1hRaw === "bullish" ? "text-green-400" : 
                  trend1hRaw === "bearish" ? "text-red-400" : 
                  getTrendLabelStyles(trend1hInfo.variant)
                }`}>
                  {trend1hRaw === "bullish" || trend1hRaw === "bearish" 
                    ? trend1hRaw.charAt(0).toUpperCase() + trend1hRaw.slice(1)
                    : trend1hInfo.label}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[180px]">
              <p>{trend1hInfo.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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

// Reusable Multi-Timeframe StochRSI Panel - shows K/D values for all timeframes with visual gauges
const MultiTimeframeStochRSIPanel = ({ filtersStatus, trendData }: { filtersStatus?: any; trendData?: any }) => {
  // Extract StochRSI data from enriched filters_status (populated by logRejectionWithAI)
  const stochRsi4h = filtersStatus?.stochRsi4h || {};
  const stochRsi1h = filtersStatus?.stochRsi1h || {};
  const stochRsi30m = filtersStatus?.stochRsi30m || {};
  const stochRsi15m = filtersStatus?.stochRsi15m || {};
  
  // Fallback to trendData if not in filtersStatus
  const k4h = coerceNumeric(stochRsi4h?.k ?? trendData?.stochasticRsi?.['4h']?.k ?? trendData?.stochasticRsi?.aggregated?.k, null);
  const d4h = coerceNumeric(stochRsi4h?.d ?? trendData?.stochasticRsi?.['4h']?.d ?? trendData?.stochasticRsi?.aggregated?.d, null);
  const k1h = coerceNumeric(stochRsi1h?.k ?? trendData?.stochasticRsi?.['1h']?.k, null);
  const d1h = coerceNumeric(stochRsi1h?.d ?? trendData?.stochasticRsi?.['1h']?.d, null);
  const k30m = coerceNumeric(stochRsi30m?.k ?? trendData?.stochasticRsi?.['30m']?.k, null);
  const d30m = coerceNumeric(stochRsi30m?.d ?? trendData?.stochasticRsi?.['30m']?.d, null);
  const k15m = coerceNumeric(stochRsi15m?.k ?? trendData?.stochasticRsi?.['15m']?.k, null);
  const d15m = coerceNumeric(stochRsi15m?.d ?? trendData?.stochasticRsi?.['15m']?.d, null);
  
  // Check if we have any data to display
  const hasAnyData = k4h !== null || k1h !== null || k30m !== null || k15m !== null;
  if (!hasAnyData) return null;
  
  // Helper to get color for K value
  const getKColor = (k: number | null): string => {
    if (k === null) return 'text-muted-foreground';
    if (k <= 5 || k >= 95) return 'text-red-500';
    if (k <= 15 || k >= 85) return 'text-orange-400';
    if (k <= 20 || k >= 80) return 'text-yellow-400';
    return 'text-foreground';
  };
  
  // Helper to get zone label
  const getZoneLabel = (k: number | null): string => {
    if (k === null) return '-';
    if (k <= 5) return 'Deep OS';
    if (k <= 15) return 'Severe OS';
    if (k <= 20) return 'Oversold';
    if (k >= 95) return 'Deep OB';
    if (k >= 85) return 'Severe OB';
    if (k >= 80) return 'Overbought';
    if (k >= 40 && k <= 60) return 'Neutral';
    return k < 50 ? 'Low' : 'High';
  };
  
  // Mini StochRSI gauge component
  const StochRSIGauge = ({ label, k, d }: { label: string; k: number | null; d: number | null }) => {
    if (k === null) return (
      <div className="p-1.5 bg-muted/20 rounded border border-border/30 text-center">
        <div className="text-[9px] text-muted-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">-</div>
      </div>
    );
    
    const kColor = getKColor(k);
    const zone = getZoneLabel(k);
    
    return (
      <div className="p-1.5 bg-muted/30 rounded border border-border/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-muted-foreground">{label}</span>
          <span className={`text-[9px] ${kColor}`}>{zone}</span>
        </div>
        {/* Mini gauge */}
        <div className="relative h-1.5 bg-muted/50 rounded-full overflow-hidden mb-1">
          {/* Oversold zone */}
          <div className="absolute left-0 top-0 h-full bg-blue-500/20" style={{ width: '20%' }} />
          {/* Overbought zone */}
          <div className="absolute right-0 top-0 h-full bg-red-500/20" style={{ width: '20%' }} />
          {/* K value bar */}
          <div 
            className={`h-full rounded-full ${
              k <= 20 ? 'bg-blue-500' : 
              k >= 80 ? 'bg-red-500' : 
              'bg-green-500'
            }`}
            style={{ width: `${k}%` }}
          />
          {/* D value marker */}
          {d !== null && (
            <div 
              className="absolute top-0 h-full w-0.5 bg-yellow-400"
              style={{ left: `${d}%` }}
              title={`D: ${d.toFixed(1)}`}
            />
          )}
        </div>
        {/* K/D values */}
        <div className="flex justify-between text-[9px]">
          <span className={`font-mono font-medium ${kColor}`}>K: {k.toFixed(1)}</span>
          <span className="font-mono text-muted-foreground">D: {d !== null ? d.toFixed(1) : '-'}</span>
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded border border-border/50">
      <div className="flex items-center gap-1.5 mb-2">
        <Gauge className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-[10px] font-semibold text-purple-400">Multi-TF StochRSI</span>
      </div>
      
      <div className="grid grid-cols-4 gap-1.5">
        <StochRSIGauge label="4H" k={k4h} d={d4h} />
        <StochRSIGauge label="1H" k={k1h} d={d1h} />
        <StochRSIGauge label="30m" k={k30m} d={d30m} />
        <StochRSIGauge label="15m" k={k15m} d={d15m} />
      </div>
      
      {/* Legend */}
      <div className="flex justify-center gap-3 text-[8px] text-muted-foreground pt-1">
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-0.5"></span> Oversold (≤20)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-0.5"></span> Neutral</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-0.5"></span> Overbought (≥80)</span>
      </div>
    </div>
  );
};

// Reusable Momentum Indicators Panel - shows MACD, momentum status, and fake breakout risk
const MomentumIndicatorsPanel = ({ trendData, filtersStatus }: { trendData?: any; filtersStatus?: any }) => {
  // Extract momentum data from trend_data.timeframes['1h'].indicators or trend_data.momentum
  const indicators1h = trendData?.timeframes?.['1h']?.indicators || {};
  const momentumData = trendData?.momentum || {};
  
  // MACD Histogram - check multiple possible locations including filtersStatus.momentum
  const macdHistogramRaw = 
    indicators1h?.macdHistogram ?? 
    momentumData?.macdHistogram ?? 
    filtersStatus?.momentum?.macdHistogram ??
    filtersStatus?.macdHistogram ?? 
    trendData?.indicators?.macdHistogram;
  // Handle both number and string values (edge function stores as string via .toFixed(4))
  const macdHistogram = typeof macdHistogramRaw === 'string' 
    ? parseFloat(macdHistogramRaw) 
    : coerceNumeric(macdHistogramRaw, null);
  
  // MACD status flags
  const macdExpanding = momentumData?.macdExpanding ?? filtersStatus?.macdExpanding ?? false;
  const macdStrong = momentumData?.macdStrong ?? filtersStatus?.macdStrong ?? false;
  const fakeBreakoutRisk = momentumData?.fakeBreakoutRisk ?? filtersStatus?.fakeBreakoutRisk ?? false;
  const genuineMomentum = momentumData?.genuineMomentum ?? filtersStatus?.genuineMomentum ?? false;
  
  // ADX and trend strength
  const adx = coerceNumeric(trendData?.volatility?.adx ?? filtersStatus?.adx, null);
  const adxRising = momentumData?.adxRising ?? filtersStatus?.adxRising ?? false;
  
  // Consecutive bars for momentum persistence
  const consecutiveBars1h = coerceNumeric(momentumData?.consecutiveBars1h, null);
  
  const hasAnyData = macdHistogram !== null || adx !== null;
  
  if (!hasAnyData) return null;
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded border border-border/50">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[10px] font-semibold text-blue-400">Momentum Indicators</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {/* MACD Histogram */}
        {macdHistogram !== null && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">MACD Histogram</span>
            <span className={`text-[10px] font-mono font-medium ${
              macdHistogram > 0 ? 'text-green-400' : macdHistogram < 0 ? 'text-red-400' : 'text-muted-foreground'
            }`}>
              {macdHistogram > 0 ? '+' : ''}{macdHistogram.toFixed(2)}
            </span>
          </div>
        )}
        
        {/* ADX */}
        {adx !== null && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">ADX</span>
            <span className={`text-[10px] font-mono font-medium ${
              adx >= 25 ? 'text-green-400' : adx >= 20 ? 'text-yellow-400' : 'text-muted-foreground'
            }`}>
              {adx.toFixed(1)} {adxRising ? '↑' : ''}
            </span>
          </div>
        )}
        
        {/* Consecutive Bars */}
        {consecutiveBars1h !== null && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Consecutive Bars</span>
            <span className="text-[10px] font-mono font-medium">{consecutiveBars1h}</span>
          </div>
        )}
      </div>
      
      {/* Status Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {macdExpanding && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-green-400 border-green-500/30">
            MACD Expanding
          </Badge>
        )}
        {macdStrong && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-green-400 border-green-500/30">
            MACD Strong
          </Badge>
        )}
        {genuineMomentum && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-green-400 border-green-500/30">
            ✓ Genuine Momentum
          </Badge>
        )}
        {fakeBreakoutRisk && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-orange-400 border-orange-500/30">
            ⚠️ Fake Breakout Risk
          </Badge>
        )}
        {!macdExpanding && !macdStrong && !genuineMomentum && !fakeBreakoutRisk && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-muted/30">
            Neutral Momentum
          </Badge>
        )}
      </div>
    </div>
  );
};

// ============= GRADUATED MOMENTUM EFFECT DISPLAY =============
// Visualizes when graduated momentum penalty flips or nullifies direction derivation
const GraduatedMomentumEffectDisplay = ({ filtersStatus }: { filtersStatus: any }) => {
  const effect = filtersStatus?.graduatedMomentumEffect;
  const momentumScore = filtersStatus?.momentumScore;
  const momentumImpact = filtersStatus?.momentumImpact;
  
  // Only show if we have effect data and something interesting happened
  if (!effect && momentumScore === undefined) return null;
  
  const directionFlipped = effect?.directionFlipped === true;
  const directionNullified = effect?.directionNullified === true;
  const hasEffect = directionFlipped || directionNullified;
  
  // Extract numeric values safely
  const baseSum = typeof effect?.baseWeightedSum === 'number' ? effect.baseWeightedSum : null;
  const adjustedSum = typeof effect?.adjustedWeightedSum === 'number' ? effect.adjustedWeightedSum : null;
  const penaltyApplied = typeof effect?.penaltyApplied === 'number' ? effect.penaltyApplied : 0;
  const baseDirection = effect?.baseDirection;
  const adjustedDirection = effect?.adjustedDirection;
  const score = typeof momentumScore === 'number' ? momentumScore : null;
  
  // Determine severity styling
  const getBorderColor = () => {
    if (directionFlipped) return 'border-red-500/40';
    if (directionNullified) return 'border-orange-500/40';
    if (score !== null && Math.abs(score) >= 30) return 'border-amber-500/30';
    return 'border-border/50';
  };
  
  const getBgColor = () => {
    if (directionFlipped) return 'bg-red-500/10';
    if (directionNullified) return 'bg-orange-500/10';
    if (score !== null && Math.abs(score) >= 30) return 'bg-amber-500/10';
    return 'bg-muted/30';
  };
  
  const getIconColor = () => {
    if (directionFlipped) return 'text-red-400';
    if (directionNullified) return 'text-orange-400';
    return 'text-amber-400';
  };
  
  const getMomentumBarColor = () => {
    if (score === null) return 'bg-muted';
    if (score > 30) return 'bg-green-500';
    if (score > 0) return 'bg-green-400/60';
    if (score > -30) return 'bg-red-400/60';
    return 'bg-red-500';
  };
  
  const getDirectionIcon = (dir: string | null) => {
    if (dir === 'long') return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (dir === 'short') return <TrendingDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };
  
  return (
    <div className={`space-y-2 p-2 rounded-md border ${getBgColor()} ${getBorderColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className={`h-3.5 w-3.5 ${getIconColor()}`} />
          <span className="text-xs font-medium">Graduated Momentum Penalty</span>
        </div>
        {hasEffect ? (
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 ${
              directionFlipped ? 'text-red-400 border-red-500/40' : 'text-orange-400 border-orange-500/40'
            }`}
          >
            {directionFlipped ? '🔄 FLIPPED' : '🚫 NULLIFIED'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            {momentumImpact || 'evaluated'}
          </Badge>
        )}
      </div>
      
      {/* Momentum Score Bar */}
      {score !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Momentum Score</span>
            <span className={`font-mono font-medium ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {score > 0 ? '+' : ''}{score.toFixed(0)}
            </span>
          </div>
          <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
            {/* Center marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground/30" />
            {/* Score bar */}
            <div 
              className={`absolute top-0 bottom-0 rounded-full transition-all ${getMomentumBarColor()}`}
              style={{
                left: score >= 0 ? '50%' : `${50 + (score / 2)}%`,
                width: `${Math.min(Math.abs(score) / 2, 50)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground font-mono">
            <span>-100</span>
            <span>0</span>
            <span>+100</span>
          </div>
        </div>
      )}
      
      {/* Direction Flow Visualization (when flipped/nullified) */}
      {hasEffect && (
        <div className="p-2 bg-muted/20 rounded border border-border/30">
          <div className="flex items-center justify-between gap-2">
            {/* Base Direction */}
            <div className="flex-1 text-center">
              <div className="text-[9px] text-muted-foreground mb-1">Base Direction</div>
              <div className="flex items-center justify-center gap-1">
                {getDirectionIcon(baseDirection)}
                <span className={`text-xs font-medium uppercase ${
                  baseDirection === 'long' ? 'text-green-400' : 
                  baseDirection === 'short' ? 'text-red-400' : 'text-muted-foreground'
                }`}>
                  {baseDirection || 'none'}
                </span>
              </div>
              {baseSum !== null && (
                <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                  sum: {baseSum >= 0 ? '+' : ''}{baseSum.toFixed(2)}
                </div>
              )}
            </div>
            
            {/* Arrow with Penalty */}
            <div className="flex flex-col items-center px-2">
              <div className={`text-lg ${directionFlipped ? 'text-red-400' : 'text-orange-400'}`}>
                →
              </div>
              {penaltyApplied !== 0 && (
                <div className="text-[8px] font-mono text-red-400">
                  {penaltyApplied >= 0 ? '+' : ''}{penaltyApplied.toFixed(2)}
                </div>
              )}
            </div>
            
            {/* Adjusted Direction */}
            <div className="flex-1 text-center">
              <div className="text-[9px] text-muted-foreground mb-1">After Penalty</div>
              <div className="flex items-center justify-center gap-1">
                {getDirectionIcon(directionNullified ? null : adjustedDirection)}
                <span className={`text-xs font-medium uppercase ${
                  directionNullified ? 'text-muted-foreground' :
                  adjustedDirection === 'long' ? 'text-green-400' : 
                  adjustedDirection === 'short' ? 'text-red-400' : 'text-muted-foreground'
                }`}>
                  {directionNullified ? 'blocked' : (adjustedDirection || 'none')}
                </span>
              </div>
              {adjustedSum !== null && (
                <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                  sum: {adjustedSum >= 0 ? '+' : ''}{adjustedSum.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Impact Summary */}
      <div className="text-[10px] text-muted-foreground">
        {directionFlipped ? (
          <span className="text-red-400">
            ⚠️ Counter-momentum score |{score?.toFixed(0) || '?'}| caused direction to flip from {baseDirection?.toUpperCase()} → {adjustedDirection?.toUpperCase()}
          </span>
        ) : directionNullified ? (
          <span className="text-orange-400">
            ⚠️ Counter-momentum score |{score?.toFixed(0) || '?'}| pushed weighted sum below threshold, preventing {baseDirection?.toUpperCase()} derivation
          </span>
        ) : momentumImpact ? (
          <span>Momentum impact: <span className="font-medium">{momentumImpact}</span></span>
        ) : null}
      </div>
    </div>
  );
};

// ============= EXTREME MOMENTUM VETO DISPLAY (v3.0) =============
// Dedicated display for hard veto when momentum >= ±50 blocks direction derivation
const ExtremeMomentumVetoDisplay = ({ filtersStatus, trendData }: { filtersStatus: any; trendData?: any }) => {
  const momentumScore = filtersStatus?.momentumScore ?? 0;
  const effect = filtersStatus?.graduatedMomentumEffect;
  const vetoedDirection = effect?.baseDirection;
  const source = filtersStatus?.source;
  
  // Only show for extreme momentum veto rejections
  if (source !== 'extreme_momentum_veto' && !filtersStatus?.extremeMomentumVeto) {
    return null;
  }
  
  const isBlockingShort = momentumScore >= 50;
  const isBlockingLong = momentumScore <= -50;
  
  return (
    <div className="space-y-3">
      {/* Header with Veto Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">Extreme Momentum Veto</span>
        </div>
        <Badge variant="outline" className="text-red-400 border-red-500/40 text-[10px] px-2 py-0.5 font-semibold">
          ⛔ HARD VETO
        </Badge>
      </div>
      
      {/* Critical Explanation */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300 font-medium">
            Cannot derive {vetoedDirection?.toUpperCase() || (isBlockingShort ? 'SHORT' : 'LONG')} into extreme opposing momentum
          </span>
        </div>
        
        <div className="text-[11px] text-muted-foreground">
          Direction derivation is fundamentally invalid when momentum magnitude dominates market structure.
          This is a safety rail — not a filter to be bypassed.
        </div>
      </div>
      
      {/* Momentum Score Visualization */}
      <div className="space-y-2 p-2 bg-muted/20 rounded-md border border-border/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Momentum Score</span>
          <span className={`font-mono font-bold ${momentumScore > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {momentumScore > 0 ? '+' : ''}{momentumScore.toFixed(0)}
          </span>
        </div>
        
        {/* Visual bar showing momentum intensity */}
        <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-foreground/40 z-10" />
          {/* Veto threshold markers at ±50 */}
          <div className="absolute left-[25%] top-0 bottom-0 w-px bg-red-500/50 z-10" />
          <div className="absolute left-[75%] top-0 bottom-0 w-px bg-red-500/50 z-10" />
          {/* Score bar */}
          <div 
            className={`absolute top-0 bottom-0 ${momentumScore > 0 ? 'bg-green-500' : 'bg-red-500'}`}
            style={{
              left: momentumScore >= 0 ? '50%' : `${50 + (momentumScore / 2)}%`,
              width: `${Math.min(50, Math.abs(momentumScore) / 2)}%`,
            }}
          />
        </div>
        
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>-100</span>
          <span className="text-red-400/60">-50 (veto)</span>
          <span>0</span>
          <span className="text-red-400/60">+50 (veto)</span>
          <span>+100</span>
        </div>
      </div>
      
      {/* Direction Flow */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase">Structure Bias</span>
          <div className="flex items-center justify-center gap-1">
            {vetoedDirection === 'long' ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            )}
            <span className="text-xs font-medium">{vetoedDirection?.toUpperCase() || '?'}</span>
          </div>
        </div>
        
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase">Veto</span>
          <div className="flex items-center justify-center">
            <Ban className="h-4 w-4 text-red-400" />
          </div>
        </div>
        
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase">Result</span>
          <div className="flex items-center justify-center gap-1">
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">BLOCKED</span>
          </div>
        </div>
      </div>
      
      {/* Thresholds Explanation */}
      <div className="text-[10px] text-muted-foreground border-t border-muted/30 pt-2 space-y-1">
        <div className="flex items-center gap-1">
          <span className="font-medium">Veto Thresholds:</span>
          <span>|momentum| ≥ 50 blocks opposing direction</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span>Momentum ≥ +50 → Cannot derive SHORT</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span>Momentum ≤ -50 → Cannot derive LONG</span>
        </div>
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
  const primaryTrendRaw = filtersStatus?.primaryTrend || trendData?.primaryTrend || "unknown";
  
  // Extract directionContext from the DirectionResult
  const directionContext = filtersStatus?.directionContext;
  
  // Use smart trend labeling for primary trend
  const primaryTrendInfo = getTrendDisplayLabel(primaryTrendRaw, trendData, trend4h, trend1h);
  const source = filtersStatus?.source || "direction_check";
  const reason = filtersStatus?.reason || "Could not determine clear trade direction from available signals";
  
  // Extract tier-related info from reasons array if directionContext not available
  const reasons = filtersStatus?.reasons || [];
  const failedTiers = reasons.filter((r: string) => r.includes("Tier") || r.includes("tier"));
  
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
      
      {/* NEW: Direction Context Visualization */}
      {directionContext && (
        <DirectionContextDisplay directionContext={directionContext} />
      )}
      
      {/* NEW: Graduated Momentum Effect Visualization */}
      <GraduatedMomentumEffectDisplay filtersStatus={filtersStatus} />
      
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                primaryTrendRaw === "bullish" ? 'text-green-400 border-green-500/30' :
                primaryTrendRaw === "bearish" ? 'text-red-400 border-red-500/30' :
                getTrendLabelStyles(primaryTrendInfo.variant)
              }`}>
                {primaryTrendRaw === "bullish" || primaryTrendRaw === "bearish" 
                  ? primaryTrendRaw.charAt(0).toUpperCase() + primaryTrendRaw.slice(1)
                  : primaryTrendInfo.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] max-w-[200px]">
              <p>{primaryTrendInfo.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Failed Tiers Summary (when directionContext not available) */}
      {!directionContext && failedTiers.length > 0 && (
        <div className="p-2 bg-muted/30 rounded border border-border/50">
          <div className="text-[9px] text-muted-foreground mb-1">Tiers Checked:</div>
          <div className="flex flex-wrap gap-1">
            {failedTiers.slice(0, 6).map((tier: string, idx: number) => (
              <Badge key={idx} variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">
                {tier.replace(/^Tier \d+:?\s*/, "").slice(0, 25)}
              </Badge>
            ))}
            {failedTiers.length > 6 && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">
                +{failedTiers.length - 6} more
              </Badge>
            )}
          </div>
        </div>
      )}
      
      {/* NEW: Multi-TF StochRSI Panel */}
      <MultiTimeframeStochRSIPanel filtersStatus={filtersStatus} trendData={trendData} />
      
      {/* NEW: Momentum Indicators Panel */}
      <MomentumIndicatorsPanel trendData={trendData} filtersStatus={filtersStatus} />
      
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
  const trendRaw =
    filtersStatus?.trend4h ||
    filtersStatus?.trend ||
    filtersStatus?.primaryTrend ||
    extractTimeframeTrend(trendData, "4h") ||
    "unknown";
  const trend1h = filtersStatus?.trend1h || trendData?.timeframes?.['1h']?.trend;
  const trendInfo = getTrendDisplayLabel(trendRaw, trendData, trendRaw, trend1h);
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
                <div className={`text-xs font-medium ${
                  trendRaw === "bullish" ? "text-green-400" : 
                  trendRaw === "bearish" ? "text-red-400" : 
                  getTrendLabelStyles(trendInfo.variant)
                }`}>
                  {trendRaw === "bullish" || trendRaw === "bearish" 
                    ? trendRaw.charAt(0).toUpperCase() + trendRaw.slice(1)
                    : trendInfo.label}
                </div>
                <div className="text-[8px] text-muted-foreground">current</div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[180px]">
              <p>{trendInfo.tooltip}</p>
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
    
    // CRITICAL - Tier 0/1 gates with absolutely no bypass
    if (gate === "ABSOLUTE_MAX_STOCHRSI_HARD_BLOCK" || gate === "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK") return "critical";
    if (gate === "STOCHRSI_ABSOLUTE_MAX_OVERBOUGHT" || gate === "STOCHRSI_ABSOLUTE_MAX_OVERSOLD") return "critical";
    if (gate === "TIER_0_DEEP_OVERSOLD" || gate === "TIER_0_DEEP_OVERBOUGHT") return "critical";
    if (gate === "DEEP_STOCHRSI_HARD_GATE") return "critical";
    if (gate === "SEVERE_HTF_OVERSOLD" || gate === "SEVERE_HTF_OVERBOUGHT") return "critical";
    if (reason.includes("TIER 0") || reason.includes("TIER 1")) return "critical";
    if (reason.includes("HARD BLOCK")) return "critical";
    if (gate === "BEARISH_DIVERGENCE_AT_EXTREME" || gate === "BULLISH_DIVERGENCE_AT_EXTREME") return "critical";
    if (reason.includes("Reversal risk") && filtersStatus?.reversalRiskScore >= 70) return "critical";
    if (decision === "BLOCK" || reason.includes("Unified Reversal BLOCK")) return "critical";
    
    // HIGH - Important gates that block trades (Tier 2 with restricted bypass)
    if (gate === "ADX_TOO_LOW") return "high";
    if (gate === "NO_MOMENTUM_CONFIRMATION") return "high";
    if (gate === "BOLLINGER_OVEREXTENSION_GATE" || gate === "BOLLINGER_UNDEREXTENSION_GATE") return "high";
    if (gate === "HTF_EXTREME_OVERSOLD_BLOCK" || gate === "HTF_EXTREME_OVERBOUGHT_BLOCK") return "critical";
    if (gate === "STOCHRSI_OVERSOLD_BLOCK" || gate === "STOCHRSI_OVERBOUGHT_BLOCK") return "high";
    if (gate === "BOLLINGER_POSITION_FILTER_SHORT") return "high";
    if (gate === "SQUEEZE_CONTEXT_MEAN_REVERSION") return "high";
    if (gate === "STOCHRSI_NOT_RISING" || gate === "STOCHRSI_NOT_FALLING") return "high";
    if (gate === "NO_CLEAR_DIRECTION") return "high";
    // Move exhaustion and momentum direction gates
    if (gate === "MOVE_EXHAUSTED_SHORT" || gate === "MOVE_EXHAUSTED_LONG") return "high";
    if (gate === "MOMENTUM_DIRECTION_OPPOSING") return "high";
    // Confidence and regime-strategy gates
    if (gate === "CONFIDENCE_BELOW_THRESHOLD") return "high";
    if (gate === "REGIME_STRATEGY_MISMATCH") return "high";
    if (reason.includes("HARD GATE")) return "high";
    if (reason.includes("StochRSI extreme")) return "high";
    if (reason.includes("Reversal risk")) return "high";
    if (reason.includes("No clear trade direction")) return "high";
    if (reason.includes("CONFIDENCE BLOCK")) return "high";
    if (reason.includes("REGIME-STRATEGY MISMATCH")) return "high";
    if (decision === "REDUCE" || reason.includes("Unified Reversal REDUCE")) return "high";
    
    // MEDIUM - Pre-recovery state and softer gates that can be bypassed (Tier 3)
    if (gate === "PRE_RECOVERY_STRUCTURE") return "medium";
    if (gate === "STRATEGY_CONSTRAINT") return "medium";
    if (gate === "NEUTRAL_4H_LOW_CONFIDENCE") return "medium";
    if (gate === "CONFIDENCE_DEAD_ZONE") return "medium";
    if (gate === "HTF_NOT_ALIGNED") return "medium";
    if (gate === "MACD_MISALIGNED") return "medium";
    if (gate === "MOMENTUM_SCORE_TOO_LOW") return "medium";
    // BE Prevention gates (soft blocks / size reductions)
    if (gate === "ADX_SLOPE_GRADUATED" || gate === "ADX_SLOPE_GRADUATED_GATE") return "medium";
    if (gate === "HIGH_ADX_1H_CONFIRMATION" || gate === "HIGH_ADX_1H_CONFIRMATION_GATE") return "medium";
    if (gate === "STOCHRSI_RUNWAY" || gate === "STOCHRSI_RUNWAY_GATE") return "medium";
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
    // NEW: IMPROVEMENT gate icons
    if (reason.includes("HTF EXTREME GATE")) return <Ban className="h-4 w-4 text-red-500" />;
    if (reason.includes("BOLLINGER GATE") || reason.includes("BOLLINGER POSITION FILTER")) return <Ban className="h-4 w-4 text-orange-500" />;
    if (reason.includes("CONTEXT GATE") || reason.includes("MEAN_REVERSION")) return <Layers className="h-4 w-4 text-purple-500" />;
    if (reason.includes("IMPROVEMENT 4")) return <Target className="h-4 w-4 text-amber-500" />;
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
    const reasonLower = reason.toLowerCase();
    
    // Execution rejections - signals blocked during trade execution
    if (reason.startsWith("EXECUTION:")) {
      return <ExecutionRejectionDisplay filtersStatus={fs} />;
    }
    
    // Already has active signal
    if (reason.includes("active signal")) {
      return <ActiveSignalDisplay />;
    }
    
    // EXTREME MOMENTUM VETO - hard block when |momentum| >= 50
    if (fs?.source === 'extreme_momentum_veto' || 
        reason.includes("EXTREME MOMENTUM VETO") || 
        fs?.gate === "EXTREME_MOMENTUM_VETO") {
      return <ExtremeMomentumVetoDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
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
    
    // HARD GATE: MACD Misaligned / Order Flow Not Aligned
    if (fs?.gate === "MACD_MISALIGNED" || fs?.gate === "ORDER_FLOW_NOT_ALIGNED" || 
        fs?.gate === "ORDER_FLOW_MACD_NOT_ALIGNED" || fs?.gate === "PRICE_NOT_ALIGNED" ||
        (reasonLower.includes("macd") && (reasonLower.includes("misaligned") || reasonLower.includes("not aligned"))) ||
        reasonLower.includes("order flow") || reasonLower.includes("order_flow") ||
        reasonLower.includes("price not aligned")) {
      return <HardGateMacdMisalignedDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // HARD BLOCK: Absolute min StochRSI (K <= 2)
    if (fs?.gate === "ABSOLUTE_MIN_STOCHRSI_HARD_BLOCK") {
      return <HardBlockStochRsiDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // TIER 0/1: Severe HTF Gate (Deep oversold/overbought - NO bypass)
    if (fs?.gate === "TIER_0_DEEP_OVERSOLD" || fs?.gate === "TIER_0_DEEP_OVERBOUGHT" ||
        fs?.gate === "DEEP_STOCHRSI_HARD_GATE" ||
        fs?.gate === "SEVERE_HTF_OVERSOLD" || fs?.gate === "SEVERE_HTF_OVERBOUGHT" ||
        reason.includes("TIER 0") || reason.includes("TIER 1") ||
        reason.includes("SEVERE") || reason.includes("DEEP")) {
      return <SevereHTFGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // TIER 2: HTF Extreme Gate (4h oversold/overbought with restricted bypass)
    if (fs?.gate === "HTF_EXTREME_OVERSOLD_BLOCK" || fs?.gate === "HTF_EXTREME_OVERBOUGHT_BLOCK" || 
        fs?.gate === "HTF_EXTREME_GATE" || fs?.gate === "STOCHRSI_OVERSOLD_BLOCK" || 
        fs?.gate === "STOCHRSI_OVERBOUGHT_BLOCK" || reason.includes("HTF EXTREME GATE")) {
      return <HTFExtremeGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Move Exhaustion Gate (price moved too far from swing high/low)
    if (fs?.gate === "MOVE_EXHAUSTED_SHORT" || fs?.gate === "MOVE_EXHAUSTED_LONG" ||
        reason.includes("MOVE_EXHAUSTED") || reason.includes("MOVE EXHAUSTED")) {
      return <MoveExhaustionDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Pre-Recovery Structure Gate (after consecutive losses)
    if (fs?.gate === "PRE_RECOVERY_STRUCTURE" || reason.includes("PRE-RECOVERY") || reason.includes("PRE_RECOVERY")) {
      return <PreRecoveryGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Momentum Direction Opposing Gate
    if (fs?.gate === "MOMENTUM_DIRECTION_OPPOSING" || reason.includes("MOMENTUM_DIRECTION") ||
        reason.includes("momentum direction") || reason.includes("MOMENTUM DIRECTION MISMATCH")) {
      return <MomentumDirectionOpposingDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // NEW: Bollinger LONG Gate (for longs above upper BB)
    if (fs?.gate === "BOLLINGER_POSITION_FILTER_LONG" || fs?.gate === "BOLLINGER_LONG_GATE" || 
        (fs?.direction === "long" && (reason.includes("BOLLINGER GATE") || reason.includes("BOLLINGER POSITION FILTER")))) {
      return <BollingerLongGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // NEW: Bollinger SHORT Gate (for shorts below lower BB)
    if (fs?.gate === "BOLLINGER_POSITION_FILTER_SHORT" || fs?.gate === "BOLLINGER_SHORT_GATE" || 
        reason.includes("BOLLINGER GATE") || reason.includes("BOLLINGER POSITION FILTER")) {
      return <BollingerShortGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // NEW: Squeeze Context Gate (Mean-Reversion regime)
    if (fs?.gate === "SQUEEZE_CONTEXT_MEAN_REVERSION" || fs?.gate === "SQUEEZE_CONTEXT_GATE" || 
        reason.includes("CONTEXT GATE") || reason.includes("MEAN_REVERSION")) {
      return <SqueezeContextGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // NEW: Strategy Constraint Gate (EMA Death/Golden Cross specific constraints)
    if (fs?.gate === "STRATEGY_CONSTRAINT" || reason.includes("STRATEGY CONSTRAINT") || 
        reason.includes("IMPROVEMENT 4")) {
      return <StrategyConstraintGateDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // BE Prevention: ADX Slope Graduated Gate
    if (fs?.gate === "ADX_SLOPE_GRADUATED" || fs?.gate === "ADX_SLOPE_GRADUATED_GATE" ||
        reason.includes("ADX_SLOPE_GRADUATED") || reason.includes("ADX slope graduated")) {
      return <AdxSlopeGraduatedDisplay filtersStatus={fs} trendData={rejection.trend_data} rejectionReason={reason} />;
    }
    
    // BE Prevention: High ADX 1h Confirmation Gate
    if (fs?.gate === "HIGH_ADX_1H_CONFIRMATION" || fs?.gate === "HIGH_ADX_1H_CONFIRMATION_GATE" ||
        reason.includes("HIGH_ADX_1H_CONFIRMATION") || reason.includes("High ADX 1h confirmation")) {
      return <HighAdx1hConfirmationDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // BE Prevention: StochRSI Runway Gate  
    if (fs?.gate === "STOCHRSI_RUNWAY" || fs?.gate === "STOCHRSI_RUNWAY_GATE" ||
        reason.includes("STOCHRSI_RUNWAY") || reason.includes("StochRSI runway")) {
      return <StochRsiRunwayDisplay filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Triple-Stack Reduction Monitor (multiple BE gates combining)
    if (fs?.gate === "TRIPLE_STACK_REDUCTION" || fs?.gate === "MULTI_GATE_REDUCTION" ||
        reason.includes("TRIPLE_STACK") || reason.includes("MULTI_GATE") ||
        reason.includes("stacked reductions") || reason.includes("multiple gates")) {
      return <TripleStackReductionMonitor filtersStatus={fs} trendData={rejection.trend_data} />;
    }
    
    // Check for stacked reductions even if not explicitly tagged
    // This shows the monitor when multiple gate multipliers are present
    const hasStackedGates = () => {
      let activeGates = 0;
      if (fs?.adxSlopeMultiplier !== undefined && fs.adxSlopeMultiplier < 1) activeGates++;
      if (fs?.highAdx1hMultiplier !== undefined && fs.highAdx1hMultiplier < 1) activeGates++;
      if (fs?.stochRsiRunwayMultiplier !== undefined && fs.stochRsiRunwayMultiplier < 1) activeGates++;
      if (fs?.ltfConfirmationMultiplier !== undefined && fs.ltfConfirmationMultiplier < 1) activeGates++;
      if (fs?.moveExhaustionMultiplier !== undefined && fs.moveExhaustionMultiplier < 1) activeGates++;
      if (fs?.momentumMultiplier !== undefined && fs.momentumMultiplier < 1) activeGates++;
      if (fs?.moveZoneDetails?.positionMultiplier !== undefined && fs.moveZoneDetails.positionMultiplier < 1) activeGates++;
      return activeGates >= 2;
    };
    
    if (hasStackedGates()) {
      return <TripleStackReductionMonitor filtersStatus={fs} trendData={rejection.trend_data} />;
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
    
    // Default filter details - also show alignment breakdown and Order Flow if available
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {getFilterDetails(fs)}
        </div>
        {rejection.trend_data?.alignmentBreakdown && (
          <MarketRegimeDisplay filtersStatus={fs} trendData={rejection.trend_data} />
        )}
        {fs?.order_flow && <OrderFlowDisplay orderFlow={fs.order_flow} />}
        
        {/* Show any complex values with tooltips */}
        {fs && Object.entries(fs).filter(([key, val]) => 
          typeof val === 'object' && val !== null && !['order_flow'].includes(key)
        ).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(fs)
              .filter(([key, val]) => typeof val === 'object' && val !== null && !['order_flow'].includes(key))
              .slice(0, 3)
              .map(([key, val]) => (
                <JsonValueTooltip key={key} label={key} value={val} />
              ))
            }
          </div>
        )}
        
        {/* Collapsible raw data viewer */}
        <RawDataViewer filtersStatus={fs} trendData={rejection.trend_data} />
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

    // If Order Flow analytics were logged, never fall back to an opaque placeholder.
    if (details.length === 0 && filtersStatus?.order_flow) {
      const of = filtersStatus.order_flow;

      const score = coerceNumeric(of?.score, 0);
      details.push(`OF: ${Math.round(score)}/100`);

      if (of?.signal) {
        details.push(`Sig: ${String(of.signal)}`);
      }

      const volumeLabel = of?.volumeSpike?.detected
        ? `${coerceNumeric(of?.volumeSpike?.magnitude, 0).toFixed(1)}x ${String(of?.volumeSpike?.type ?? "?")}`
        : "Normal";
      details.push(`Vol: ${volumeLabel}`);

      if (of?.priceRejection?.detected) {
        const rejType = String(of?.priceRejection?.type ?? "rejection");
        const strength = of?.priceRejection?.strength;
        details.push(`Rej: ${rejType}${strength !== undefined ? ` (${String(strength)})` : ""}`);
      }

      if (of?.pressure?.trend) {
        details.push(`Press: ${String(of.pressure.trend)}`);
      }
    }

    // Last resort: still avoid the opaque "No details available" message.
    return details.length > 0 ? details.join(" | ") : (filtersStatus?.required ?? (filtersStatus ? "See details" : "No data"));
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
