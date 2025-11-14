import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSignals } from '@/hooks/useSignals';
import { useSignalGenerator } from '@/hooks/useSignalGenerator';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Target, Shield, Zap, RefreshCw, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRiskParameters } from '@/hooks/useRiskParameters';

export const TradingSignalsDashboard = () => {
  const { signals, loading } = useSignals();
  const { generateSignals, isGenerating } = useSignalGenerator();
  const { toast } = useToast();
  const { riskParams, loading: riskLoading, updateRiskParameters } = useRiskParameters();
  const autoExecEnabled = Boolean(riskParams?.is_trading_enabled);

  const toggleAutoExecution = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ is_trading_enabled: enabled });
      toast({
        title: enabled ? "Auto Execution Enabled" : "Auto Execution Disabled",
        description: enabled 
          ? "Trades will be executed automatically when signals are generated" 
          : "Manual trade execution required",
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
        body: { signalId, action: 'execute' }
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
              checked={riskParams?.is_trading_enabled ?? true}
              onCheckedChange={toggleAutoExecution}
            />
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

      <div className="grid gap-4">
        {signals.map((signal) => (
          <Card key={signal.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {signal.signal_type === 'long' ? (
                  <TrendingUp className="h-8 w-8 text-green-500" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-red-500" />
                )}
                <div>
                  <h3 className="text-xl font-bold">{signal.symbol}</h3>
                  <Badge 
                    variant={signal.signal_type === 'long' ? 'default' : 'destructive'}
                    className="mt-1"
                  >
                    {signal.signal_type.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Zap className="h-4 w-4" />
                  Confidence: {signal.confidence_score}%
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Badge variant="outline">{signal.trend}</Badge>
                  {signal.strategy_name && (
                    <Badge variant="secondary" className="font-medium">
                      {signal.strategy_name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Entry Price</div>
                <div className="text-lg font-bold">${signal.entry_price.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Shield className="h-3 w-3" />
                  Stop Loss
                </div>
                <div className="text-lg font-bold text-red-500">${signal.stop_loss.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Target className="h-3 w-3" />
                  Take Profit
                </div>
                <div className="text-lg font-bold text-green-500">${signal.take_profit.toFixed(2)}</div>
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
                  {Object.entries(signal.indicators).map(([key, value]) => (
                    <div key={key} className="p-2 bg-background/60 rounded border border-border/50">
                      <div className="text-xs text-muted-foreground font-medium">{key}</div>
                      <div className="text-sm font-bold mt-1">
                        {typeof value === 'number' ? value.toFixed(2) : String(value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Risk/Reward: 1:{signal.risk_reward_ratio?.toFixed(2)}
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
        ))}

        {signals.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No active trading signals at the moment</p>
          </Card>
        )}
      </div>
    </div>
  );
};