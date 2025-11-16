import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const TrailingStopSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [activationPercent, setActivationPercent] = useState("1.0");
  const [distanceMultiplier, setDistanceMultiplier] = useState("1.5");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('risk_parameters')
        .select('trailing_stop_enabled, trailing_stop_activation_percent, trailing_stop_distance_multiplier')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setEnabled(data.trailing_stop_enabled ?? true);
        setActivationPercent((data.trailing_stop_activation_percent ?? 1.0).toString());
        setDistanceMultiplier((data.trailing_stop_distance_multiplier ?? 1.5).toString());
      }
    } catch (error) {
      console.error('Error fetching trailing stop settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Validate inputs
      const activationValue = parseFloat(activationPercent);
      const multiplierValue = parseFloat(distanceMultiplier);

      if (isNaN(activationValue) || activationValue < 0.1 || activationValue > 10) {
        throw new Error('Activation threshold must be between 0.1% and 10%');
      }

      if (isNaN(multiplierValue) || multiplierValue < 0.5 || multiplierValue > 5) {
        throw new Error('Distance multiplier must be between 0.5x and 5x');
      }

      const { error } = await supabase
        .from('risk_parameters')
        .update({
          trailing_stop_enabled: enabled,
          trailing_stop_activation_percent: activationValue,
          trailing_stop_distance_multiplier: multiplierValue,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Trailing stop loss settings have been updated successfully.",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Trailing Stop Loss Settings
        </CardTitle>
        <CardDescription>
          Configure when and how trailing stops protect your profits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
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

        {/* Activation Threshold */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="activation-percent">
              Activation Threshold
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="w-64">
                    Trailing stop activates when position reaches this profit percentage.
                    Lower = earlier protection, Higher = more room to grow.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
          <p className="text-xs text-muted-foreground">
            Current: Trailing activates at +{activationPercent}% profit
          </p>
        </div>

        {/* Distance Multiplier */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="distance-multiplier">
              Trailing Distance
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="w-64">
                    Multiplier for ATR (Average True Range) to set stop loss distance.
                    Lower = tighter stops (more risk of exit), Higher = looser stops (more room).
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
          <p className="text-xs text-muted-foreground">
            Current: Stop loss trails at {distanceMultiplier}x ATR distance (typically {(parseFloat(distanceMultiplier) * 2).toFixed(1)}-{(parseFloat(distanceMultiplier) * 3).toFixed(1)}%)
          </p>
        </div>

        {/* Example Calculation */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <h4 className="text-sm font-medium">Example with Current Settings:</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Position opens at $100</li>
            <li>• Price rises to ${(100 * (1 + parseFloat(activationPercent) / 100)).toFixed(2)} (+{activationPercent}%) → Trailing activates</li>
            <li>• Stop loss set {distanceMultiplier}x ATR below price (e.g., ${(100 * (1 + parseFloat(activationPercent) / 100) * (1 - parseFloat(distanceMultiplier) * 0.02)).toFixed(2)})</li>
            <li>• As price rises, stop loss follows {distanceMultiplier}x ATR behind</li>
            <li>• Locks in profits automatically</li>
          </ul>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label>Quick Presets</Label>
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
              <span className="text-xs text-muted-foreground ml-1">(0.5%, 1x)</span>
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
              <span className="text-xs text-muted-foreground ml-1">(1%, 1.5x)</span>
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
              <span className="text-xs text-muted-foreground ml-1">(2%, 2.5x)</span>
            </Button>
          </div>
        </div>

        {/* Save Button */}
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
