import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSignals } from '@/hooks/useSignals';
import { useSignalGenerator } from '@/hooks/useSignalGenerator';
import { useExecutionRejections } from '@/hooks/useExecutionRejections';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Target, Shield, Zap, RefreshCw, Activity, AlertCircle, Clock, Info, AlertTriangle, Sparkles, ChevronDown, ChevronRight, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { getSignalPriorityTier, getSignalPriorityVariant } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { SignalRejectionReasons } from './SignalRejectionReasons';
import { MomentumStatusDetails } from './MomentumStatusDetails';

// Helper to detect exhaustion risk from signal indicators
const getExhaustionStatus = (indicators: any): { isExhausted: boolean; reason: string } => {
  if (!indicators) return { isExhausted: false, reason: '' };
  
  // Check timeInExtreme data
  const timeInExtreme = indicators.timeInExtreme;
  if (timeInExtreme?.isExhausted) {
    return { isExhausted: true, reason: `StochRSI extreme for ${timeInExtreme.barsInExtreme} bars` };
  }
  
  // Check ADX exhaustion via regime
  const regime = indicators.marketRegime;
  if (regime === 'exhausted' || regime === 'overextended') {
    return { isExhausted: true, reason: `Market regime: ${regime}` };
  }
  
  // Check ADX phase exhaustion
  const exceptionDetails = indicators.exceptionDetails;
  if (exceptionDetails?.trendStrength?.decision === 'REJECT') {
    return { isExhausted: true, reason: 'Trend strength exhausted' };
  }
  
  return { isExhausted: false, reason: '' };
};

// Helper to detect early signal from indicators
const getEarlySignalStatus = (indicators: any): { isEarly: boolean; reason: string } => {
  if (!indicators) return { isEarly: false, reason: '' };
  
  // Check direction source for early detection
  const directionSource = indicators.directionSource;
  if (directionSource === '1h-building-override' || directionSource === 'early-momentum-30m+1h') {
    return { isEarly: true, reason: 'Early trend detection - smaller position recommended' };
  }
  
  // Check for early momentum entry
  if (indicators.isEarlyMomentumEntry) {
    return { isEarly: true, reason: 'Early momentum entry' };
  }
  
  return { isEarly: false, reason: '' };
};

// Helper to detect continuation mode from indicators
const getContinuationModeStatus = (indicators: any): { isContinuation: boolean; adx: string; reason: string } => {
  if (!indicators) return { isContinuation: false, adx: '', reason: '' };
  
  const continuationMode = indicators.continuationMode;
  if (continuationMode?.active) {
    return { 
      isContinuation: true, 
      adx: continuationMode.adx || '',
      reason: `Impulse follow-through at ADX ${continuationMode.adx} - reduced position size (55%)`
    };
  }
  
  return { isContinuation: false, adx: '', reason: '' };
};

export const TradingSignalsDashboard = () => {
  const { signals, loading } = useSignals();
  const { generateSignals, isGenerating } = useSignalGenerator();
  const { data: executionRejections } = useExecutionRejections();
  const { toast } = useToast();
  const { riskParams, loading: riskLoading, updateRiskParameters } = useRiskParameters();
  const autoExecEnabled = Boolean(riskParams?.auto_execute_signals);
  
  // Track which signal cards have expanded details
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set());
  
  const toggleExpanded = (signalId: string) => {
    setExpandedSignals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(signalId)) {
        newSet.delete(signalId);
      } else {
        newSet.add(signalId);
      }
      return newSet;
    });
  };

  const toggleAutoExecution = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ auto_execute_signals: enabled });
      toast({
        title: enabled ? "Auto Execution Enabled" : "Auto Execution Disabled",
        description: enabled 
          ? "Trades will be executed automatically when signals are generated" 
          : "Signals will be generated but require manual execution",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update auto execution setting",
        variant: "destructive",
      });
    }
  };

  const executeTrade = async (signalId: string, symbol: string) => {
    try {
      toast({
        title: "Executing Trade",
        description: `Placing order for ${symbol}...`,
      });

      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: { signalId, action: 'execute' },
        headers: {
          'x-manual-execution': 'true'
        }
      });

      if (error) throw error;

      toast({
        title: "Trade Executed",
        description: data.message,
      });
    } catch (error) {
      toast({
        title: "Trade Failed",
        description: error instanceof Error ? error.message : 'Failed to execute trade',
        variant: "destructive",
      });
    }
  };

  if (loading || riskLoading) {
    return <Card className="p-6"><p className="text-muted-foreground">Loading signals...</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Trading Signals</h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Badge variant="outline" className="text-xs sm:text-sm">
            {signals.length} Active
          </Badge>
          <div className="flex items-center gap-2 border rounded-md px-2 sm:px-3 py-1.5">
            <Label htmlFor="auto-exec" className="text-xs sm:text-sm cursor-pointer whitespace-nowrap">
              Auto Exec
            </Label>
            <Switch
              id="auto-exec"
              checked={autoExecEnabled}
              onCheckedChange={toggleAutoExecution}
            />
            {!autoExecEnabled && (
              <Badge variant="destructive" className="ml-1">OFF</Badge>
            )}
          </div>
          <Button
            variant="outline" 
            size="sm"
            onClick={generateSignals}
            disabled={isGenerating}
            className="text-xs sm:text-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-1 sm:mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isGenerating ? 'Analyzing...' : 'Generate Signals'}</span>
            <span className="sm:hidden">{isGenerating ? '...' : 'Generate'}</span>
          </Button>
        </div>
      </div>

      {!autoExecEnabled && signals.length > 0 && (
        <Card className="p-4 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Auto Execution is OFF</strong> - Signals are generated but trades won't execute automatically. 
            Enable auto execution or manually execute each signal.
          </p>
        </Card>
      )}

      <div className="grid gap-4">
        {signals.map((signal) => {
          const exhaustionStatus = getExhaustionStatus(signal.indicators);
          const earlySignalStatus = getEarlySignalStatus(signal.indicators);
          const continuationStatus = getContinuationModeStatus(signal.indicators);
          const executionRejection = executionRejections?.get(signal.symbol);
          
          // Parse the execution rejection reason to make it user-friendly
          const getExecutionBlockReason = () => {
            if (!executionRejection) return null;
            const reason = executionRejection.rejection_reason.replace('EXECUTION: ', '');
            const filters = executionRejection.filters_status;
            
            // Extract key metrics for display based on rejection type
            let details: string[] = [];
            if (filters) {
              // VWAP overextension details - use explicit values for accuracy
              if (filters.vwapMidDeviationPct !== undefined) {
                // New explicit field: deviation from VWAP mid
                details.push(`VWAP mid: ${Number(filters.vwapMidDeviationPct).toFixed(2)}%`);
              } else if (filters.vwapDeviation !== undefined) {
                // Legacy fallback
                details.push(`VWAP deviation: ${Number(filters.vwapDeviation).toFixed(2)}%`);
              }
              // Band breach percentage if available
              if (filters.vwapBandDeviationPct !== undefined) {
                details.push(`Band breach: ${Math.abs(Number(filters.vwapBandDeviationPct)).toFixed(2)}%`);
              }
              // Volume details with threshold comparison
              if (filters.volumeRatio !== undefined) {
                const threshold = filters.threshold !== undefined ? Number(filters.threshold) : 10;
                details.push(`Volume: ${Number(filters.volumeRatio).toFixed(3)}x (need ${threshold.toFixed(3)}x)`);
              }
              // ADX context with graduated zone indication
              if (filters.adx !== undefined) {
                const adx = Number(filters.adx);
                const adxLabel = adx >= 25 ? 'ADX' : adx >= 22 ? 'ADX (grad zone)' : 'ADX';
                details.push(`${adxLabel}: ${adx.toFixed(1)}`);
              }
              // Quality score if available
              if (filters.qualityScore !== undefined) {
                details.push(`Quality: ${Number(filters.qualityScore).toFixed(0)}`);
              }
              // Graduated exception failure reason if in 22-25 zone
              if (filters.graduatedEligible === true && filters.graduatedFailReason) {
                details.push(`Grad fail: ${String(filters.graduatedFailReason)}`);
              }
            }
            
            return { reason, details };
          };
          
          const blockInfo = getExecutionBlockReason();
          
          return (
          <Card key={signal.id} className="p-6 hover:shadow-lg transition-shadow">
            {/* Exhaustion Warning Banner */}
            {exhaustionStatus.isExhausted && (
              <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-800 dark:text-amber-200">Exhaustion Risk</div>
                  <div className="text-xs text-amber-700 dark:text-amber-300">{exhaustionStatus.reason}</div>
                </div>
              </div>
            )}
            
            {/* Early Signal Banner */}
            {earlySignalStatus.isEarly && !exhaustionStatus.isExhausted && !continuationStatus.isContinuation && (
              <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 rounded-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-200">Early Detection</div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">{earlySignalStatus.reason}</div>
                </div>
              </div>
            )}
            
            {/* Continuation Mode Banner */}
            {continuationStatus.isContinuation && (
              <div className="mb-4 p-3 bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-800 rounded-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-purple-800 dark:text-purple-200">Continuation Mode</div>
                  <div className="text-xs text-purple-700 dark:text-purple-300">{continuationStatus.reason}</div>
                </div>
              </div>
            )}
            
            {/* Execution Block Banner - Why signal is waiting */}
            {blockInfo && autoExecEnabled && (
              <div className="mb-4 p-3 bg-orange-100 dark:bg-orange-950 border border-orange-300 dark:border-orange-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Ban className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                  <div className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Waiting for Execution
                  </div>
                </div>
                <div className="text-xs text-orange-700 dark:text-orange-300 mb-2">
                  {blockInfo.reason}
                </div>
                {blockInfo.details.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {blockInfo.details.map((detail, idx) => (
                      <Badge 
                        key={idx} 
                        variant="outline" 
                        className="text-xs bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
                      >
                        {detail}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {signal.signal_type === 'long' ? (
                  <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
                ) : (
                  <TrendingDown className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
                )}
                <div>
                  <h3 className="text-lg sm:text-xl font-bold">{signal.symbol}</h3>
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                    <Badge 
                      variant={signal.signal_type === 'long' ? 'default' : 'destructive'}
                    >
                      {signal.signal_type.toUpperCase()}
                    </Badge>
                    {continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 text-[10px] sm:text-xs">
                        <Zap className="h-3 w-3 mr-0.5" />
                        Cont
                      </Badge>
                    )}
                    {earlySignalStatus.isEarly && !continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 text-[10px] sm:text-xs">
                        <Sparkles className="h-3 w-3 mr-0.5" />
                        Early
                      </Badge>
                    )}
                    {exhaustionStatus.isExhausted && !continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 text-[10px] sm:text-xs">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Late
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
                <Badge 
                  variant={
                    signal.confidence_score > 70 ? 'default' : 
                    signal.confidence_score >= 40 ? 'outline' : 
                    'destructive'
                  }
                  className={`text-[10px] sm:text-xs ${
                    signal.confidence_score > 70 ? 'bg-green-500 hover:bg-green-600' :
                    signal.confidence_score >= 40 ? 'bg-yellow-500 hover:bg-yellow-600 text-black' :
                    'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {signal.confidence_score}%
                </Badge>
                <Badge 
                  variant={getSignalPriorityVariant(getSignalPriorityTier(signal.confidence_score))}
                  className="font-medium text-[10px] sm:text-xs"
                >
                  {getSignalPriorityTier(signal.confidence_score)}
                </Badge>
                <Badge 
                  variant={
                    signal.trend.toLowerCase() === 'bullish' ? 'default' : 
                    signal.trend.toLowerCase() === 'bearish' ? 'destructive' : 
                    'secondary'
                  }
                  className="font-medium text-[10px] sm:text-xs"
                >
                  {signal.trend}
                </Badge>
                {signal.strategy_name && (
                  <Badge variant="outline" className="font-medium text-[10px] sm:text-xs">
                    {signal.strategy_name}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Entry Price</div>
                <div className="text-lg font-bold">${signal.entry_price.toFixed(4)}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Shield className="h-3 w-3" />
                  Stop Loss
                </div>
                <div className="text-lg font-bold text-red-500">${signal.stop_loss.toFixed(4)}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Target className="h-3 w-3" />
                  Take Profit
                </div>
                <div className="text-lg font-bold text-green-500">${signal.take_profit.toFixed(4)}</div>
              </div>
            </div>

            {/* Collapsible Analysis Section */}
            <Collapsible 
              open={expandedSignals.has(signal.id)} 
              onOpenChange={() => toggleExpanded(signal.id)}
            >
              <CollapsibleTrigger asChild>
                <button className="w-full mb-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors flex items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    {expandedSignals.has(signal.id) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">Analysis & Indicators</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {expandedSignals.has(signal.id) ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-4">
                {/* Analysis Reason */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium mb-1">Analysis</div>
                  <p className="text-sm text-muted-foreground">{signal.reason}</p>
                </div>

                {/* Indicator Values */}
                {signal.indicators && Object.keys(signal.indicators).length > 0 && (
                  <div className="p-3 bg-accent/30 rounded-lg border border-border">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Activity className="h-4 w-4" />
                      Indicator Values
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(signal.indicators).map(([key, value]) => {
                        // Helper to format any value (handles nested objects)
                        const formatValue = (val: unknown): string => {
                          if (typeof val === 'number') {
                            return val.toFixed(2);
                          } else if (typeof val === 'boolean') {
                            return val ? 'Yes' : 'No';
                          } else if (val === null || val === undefined) {
                            return '-';
                          } else if (typeof val === 'object') {
                            // Recursively format object values
                            try {
                              const entries = Object.entries(val as Record<string, unknown>);
                              if (entries.length === 0) return '-';
                              return entries
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${formatValue(v)}`)
                                .join(', ') + (entries.length > 3 ? ` (+${entries.length - 3})` : '');
                            } catch {
                              return '-';
                            }
                          }
                          return String(val);
                        };

                        const displayValue = formatValue(value);
                        const isComplexValue = typeof value === 'object' && value !== null;
                        
                        // Format JSON for tooltip display
                        const getFullJson = (val: unknown): string => {
                          try {
                            return JSON.stringify(val, null, 2);
                          } catch {
                            return String(val);
                          }
                        };

                        const cardContent = (
                          <div className={`p-2 bg-background/60 rounded border border-border/50 ${isComplexValue ? 'cursor-help' : ''}`}>
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-muted-foreground font-medium">{key}</div>
                              {isComplexValue && (
                                <Info className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="text-sm font-bold mt-1 break-words">
                              {displayValue}
                            </div>
                          </div>
                        );
                        
                        return isComplexValue ? (
                          <TooltipProvider key={key}>
                            <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                {cardContent}
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[400px] max-h-[300px] overflow-auto bg-popover text-popover-foreground">
                                <pre className="text-xs font-mono whitespace-pre-wrap">
                                  {getFullJson(value)}
                                </pre>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div key={key}>{cardContent}</div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Order Flow Display from Signal */}
                {signal.indicators?.orderFlow && (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Activity className="h-4 w-4" />
                      Order Flow Analysis
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className={
                        (signal.indicators.orderFlow as any).qualityBonus > 0 
                          ? "border-green-500/30 text-green-400" 
                          : (signal.indicators.orderFlow as any).qualityBonus < 0 
                            ? "border-red-500/30 text-red-400" 
                            : ""
                      }>
                        {(signal.indicators.orderFlow as any).qualityBonus > 0 ? '+' : ''}{(signal.indicators.orderFlow as any).qualityBonus} pts
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Score: {(signal.indicators.orderFlow as any).score}/100
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Signal: {(signal.indicators.orderFlow as any).signal}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Dir: {(signal.indicators.orderFlow as any).intendedDirection}
                      </span>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">
                  Risk/Reward: 1:{signal.risk_reward_ratio?.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Created {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                </div>
              </div>
              {autoExecEnabled ? (
                <Badge variant="outline">Auto-execution ON</Badge>
              ) : (
                <Button 
                  onClick={() => executeTrade(signal.id, signal.symbol)}
                  variant={signal.signal_type === 'long' ? 'default' : 'destructive'}
                >
                  Execute Trade
                </Button>
              )}
            </div>
          </Card>
        );
        })}

        {signals.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No active trading signals at the moment</p>
          </Card>
        )}
      </div>

      <SignalRejectionReasons />
      <MomentumStatusDetails />
    </div>
  );
};