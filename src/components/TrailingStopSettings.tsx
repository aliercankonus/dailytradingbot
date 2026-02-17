import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Info, Lock, Brain, Zap, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useRiskParametersContext } from "@/contexts/RiskParametersContext";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

export const TrailingStopSettings = () => {
  const { toast } = useToast();
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [activationPercent, setActivationPercent] = useState("1.0");
  const [distanceMultiplier, setDistanceMultiplier] = useState("1.5");
  const [breakEvenEnabled, setBreakEvenEnabled] = useState(true);
  const [breakEvenActivationPercent, setBreakEvenActivationPercent] = useState("0.5");
  const [profitLockPercent, setProfitLockPercent] = useState("50");
  
  // Smart AITS Settings
  const [trailingAggressiveness, setTrailingAggressiveness] = useState(3);
  const [progressiveLockEnabled, setProgressiveLockEnabled] = useState(true);
  const [stalePeakProtectionEnabled, setStalePeakProtectionEnabled] = useState(true);
  const [decayVelocityExitEnabled, setDecayVelocityExitEnabled] = useState(true);
  
  // Pre-Activation Protection Settings
  const [earlyProfitLockEnabled, setEarlyProfitLockEnabled] = useState(true);
  const [earlyProfitLockThreshold, setEarlyProfitLockThreshold] = useState("0.3");
  const [momentumExitGuardEnabled, setMomentumExitGuardEnabled] = useState(true);

  // Initialize from context instead of independent fetch
  useEffect(() => {
    if (riskParams) {
      setEnabled(riskParams.trailing_stop_enabled ?? true);
      setActivationPercent((riskParams.trailing_stop_activation_percent ?? 1.0).toString());
      setDistanceMultiplier((riskParams.trailing_stop_distance_multiplier ?? 1.5).toString());
      setBreakEvenEnabled(riskParams.break_even_enabled ?? true);
      setBreakEvenActivationPercent((riskParams.break_even_activation_percent ?? 0.5).toString());
      setProfitLockPercent((riskParams.trailing_stop_profit_lock_percent ?? 50).toString());
      setTrailingAggressiveness(riskParams.trailing_aggressiveness ?? 3);
      setProgressiveLockEnabled(riskParams.progressive_lock_enabled ?? true);
      setStalePeakProtectionEnabled(riskParams.stale_peak_protection_enabled ?? true);
      setDecayVelocityExitEnabled(riskParams.decay_velocity_exit_enabled ?? true);
      setEarlyProfitLockEnabled(riskParams.early_profit_lock_enabled ?? true);
      setEarlyProfitLockThreshold((riskParams.early_profit_lock_threshold ?? 0.3).toString());
      setMomentumExitGuardEnabled(riskParams.momentum_exit_guard_enabled ?? true);
    }
  }, [riskParams]);

  const handleSave = async () => {
    try {
      setLoading(true);

      const activationValue = parseFloat(activationPercent);
      const multiplierValue = parseFloat(distanceMultiplier);
      const breakEvenValue = parseFloat(breakEvenActivationPercent);
      const profitLockValue = parseFloat(profitLockPercent);

      if (isNaN(activationValue) || activationValue < 0.1 || activationValue > 10) {
        throw new Error('Activation threshold must be between 0.1% and 10%');
      }
      if (isNaN(multiplierValue) || multiplierValue < 0.5 || multiplierValue > 5) {
        throw new Error('Distance multiplier must be between 0.5x and 5x');
      }
      if (isNaN(breakEvenValue) || breakEvenValue < 0.1 || breakEvenValue > 5) {
        throw new Error('Break-even threshold must be between 0.1% and 5%');
      }
      if (isNaN(profitLockValue) || profitLockValue < 20 || profitLockValue > 90) {
        throw new Error('Profit lock percentage must be between 20% and 90%');
      }

      await updateRiskParameters({
        trailing_stop_enabled: enabled,
        trailing_stop_activation_percent: activationValue,
        trailing_stop_distance_multiplier: multiplierValue,
        break_even_enabled: breakEvenEnabled,
        break_even_activation_percent: breakEvenValue,
        trailing_stop_profit_lock_percent: profitLockValue,
        trailing_aggressiveness: trailingAggressiveness,
        progressive_lock_enabled: progressiveLockEnabled,
        stale_peak_protection_enabled: stalePeakProtectionEnabled,
        decay_velocity_exit_enabled: decayVelocityExitEnabled,
        early_profit_lock_enabled: earlyProfitLockEnabled,
        early_profit_lock_threshold: parseFloat(earlyProfitLockThreshold),
        momentum_exit_guard_enabled: momentumExitGuardEnabled,
      });

      toast({
        title: "Settings Saved",
        description: "Stop loss protection settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate effective lock for display based on aggressiveness
  const getEffectiveLockDisplay = () => {
    const baseLock = 30 + (trailingAggressiveness * 5);
    return { baseLock, tier5Lock: Math.min(85, baseLock + 30) };
  };
  
  const { baseLock, tier5Lock } = getEffectiveLockDisplay();

  const aggressivenessLabels = ["Very Conservative", "Conservative", "Balanced", "Aggressive", "Very Aggressive"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Stop Loss Protection Settings
        </CardTitle>
        <CardDescription>
          Configure break-even, trailing stop, and Smart AITS protection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Smart AITS Section */}
        <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Smart AITS (Adaptive Intelligent Trailing System)</h4>
            <Badge variant="secondary" className="text-xs">New</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Automatically adapts profit lock based on peak P&L level, stale peaks, and decay velocity for maximum profit retention.
          </p>

          {/* Aggressiveness Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Trailing Aggressiveness</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="w-64">
                        Controls how aggressively profits are locked. Higher = locks more profit sooner but may exit earlier on normal pullbacks.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Badge variant="outline">{aggressivenessLabels[trailingAggressiveness - 1]}</Badge>
            </div>
            <Slider
              value={[trailingAggressiveness]}
              onValueChange={(v) => setTrailingAggressiveness(v[0])}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>More room to run</span>
              <span>Base: {baseLock}% → Tier 5: {tier5Lock}%</span>
              <span>Tighter locks</span>
            </div>
          </div>

          {/* Smart Features Toggles */}
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <Label className="text-sm font-medium">Progressive Lock Tiers</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Lock more profit as peak P&L increases (45% → 85%)
                </p>
              </div>
              <Switch
                checked={progressiveLockEnabled}
                onCheckedChange={setProgressiveLockEnabled}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <Label className="text-sm font-medium">Stale Peak Protection</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tighten stops when peak hasn't updated (15/30/60/120 min)
                </p>
              </div>
              <Switch
                checked={stalePeakProtectionEnabled}
                onCheckedChange={setStalePeakProtectionEnabled}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-red-500" />
                  <Label className="text-sm font-medium">Decay Velocity Exit</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Emergency exit when profit decays too fast ({">"}3%/min)
                </p>
              </div>
              <Switch
                checked={decayVelocityExitEnabled}
                onCheckedChange={setDecayVelocityExitEnabled}
              />
            </div>
          </div>

          {/* Pre-Activation Protection - Early Profit Lock */}
          <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-green-500" />
              <h5 className="text-sm font-medium">Pre-Activation Protection</h5>
              <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">
                Fixes Loss Issue
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Protects positions that haven't reached the 1% trailing activation threshold by moving stop to break-even earlier.
            </p>
            
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <Label className="text-sm font-medium">Early Profit Lock</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Move stop to break-even when profit reaches {earlyProfitLockThreshold}%
                </p>
              </div>
              <Switch
                checked={earlyProfitLockEnabled}
                onCheckedChange={setEarlyProfitLockEnabled}
              />
            </div>

            {earlyProfitLockEnabled && (
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-2">
                  <Label htmlFor="early-lock-threshold">Lock Threshold</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="w-64">
                          When position reaches this profit %, stop moves to break-even. Lower = more protection but may exit on small pullbacks.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="early-lock-threshold"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="0.9"
                    value={earlyProfitLockThreshold}
                    onChange={(e) => setEarlyProfitLockThreshold(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">% profit triggers break-even</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <Label className="text-sm font-medium">Momentum Exit Guard</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exit early if momentum turns against position before activation
                </p>
              </div>
              <Switch
                checked={momentumExitGuardEnabled}
                onCheckedChange={setMomentumExitGuardEnabled}
              />
            </div>
          </div>

          {/* Smart AITS Summary */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            <h5 className="mb-1 font-medium">How Smart AITS Works:</h5>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>• <strong>Early Lock:</strong> Position peaks at 0.3%+ → stop moves to break-even (prevents almost-winners from losing)</li>
              <li>• <strong>Progressive Tiers:</strong> 0-1%→{baseLock}%, 1-2%→{baseLock + 10}%, 2-3%→{baseLock + 15}%, 3-5%→{baseLock + 20}%, 5%+→{tier5Lock}%</li>
              <li>• <strong>Stale Peak:</strong> +5% at 15min, +10% at 30min, +20% at 60min, +25% at 120min</li>
              <li>• <strong>Decay Velocity:</strong> {">"}3%/min decay = immediate exit, {">"}2%/min = 80% lock</li>
            </ul>
          </div>
        </div>

        <Separator />

        {/* Break-Even Stop Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-green-500" />
            <h4 className="font-medium">Break-Even Stop</h4>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="break-even-enabled" className="text-base">
                Enable Break-Even Stop
              </Label>
              <p className="text-sm text-muted-foreground">
                Move stop loss to entry price when profitable
              </p>
            </div>
            <Switch
              id="break-even-enabled"
              checked={breakEvenEnabled}
              onCheckedChange={setBreakEvenEnabled}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="break-even-percent">Break-Even Activation</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="w-64">
                      When position profit reaches this percentage, stop loss moves to entry price.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="break-even-percent"
                type="number"
                step="0.1"
                min="0.1"
                max="5"
                value={breakEvenActivationPercent}
                onChange={(e) => setBreakEvenActivationPercent(e.target.value)}
                disabled={!breakEvenEnabled}
                className="max-w-32"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Trailing Stop Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <h4 className="font-medium">Trailing Stop Loss (Base Settings)</h4>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="trailing-enabled" className="text-base">
                Enable Trailing Stop Loss
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically adjust stop loss to lock in profits
              </p>
            </div>
            <Switch
              id="trailing-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activation-percent">Activation Threshold</Label>
            <div className="flex items-center gap-2">
              <Input
                id="activation-percent"
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={activationPercent}
                onChange={(e) => setActivationPercent(e.target.value)}
                disabled={!enabled}
                className="max-w-32"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="distance-multiplier">Trailing Distance (ATR Multiplier)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="distance-multiplier"
                type="number"
                step="0.1"
                min="0.5"
                max="5"
                value={distanceMultiplier}
                onChange={(e) => setDistanceMultiplier(e.target.value)}
                disabled={!enabled}
                className="max-w-32"
              />
              <span className="text-sm text-muted-foreground">x ATR</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profit-lock-percent">Base Profit Lock (overridden by Smart AITS)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="profit-lock-percent"
                type="number"
                step="5"
                min="20"
                max="90"
                value={profitLockPercent}
                onChange={(e) => setProfitLockPercent(e.target.value)}
                disabled={!enabled}
                className="max-w-32"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Smart AITS will use higher values when conditions warrant
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActivationPercent("0.5");
                setDistanceMultiplier("1.0");
              }}
              disabled={!enabled}
            >
              Tight
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActivationPercent("1.0");
                setDistanceMultiplier("1.5");
              }}
              disabled={!enabled}
            >
              Balanced
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActivationPercent("2.0");
                setDistanceMultiplier("2.5");
              }}
              disabled={!enabled}
            >
              Loose
            </Button>
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={loading}
          className="w-full"
        >
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};