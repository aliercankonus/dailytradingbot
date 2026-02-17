import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRiskParametersContext } from '@/contexts/RiskParametersContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { TrendingUp, Shield, Sliders } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export const UnifiedRiskSettings = () => {
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const { toast } = useToast();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [formData, setFormData] = useState({
    base_position_size_percent: 1.5,
    base_stop_loss_percent: 2.0,
    base_take_profit_multiplier: 2.5,
    risk_profile: 'balanced' as 'conservative' | 'balanced' | 'aggressive',
    enable_atr_based_stops: true,
    enable_adx_position_scaling: true,
    enable_quality_based_sizing: true,
  });

  useEffect(() => {
    if (riskParams) {
      setFormData({
        base_position_size_percent: riskParams.base_position_size_percent ?? 1.5,
        base_stop_loss_percent: riskParams.base_stop_loss_percent ?? 2.0,
        base_take_profit_multiplier: riskParams.base_take_profit_multiplier ?? 2.5,
        risk_profile: (riskParams.risk_profile as 'conservative' | 'balanced' | 'aggressive') ?? 'balanced',
        enable_atr_based_stops: riskParams.enable_atr_based_stops ?? true,
        enable_adx_position_scaling: riskParams.enable_adx_position_scaling ?? true,
        enable_quality_based_sizing: riskParams.enable_quality_based_sizing ?? true,
      });
    }
  }, [riskParams]);

  const handleUpdate = async () => {
    try {
      await updateRiskParameters(formData);
      toast({
        title: "Settings Updated",
        description: "Trade sizing parameters have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : 'Failed to update settings',
        variant: "destructive",
      });
    }
  };

  if (!riskParams) {
    return <p className="text-muted-foreground p-4">Loading...</p>;
  }

  // Calculate effective values based on risk profile
  const profileMultipliers = {
    conservative: { size: 0.7, sl: 0.8, label: 'Smaller positions, tighter stops' },
    balanced: { size: 1.0, sl: 1.0, label: 'Standard sizing and stops' },
    aggressive: { size: 1.3, sl: 1.2, label: 'Larger positions, wider stops' },
  };

  const profile = profileMultipliers[formData.risk_profile];
  const effectivePosition = formData.base_position_size_percent * profile.size;
  const effectiveSL = formData.base_stop_loss_percent * profile.sl;
  const effectiveTP = effectiveSL * formData.base_take_profit_multiplier;
  const rrRatio = formData.base_take_profit_multiplier;

  return (
    <div className="space-y-6 pt-4">
        {/* Main Settings */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="base-position-size" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Base Position Size (%)
            </Label>
            <Input
              id="base-position-size"
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={formData.base_position_size_percent}
              onChange={(e) => 
                setFormData({ ...formData, base_position_size_percent: parseFloat(e.target.value) || 1.5 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Starting position as % of portfolio
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-stop-loss" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Base Stop Loss (%)
            </Label>
            <Input
              id="base-stop-loss"
              type="number"
              min="0.5"
              max="10"
              step="0.1"
              value={formData.base_stop_loss_percent}
              onChange={(e) => 
                setFormData({ ...formData, base_stop_loss_percent: parseFloat(e.target.value) || 2.0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Distance from entry to stop loss
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-tp-multiplier">Take Profit Multiplier</Label>
            <Input
              id="base-tp-multiplier"
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={formData.base_take_profit_multiplier}
              onChange={(e) => 
                setFormData({ ...formData, base_take_profit_multiplier: parseFloat(e.target.value) || 2.5 })
              }
            />
            <p className="text-xs text-muted-foreground">
              TP = SL × {formData.base_take_profit_multiplier} (1:{rrRatio.toFixed(1)} R:R)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk-profile">Risk Profile</Label>
            <Select
              value={formData.risk_profile}
              onValueChange={(value: 'conservative' | 'balanced' | 'aggressive') => 
                setFormData({ ...formData, risk_profile: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {profile.label}
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-3 text-sm">Effective Values (with {formData.risk_profile} profile)</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{effectivePosition.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Position Size</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{effectiveSL.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Stop Loss</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-500">{effectiveTP.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Take Profit</div>
            </div>
          </div>
        </div>

        {/* Advanced Toggles */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="h-4 w-4" />
                Advanced Auto-Scaling
              </span>
              <span className="text-xs text-muted-foreground">
                {advancedOpen ? 'Hide' : 'Show'}
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>ATR-Based Dynamic Stops</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust stops based on real market volatility
                </p>
              </div>
              <Switch
                checked={formData.enable_atr_based_stops}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, enable_atr_based_stops: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>ADX-Based Position Scaling</Label>
                <p className="text-xs text-muted-foreground">
                  Reduce size in late trends (high ADX), increase in fresh trends
                </p>
              </div>
              <Switch
                checked={formData.enable_adx_position_scaling}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, enable_adx_position_scaling: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Quality-Based Sizing</Label>
                <p className="text-xs text-muted-foreground">
                  Better setups get slightly larger positions
                </p>
              </div>
              <Switch
                checked={formData.enable_quality_based_sizing}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, enable_quality_based_sizing: checked })
                }
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button onClick={handleUpdate} className="w-full">
          Update Trade Sizing
        </Button>
    </div>
  );
};
