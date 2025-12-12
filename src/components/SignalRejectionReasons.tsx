import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Gauge,
  ArrowUpCircle,
  ArrowDownCircle,
  Bot,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}

interface AIValidationResult {
  isValid: boolean;
  issues: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
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
  const momentum = trendData?.momentum || filtersStatus?.momentum;
  const momentumState = momentum?.state || 'none';
  
  if (adx === undefined && confidence === undefined) return null;
  
  // Pass/fail checks
  const adxPassing = (adx || 0) >= 20;
  const confidencePassing = (confidence || 0) >= minConfidence;
  const alignmentPassing = (trendConsistency || 0) >= minConsistency;
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
      
      {/* Enhanced Confidence Calculation Breakdown */}
      {(trendData?.baseConfidence !== undefined || filtersStatus?.baseConfidence !== undefined) && (
        <div className="space-y-1.5 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Confidence Calculation</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${confStyles.text} ${confStyles.bg} ${confStyles.border}`}>
              = {confidence || 0}%
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

const StochRsiExtremeDisplay = ({ filtersStatus }: { filtersStatus: any }) => {
  const stochRsiK = parseFloat(filtersStatus?.stochRsiK4h) || 0;
  const threshold = filtersStatus?.threshold || (stochRsiK < 50 ? 10 : 90);
  const intendedDirection = filtersStatus?.intendedDirection;
  const trend = filtersStatus?.trend;
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

const AI_ANALYSIS_STORAGE_KEY = 'signal-rejection-ai-analysis-enabled';

export const SignalRejectionReasons = () => {
  const { rejections, loading } = useSignalRejections();
  const [aiEnabled, setAiEnabled] = useState(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(AI_ANALYSIS_STORAGE_KEY);
    return stored === 'true';
  });
  const [aiResults, setAiResults] = useState<Record<string, AIValidationResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  // Persist AI enabled state to localStorage
  useEffect(() => {
    localStorage.setItem(AI_ANALYSIS_STORAGE_KEY, String(aiEnabled));
  }, [aiEnabled]);

  // Analyze rejection with AI
  const analyzeRejection = useCallback(async (rejection: SignalRejection) => {
    if (aiResults[rejection.id] || aiLoading[rejection.id]) return;

    setAiLoading(prev => ({ ...prev, [rejection.id]: true }));
    setAiErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[rejection.id];
      return newErrors;
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-rejection-analyzer', {
        body: { 
          rejection: {
            symbol: rejection.symbol,
            rejection_reason: rejection.rejection_reason,
            filters_status: rejection.filters_status,
            trend_data: rejection.trend_data,
          }
        }
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }

      setAiResults(prev => ({ ...prev, [rejection.id]: data }));
    } catch (err) {
      console.error('AI analysis error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Analysis failed';
      setAiErrors(prev => ({ ...prev, [rejection.id]: errorMsg }));
      
      // Show toast for rate limit errors
      if (errorMsg.includes('Rate limit') || errorMsg.includes('credits')) {
        toast.error(errorMsg);
      }
    } finally {
      setAiLoading(prev => ({ ...prev, [rejection.id]: false }));
    }
  }, [aiResults, aiLoading]);

  // Trigger AI analysis when enabled
  useEffect(() => {
    if (!aiEnabled || loading || rejections.length === 0) return;

    // Analyze rejections one by one with delay to avoid rate limiting
    const analyzeAll = async () => {
      for (const rejection of rejections) {
        if (!aiResults[rejection.id] && !aiLoading[rejection.id] && !aiErrors[rejection.id]) {
          await analyzeRejection(rejection);
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };

    analyzeAll();
  }, [aiEnabled, rejections, loading, analyzeRejection, aiResults, aiLoading, aiErrors]);

  const getReasonIcon = (reason: string) => {
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
    
    // Already has active signal
    if (reason.includes("active signal")) {
      return <ActiveSignalDisplay />;
    }
    
    // Reversal risk rejection
    if (reason.includes("Reversal risk")) {
      return <ReversalRiskDisplay filtersStatus={fs} />;
    }
    
    // StochRSI extreme rejection
    if (reason.includes("StochRSI extreme")) {
      return <StochRsiExtremeDisplay filtersStatus={fs} />;
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
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border">
            <Bot className="h-4 w-4 text-primary" />
            <Label htmlFor="ai-toggle" className="text-sm font-medium cursor-pointer">
              AI Analysis
            </Label>
            <Switch
              id="ai-toggle"
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </div>
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
                {aiEnabled && (
                  <TableCell>
                    <AIAnalysisCell
                      result={aiResults[rejection.id]}
                      isLoading={aiLoading[rejection.id] || false}
                      error={aiErrors[rejection.id]}
                    />
                  </TableCell>
                )}
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
