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
  BarChart3,
  Target,
  Zap,
  Layers,
  Timer,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}

interface ScoreBreakdown {
  adx: { score: number; max: number };
  momentum: { score: number; max: number };
  alignment: { score: number; max: number };
  technical: { score: number; max: number };
  entry: { score: number; max: number };
  total: number;
  minRequired: number;
}

const parseBreakdown = (breakdown: string): ScoreBreakdown | null => {
  if (!breakdown) return null;
  
  // Parse format like "ADX:22/25 MOM:0/25 ALIGN:12/20 TECH:10/15 ENTRY:12/15"
  const pattern = /(\w+):(\d+)\/(\d+)/g;
  const scores: Record<string, { score: number; max: number }> = {};
  let match;
  
  while ((match = pattern.exec(breakdown)) !== null) {
    const [, key, score, max] = match;
    scores[key.toLowerCase()] = { score: parseInt(score), max: parseInt(max) };
  }
  
  if (Object.keys(scores).length === 0) return null;
  
  return {
    adx: scores.adx || { score: 0, max: 25 },
    momentum: scores.mom || { score: 0, max: 25 },
    alignment: scores.align || { score: 0, max: 20 },
    technical: scores.tech || { score: 0, max: 15 },
    entry: scores.entry || { score: 0, max: 15 },
    total: (scores.adx?.score || 0) + (scores.mom?.score || 0) + (scores.align?.score || 0) + (scores.tech?.score || 0) + (scores.entry?.score || 0),
    minRequired: 50,
  };
};

const ScoreBar = ({ 
  label, 
  score, 
  max, 
  icon: Icon 
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

const QualityScoreBreakdown = ({ filtersStatus }: { filtersStatus: any }) => {
  const breakdown = parseBreakdown(filtersStatus?.breakdown);
  const qualityScore = filtersStatus?.qualityScore;
  const minRequired = filtersStatus?.minRequired || 50;
  
  if (!breakdown && qualityScore === undefined) return null;
  
  const totalScore = breakdown?.total || qualityScore || 0;
  const isPassing = totalScore >= minRequired;
  
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded-md">
      {/* Total Score Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Quality Score</span>
        </div>
        <Badge 
          variant={isPassing ? "default" : "destructive"} 
          className="text-[10px] px-1.5 py-0"
        >
          {totalScore}/{100} {isPassing ? "✓" : `(min: ${minRequired})`}
        </Badge>
      </div>
      
      {/* Overall Progress */}
      <div className="relative">
        <Progress 
          value={totalScore} 
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
        <div className="grid grid-cols-1 gap-1 pt-1 border-t border-border/50">
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
  const adx = filtersStatus?.adx;
  const confidence = filtersStatus?.confidence;
  const trendConsistency = filtersStatus?.trendConsistency;
  const regime = filtersStatus?.regime;
  const minConfidence = filtersStatus?.minConfidence || 60;
  const minConsistency = filtersStatus?.minConsistency || 50;
  const alignmentBreakdown = trendData?.alignmentBreakdown || filtersStatus?.alignmentBreakdown;
  
  if (adx === undefined && confidence === undefined) return null;
  
  // Pass/fail checks
  const adxPassing = (adx || 0) >= 20;
  const confidencePassing = (confidence || 0) >= minConfidence;
  const alignmentPassing = (trendConsistency || 0) >= minConsistency;
  const allPassing = adxPassing && confidencePassing && alignmentPassing;
  const passCount = [adxPassing, confidencePassing, alignmentPassing].filter(Boolean).length;
  
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
  
  // Regime badge styling
  const getRegimeStyles = (r: string) => {
    if (r === 'trending') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (r === 'weak') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };
  
  const adxStyles = getAdxStyles(adx || 0);
  const confStyles = getPercentStyles(confidence || 0, minConfidence);
  const alignStyles = getPercentStyles(trendConsistency || 0, minConsistency);
  
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
        <div className="flex items-center gap-2">
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
        </div>
        <Badge 
          variant="outline" 
          className={`text-[9px] px-1 py-0 ${allPassing ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
        >
          {passCount}/3
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-center p-1.5 rounded border ${adxStyles.bg} ${adxStyles.border}`}>
                <div className="text-[9px] text-muted-foreground mb-0.5">ADX</div>
                <div className={`text-sm font-mono font-medium ${adxStyles.text}`}>
                  {adx?.toFixed(1) || '—'}
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
                  {confidence || '—'}%
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
                  {trendConsistency?.toFixed(0) || '—'}%
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
      
      {/* Alignment Breakdown Section */}
      <AlignmentBreakdownDisplay alignmentBreakdown={alignmentBreakdown} />
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

export const SignalRejectionReasons = () => {
  const { rejections, loading } = useSignalRejections();

  const getReasonIcon = (reason: string) => {
    if (reason.includes("Max trades")) return <Layers className="h-4 w-4" />;
    if (reason.includes("Quality score")) return <BarChart3 className="h-4 w-4" />;
    if (reason.includes("active signal")) return <Zap className="h-4 w-4 text-green-500" />;
    if (reason.includes("Reversal risk")) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (reason.includes("timeframe")) return <TrendingDown className="h-4 w-4" />;
    if (reason.includes("momentum")) return <Activity className="h-4 w-4" />;
    if (reason.includes("ranging")) return <Minimize2 className="h-4 w-4" />;
    if (reason.includes("pullback")) return <TrendingUp className="h-4 w-4" />;
    if (reason.includes("strategy")) return <Target className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };

  const getReasonBadgeVariant = (reason: string): "default" | "secondary" | "destructive" | "outline" => {
    if (reason.includes("active signal")) return "default";
    if (reason.includes("Max trades")) return "secondary";
    if (reason.includes("Quality score")) return "destructive";
    if (reason.includes("Reversal risk")) return "destructive";
    if (reason.includes("No strategy")) return "outline";
    return "destructive";
  };

  const renderFilterDetails = (rejection: SignalRejection) => {
    const fs = rejection.filters_status;
    const reason = rejection.rejection_reason || "";
    
    // Already has active signal
    if (reason.includes("active signal")) {
      return <ActiveSignalDisplay />;
    }
    
    // Reversal risk rejection
    if (reason.includes("Reversal risk")) {
      return <ReversalRiskDisplay filtersStatus={fs} />;
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
    if (filtersStatus?.aligned === false) {
      details.push(`4h: ${filtersStatus.trend4h}, 1h: ${filtersStatus.trend1h}`);
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
    return details.length > 0 ? details.join(" | ") : filtersStatus?.required || "Check filters";
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
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          Signal Rejection Reasons (Last 30 Minutes)
        </CardTitle>
        <CardDescription>Why signals are not being generated for each symbol</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Symbol</TableHead>
              <TableHead className="w-[200px]">Rejection Reason</TableHead>
              <TableHead className="min-w-[250px]">Score Breakdown</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-[100px]">Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rejections.map((rejection) => (
              <TableRow key={rejection.id}>
                <TableCell className="font-medium">{rejection.symbol}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getReasonIcon(rejection.rejection_reason ?? "")}
                    <Badge 
                      variant={getReasonBadgeVariant(rejection.rejection_reason ?? "")}
                      className="text-[10px] font-normal max-w-[160px] truncate"
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
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {formatDistanceToNow(new Date(rejection.checked_at), { addSuffix: true })}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
