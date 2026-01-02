import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSignals } from '@/hooks/useSignals';
import { useSignalGenerator } from '@/hooks/useSignalGenerator';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Target, Shield, Zap, RefreshCw, Activity, AlertCircle, Clock, Info, AlertTriangle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { getSignalPriorityTier, getSignalPriorityVariant } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { SignalRejectionReasons } from './SignalRejectionReasons';
import { MomentumStatusDetails } from './MomentumStatusDetails';
import { TrendAccelerationIndicator } from './TrendAccelerationIndicator';

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
  const { toast } = useToast();
  const { riskParams, loading: riskLoading, updateRiskParameters } = useRiskParameters();
  const autoExecEnabled = Boolean(riskParams?.auto_execute_signals);

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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Trading Signals</h2>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            {signals.length} Active Signals
          </Badge>
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5">
            <Label htmlFor="auto-exec" className="text-sm cursor-pointer">
              Auto Execution
            </Label>
            <Switch
              id="auto-exec"
              checked={autoExecEnabled}
              onCheckedChange={toggleAutoExecution}
            />
            {!autoExecEnabled && (
              <Badge variant="destructive" className="ml-2">OFF</Badge>
            )}
          </div>
          <Button
            variant="outline" 
            size="sm"
            onClick={generateSignals}
            disabled={isGenerating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Analyzing...' : 'Generate Signals'}
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
            
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {signal.signal_type === 'long' ? (
                  <TrendingUp className="h-8 w-8 text-green-500" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-red-500" />
                )}
                <div>
                  <h3 className="text-xl font-bold">{signal.symbol}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge 
                      variant={signal.signal_type === 'long' ? 'default' : 'destructive'}
                    >
                      {signal.signal_type.toUpperCase()}
                    </Badge>
                    {continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300">
                        <Zap className="h-3 w-3 mr-1" />
                        Continuation
                      </Badge>
                    )}
                    {earlySignalStatus.isEarly && !continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Early
                      </Badge>
                    )}
                    {exhaustionStatus.isExhausted && !continuationStatus.isContinuation && (
                      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Late
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-sm mb-1">
                  <Zap className="h-4 w-4" />
                  <Badge 
                    variant={
                      signal.confidence_score > 70 ? 'default' : 
                      signal.confidence_score >= 40 ? 'outline' : 
                      'destructive'
                    }
                    className={`text-xs ${
                      signal.confidence_score > 70 ? 'bg-green-500 hover:bg-green-600' :
                      signal.confidence_score >= 40 ? 'bg-yellow-500 hover:bg-yellow-600 text-black' :
                      'bg-red-500 hover:bg-red-600'
                    }`}
                  >
                    {signal.confidence_score}% Confidence
                  </Badge>
                </div>
                <div className="flex items-center gap-2 justify-end flex-wrap">
                  <Badge 
                    variant={getSignalPriorityVariant(getSignalPriorityTier(signal.confidence_score))}
                    className="font-medium"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {getSignalPriorityTier(signal.confidence_score)} Priority
                  </Badge>
                  <Badge 
                    variant={
                      signal.trend.toLowerCase() === 'bullish' ? 'default' : 
                      signal.trend.toLowerCase() === 'bearish' ? 'destructive' : 
                      'secondary'
                    }
                    className="font-medium"
                  >
                    📈 {signal.trend}
                  </Badge>
                  {signal.strategy_name && (
                    <Badge variant="outline" className="font-medium">
                      {signal.strategy_name}
                    </Badge>
                  )}
                </div>
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

            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm font-medium mb-1">Analysis</div>
              <p className="text-sm text-muted-foreground">{signal.reason}</p>
            </div>

            {signal.indicators && Object.keys(signal.indicators).length > 0 && (
              <div className="mb-4 p-3 bg-accent/30 rounded-lg border border-border">
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
                          <TooltipContent side="bottom" className="max-w-[400px] max-h-[300px] overflow-auto">
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
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border/50">
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

      <TrendAccelerationIndicator />
      <SignalRejectionReasons />
      <MomentumStatusDetails />
    </div>
  );
};