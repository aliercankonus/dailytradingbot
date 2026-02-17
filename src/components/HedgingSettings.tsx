import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle, TrendingDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RiskParameters } from "@/hooks/useRiskParameters";

interface HedgingSettingsProps {
  riskParams: RiskParameters | null;
  updateRiskParameters: (updates: Partial<RiskParameters>) => Promise<void>;
}

interface HedgingSettingsData {
  hedgingEnabled: boolean;
  hedgeReversalRiskMin: number;
  hedgeReversalRiskMax: number;
  hedgePositionSizePercent: number;
}

export const HedgingSettings = ({ riskParams, updateRiskParameters }: HedgingSettingsProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<HedgingSettingsData>({
    hedgingEnabled: false,
    hedgeReversalRiskMin: 50,
    hedgeReversalRiskMax: 70,
    hedgePositionSizePercent: 50,
  });

  useEffect(() => {
    if (riskParams) {
      setSettings({
        hedgingEnabled: riskParams.hedging_enabled ?? false,
        hedgeReversalRiskMin: riskParams.hedge_reversal_risk_min ?? 50,
        hedgeReversalRiskMax: riskParams.hedge_reversal_risk_max ?? 70,
        hedgePositionSizePercent: riskParams.hedge_position_size_percent ?? 50,
      });
    }
  }, [riskParams]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.hedgeReversalRiskMin >= settings.hedgeReversalRiskMax) {
        toast({
          title: "Invalid Settings",
          description: "Minimum risk must be less than maximum risk threshold",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      await updateRiskParameters({
        hedging_enabled: settings.hedgingEnabled,
        hedge_reversal_risk_min: settings.hedgeReversalRiskMin,
        hedge_reversal_risk_max: settings.hedgeReversalRiskMax,
        hedge_position_size_percent: settings.hedgePositionSizePercent,
      });

      toast({
        title: "Hedging Settings Saved",
        description: "Your hedging configuration has been updated successfully.",
      });
    } catch (err) {
      console.error("Error saving hedging settings:", err);
      toast({
        title: "Error",
        description: "Failed to save hedging settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Reversal Risk Hedging
        </CardTitle>
        <CardDescription>
          When reversal risk is moderate (50-70%), open a partial hedge instead of closing the position
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>How Hedging Works</AlertTitle>
          <AlertDescription className="text-sm">
            When reversal risk reaches {settings.hedgeReversalRiskMin}%, a {settings.hedgePositionSizePercent}% opposite 
            position is opened to neutralize exposure. If risk drops below {Math.round(settings.hedgeReversalRiskMin * 0.7)}%, 
            the hedge is closed. If risk exceeds {settings.hedgeReversalRiskMax}%, the original position is closed instead.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Hedging</Label>
            <p className="text-sm text-muted-foreground">
              Hedge positions when reversal risk is moderate instead of closing
            </p>
          </div>
          <Switch
            checked={settings.hedgingEnabled}
            onCheckedChange={(checked) => setSettings({ ...settings, hedgingEnabled: checked })}
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Hedge Trigger Range</Label>
              <span className="text-sm font-medium">
                {settings.hedgeReversalRiskMin}% - {settings.hedgeReversalRiskMax}%
              </span>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Min (Hedge Opens)</p>
                <Slider
                  value={[settings.hedgeReversalRiskMin]}
                  onValueChange={(value) => setSettings({ ...settings, hedgeReversalRiskMin: value[0] })}
                  min={30}
                  max={60}
                  step={5}
                  disabled={!settings.hedgingEnabled}
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Max (Position Closes)</p>
                <Slider
                  value={[settings.hedgeReversalRiskMax]}
                  onValueChange={(value) => setSettings({ ...settings, hedgeReversalRiskMax: value[0] })}
                  min={60}
                  max={90}
                  step={5}
                  disabled={!settings.hedgingEnabled}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Hedge Position Size</Label>
              <span className="text-sm font-medium">{settings.hedgePositionSizePercent}%</span>
            </div>
            <Slider
              value={[settings.hedgePositionSizePercent]}
              onValueChange={(value) => setSettings({ ...settings, hedgePositionSizePercent: value[0] })}
              min={25}
              max={100}
              step={5}
              disabled={!settings.hedgingEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Percentage of original position to hedge (50% = half-hedge)
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-500" />
            Hedge Lifecycle
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Opens:</strong> When reversal risk ≥ {settings.hedgeReversalRiskMin}% and position is losing</li>
            <li>• <strong>Closes:</strong> When reversal risk drops below {Math.round(settings.hedgeReversalRiskMin * 0.7)}%</li>
            <li>• <strong>Full Exit:</strong> Original position closes if risk ≥ {settings.hedgeReversalRiskMax}%</li>
          </ul>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Hedging Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};