import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useRiskParametersContext } from '@/contexts/RiskParametersContext';
import { useToast } from '@/hooks/use-toast';
import { AlertOctagon, Clock, TrendingDown, ShieldAlert, Scissors, RefreshCcw } from 'lucide-react';

export const LossManagementSettings = () => {
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const { toast } = useToast();

  if (!riskParams) return null;

  const handleToggleDrawdownCircuitBreaker = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ drawdown_circuit_breaker_enabled: enabled });
      toast({
        title: enabled ? 'Drawdown Circuit Breaker Enabled' : 'Drawdown Circuit Breaker Disabled',
        description: enabled 
          ? `Trading will pause if portfolio drops ${riskParams.drawdown_circuit_breaker_percent}% from peak` 
          : 'Circuit breaker protection disabled',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  };

  const handleToggleTimeBasedStop = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ time_based_stop_enabled: enabled });
      toast({
        title: enabled ? 'Time-Based Stops Enabled' : 'Time-Based Stops Disabled',
        description: enabled 
          ? `Stagnant positions will close after ${riskParams.time_based_stop_hours} hours` 
          : 'Time-based stop protection disabled',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  };

  const handleToggleDynamicTightening = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ dynamic_stop_tightening_enabled: enabled });
      toast({
        title: enabled ? 'Dynamic Stop Tightening Enabled' : 'Dynamic Stop Tightening Disabled',
        description: enabled 
          ? `Stops will tighten ${riskParams.dynamic_stop_tightening_percent}% per hour on aging losing positions` 
          : 'Dynamic tightening disabled',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  };

  const handleTogglePartialLossTaking = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ partial_loss_taking_enabled: enabled });
      toast({
        title: enabled ? 'Partial Loss Taking Enabled' : 'Partial Loss Taking Disabled',
        description: enabled 
          ? `Will close ${riskParams.partial_loss_close_percent}% of position at ${riskParams.partial_loss_trigger_percent}% loss toward stop` 
          : 'Partial loss taking disabled',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  };

  const handleResetCircuitBreaker = async () => {
    try {
      await updateRiskParameters({ 
        circuit_breaker_triggered: false,
        circuit_breaker_triggered_at: null 
      });
      toast({
        title: 'Circuit Breaker Reset',
        description: 'Trading can resume. Please review your strategy before continuing.',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to reset circuit breaker', variant: 'destructive' });
    }
  };

  const handleUpdateDrawdownPercent = async (value: number) => {
    try {
      await updateRiskParameters({ drawdown_circuit_breaker_percent: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdateTimeBasedHours = async (value: number) => {
    try {
      await updateRiskParameters({ time_based_stop_hours: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdateTighteningHours = async (value: number) => {
    try {
      await updateRiskParameters({ dynamic_stop_tightening_hours: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdateTighteningPercent = async (value: number) => {
    try {
      await updateRiskParameters({ dynamic_stop_tightening_percent: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdatePartialLossTrigger = async (value: number) => {
    try {
      await updateRiskParameters({ partial_loss_trigger_percent: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdatePartialLossClose = async (value: number) => {
    try {
      await updateRiskParameters({ partial_loss_close_percent: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleToggleLossRecoveryMode = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ loss_recovery_mode_enabled: enabled });
      toast({
        title: enabled ? 'Loss Recovery Mode Enabled' : 'Loss Recovery Mode Disabled',
        description: enabled 
          ? `Position size will reduce after ${riskParams.consecutive_loss_threshold} consecutive losses` 
          : 'Recovery mode protection disabled',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  };

  const handleUpdateRecoveryPositionSize = async (value: number) => {
    try {
      await updateRiskParameters({ loss_recovery_position_size_percent: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleUpdateRecoveryConfidenceBoost = async (value: number) => {
    try {
      await updateRiskParameters({ loss_recovery_confidence_boost: value });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const currentDrawdown = riskParams.portfolio_peak_value > 0
    ? ((riskParams.portfolio_peak_value - riskParams.portfolio_value) / riskParams.portfolio_peak_value) * 100
    : 0;

  return (
    <Card className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-destructive" />
        <h3 className="font-semibold">Loss Management Strategies</h3>
      </div>

      {/* Circuit Breaker Status Alert */}
      {riskParams.circuit_breaker_triggered && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-destructive" />
              <span className="font-semibold text-destructive">Circuit Breaker Active</span>
            </div>
            <Badge variant="destructive">Trading Paused</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Portfolio dropped {riskParams.drawdown_circuit_breaker_percent}% from peak. 
            Trading automatically paused to protect capital.
          </p>
          <button 
            onClick={handleResetCircuitBreaker}
            className="mt-3 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90"
          >
            Reset & Resume Trading
          </button>
        </div>
      )}

      {/* 1. Partial Loss Taking */}
      <div className="space-y-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-amber-500" />
            <Label className="font-medium">Partial Loss Taking</Label>
          </div>
          <Switch
            checked={riskParams.partial_loss_taking_enabled}
            onCheckedChange={handleTogglePartialLossTaking}
          />
        </div>
        
        {riskParams.partial_loss_taking_enabled && (
          <div className="space-y-4 pl-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Trigger at % of Stop Distance</Label>
                <Input
                  type="number"
                  min="25"
                  max="75"
                  step="5"
                  value={riskParams.partial_loss_trigger_percent}
                  onChange={(e) => handleUpdatePartialLossTrigger(parseFloat(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Close % of Position</Label>
                <Input
                  type="number"
                  min="25"
                  max="75"
                  step="5"
                  value={riskParams.partial_loss_close_percent}
                  onChange={(e) => handleUpdatePartialLossClose(parseFloat(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When price moves {riskParams.partial_loss_trigger_percent}% toward stop loss, closes {riskParams.partial_loss_close_percent}% of position.
              Reduces exposure on losing trades before full stop is hit.
            </p>
          </div>
        )}
      </div>

      {/* 2. Drawdown Circuit Breaker */}
      <div className="space-y-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <Label className="font-medium">Drawdown Circuit Breaker</Label>
          </div>
          <Switch
            checked={riskParams.drawdown_circuit_breaker_enabled}
            onCheckedChange={handleToggleDrawdownCircuitBreaker}
          />
        </div>
        
        {riskParams.drawdown_circuit_breaker_enabled && (
          <div className="space-y-4 pl-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Trigger Threshold (%)</Label>
                <Input
                  type="number"
                  min="5"
                  max="30"
                  step="1"
                  value={riskParams.drawdown_circuit_breaker_percent}
                  onChange={(e) => handleUpdateDrawdownPercent(parseFloat(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current Drawdown</Label>
                <div className={`text-lg font-bold ${currentDrawdown > 5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {currentDrawdown.toFixed(2)}%
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pauses all trading when portfolio drops {riskParams.drawdown_circuit_breaker_percent}% from its peak value (${riskParams.portfolio_peak_value?.toFixed(2) || 0}).
              Prevents catastrophic losses during losing streaks.
            </p>
          </div>
        )}
      </div>

      {/* 3. Time-Based Stops */}
      <div className="space-y-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            <Label className="font-medium">Time-Based Stops</Label>
          </div>
          <Switch
            checked={riskParams.time_based_stop_enabled}
            onCheckedChange={handleToggleTimeBasedStop}
          />
        </div>
        
        {riskParams.time_based_stop_enabled && (
          <div className="space-y-4 pl-6">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max Hours Before Exit</Label>
              <Input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={riskParams.time_based_stop_hours}
                onChange={(e) => handleUpdateTimeBasedHours(parseFloat(e.target.value))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Closes positions that haven't moved significantly ({"<"}2% P&L) after {riskParams.time_based_stop_hours} hours.
              Frees up capital from "dead money" positions.
            </p>
          </div>
        )}
      </div>

      {/* 4. Dynamic Stop Tightening */}
      <div className="space-y-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-orange-500" />
            <Label className="font-medium">Dynamic Stop Tightening</Label>
          </div>
          <Switch
            checked={riskParams.dynamic_stop_tightening_enabled}
            onCheckedChange={handleToggleDynamicTightening}
          />
        </div>
        
        {riskParams.dynamic_stop_tightening_enabled && (
          <div className="space-y-4 pl-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hours Before Tightening</Label>
                <Input
                  type="number"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={riskParams.dynamic_stop_tightening_hours}
                  onChange={(e) => handleUpdateTighteningHours(parseFloat(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tightening % Per Hour</Label>
                <Input
                  type="number"
                  min="10"
                  max="50"
                  step="5"
                  value={riskParams.dynamic_stop_tightening_percent}
                  onChange={(e) => handleUpdateTighteningPercent(parseFloat(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For losing positions, tightens stop loss by {riskParams.dynamic_stop_tightening_percent}% of remaining distance to entry 
              every hour after {riskParams.dynamic_stop_tightening_hours}h. Reduces exposure on aging losers.
            </p>
          </div>
        )}
      </div>

      {/* 5. Loss Recovery Mode */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-blue-500" />
            <Label className="font-medium">Loss Recovery Mode</Label>
          </div>
          <Switch
            checked={riskParams.loss_recovery_mode_enabled}
            onCheckedChange={handleToggleLossRecoveryMode}
          />
        </div>
        
        {/* Recovery Mode Status */}
        {riskParams.loss_recovery_mode_enabled && riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-blue-500">Recovery Mode Active</span>
              <Badge variant="outline" className="text-blue-500 border-blue-500/50">
                {riskParams.consecutive_losses} losses
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Position sizes reduced to {riskParams.loss_recovery_position_size_percent}%, 
              requiring +{riskParams.loss_recovery_confidence_boost}% higher confidence.
            </p>
          </div>
        )}
        
        {riskParams.loss_recovery_mode_enabled && (
          <div className="space-y-4 pl-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Trigger After X Losses</Label>
                <Input
                  type="number"
                  min="2"
                  max="10"
                  step="1"
                  value={riskParams.consecutive_loss_threshold}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Set in Risk Settings</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current Consecutive Losses</Label>
                <div className={`text-lg font-bold ${riskParams.consecutive_losses >= riskParams.consecutive_loss_threshold ? 'text-blue-500' : 'text-muted-foreground'}`}>
                  {riskParams.consecutive_losses} / {riskParams.consecutive_loss_threshold}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Position Size in Recovery (%)</Label>
                <Input
                  type="number"
                  min="25"
                  max="75"
                  step="5"
                  value={riskParams.loss_recovery_position_size_percent}
                  onChange={(e) => handleUpdateRecoveryPositionSize(parseFloat(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Extra Confidence Required (%)</Label>
                <Input
                  type="number"
                  min="5"
                  max="25"
                  step="5"
                  value={riskParams.loss_recovery_confidence_boost}
                  onChange={(e) => handleUpdateRecoveryConfidenceBoost(parseFloat(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              After {riskParams.consecutive_loss_threshold} consecutive losses, reduces position size to {riskParams.loss_recovery_position_size_percent}% 
              and requires {riskParams.loss_recovery_confidence_boost}% higher quality scores for new trades. Helps recover from losing streaks safely.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
