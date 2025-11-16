import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { RefreshCw } from 'lucide-react';

export const PositionRebalancingSettings = () => {
  const { toast } = useToast();
  const { riskParams, updateRiskParameters } = useRiskParameters();

  const handleToggleAutoRebalance = async (enabled: boolean) => {
    try {
      await updateRiskParameters({
        auto_rebalance_enabled: enabled,
      });
      toast({
        title: enabled ? "Auto-Rebalancing Enabled" : "Auto-Rebalancing Disabled",
        description: enabled 
          ? "Positions will be automatically rebalanced every 5 minutes"
          : "Automatic rebalancing has been disabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update auto-rebalancing setting",
        variant: "destructive",
      });
    }
  };

  const handleUpdateThreshold = async (value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    try {
      await updateRiskParameters({
        rebalance_loss_threshold_percent: numValue,
      });
      toast({
        title: "Threshold Updated",
        description: `Loss threshold set to ${numValue}%`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update loss threshold",
        variant: "destructive",
      });
    }
  };

  const handleUpdateMaxPositions = async (value: string) => {
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 1) return;

    try {
      await updateRiskParameters({
        max_positions_to_close_per_cycle: numValue,
      });
      toast({
        title: "Max Positions Updated",
        description: `Maximum positions per cycle set to ${numValue}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update max positions",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Automated Position Rebalancing</h2>
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Automatically close underwater positions that conflict with current market trends and replace them with positions aligned to the trend.
        </p>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <div className="font-medium">Enable Auto-Rebalancing</div>
            <p className="text-sm text-muted-foreground">
              Runs every 5 minutes to optimize position alignment with market trends
            </p>
          </div>
          <Switch
            checked={riskParams?.auto_rebalance_enabled ?? false}
            onCheckedChange={handleToggleAutoRebalance}
          />
        </div>

        {/* Loss Threshold */}
        <div className="space-y-2">
          <Label htmlFor="rebalance-threshold">
            Loss Threshold (%)
          </Label>
          <Input
            id="rebalance-threshold"
            type="number"
            min="0"
            step="0.1"
            value={riskParams?.rebalance_loss_threshold_percent ?? 1.0}
            onChange={(e) => handleUpdateThreshold(e.target.value)}
            onBlur={(e) => handleUpdateThreshold(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Only consider positions losing more than this percentage
          </p>
        </div>

        {/* Max Positions Per Cycle */}
        <div className="space-y-2">
          <Label htmlFor="max-positions">
            Max Positions to Close Per Cycle
          </Label>
          <Input
            id="max-positions"
            type="number"
            min="1"
            step="1"
            value={riskParams?.max_positions_to_close_per_cycle ?? 3}
            onChange={(e) => handleUpdateMaxPositions(e.target.value)}
            onBlur={(e) => handleUpdateMaxPositions(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Gradually rebalance portfolio by closing this many positions per 5-minute cycle
          </p>
        </div>

        {riskParams?.auto_rebalance_enabled && (
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-primary font-medium">
              ✓ Auto-rebalancing is active and will run every 5 minutes
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
