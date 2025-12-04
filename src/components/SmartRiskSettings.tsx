import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Brain, TrendingUp, Shield, Loader2 } from "lucide-react";

interface SmartRiskSettings {
  dynamic_max_trades_enabled: boolean;
  kelly_criterion_enabled: boolean;
  trailing_daily_limit_enabled: boolean;
  kelly_max_risk_cap: number;
  min_trades_for_kelly: number;
  volatility_max_trades_reduction: number;
}

export default function SmartRiskSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SmartRiskSettings>({
    dynamic_max_trades_enabled: true,
    kelly_criterion_enabled: true,
    trailing_daily_limit_enabled: true,
    kelly_max_risk_cap: 3.0,
    min_trades_for_kelly: 10,
    volatility_max_trades_reduction: 0.5,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("risk_parameters")
        .select("dynamic_max_trades_enabled, kelly_criterion_enabled, trailing_daily_limit_enabled, kelly_max_risk_cap, min_trades_for_kelly, volatility_max_trades_reduction")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      if (data) {
        setSettings({
          dynamic_max_trades_enabled: data.dynamic_max_trades_enabled ?? true,
          kelly_criterion_enabled: data.kelly_criterion_enabled ?? true,
          trailing_daily_limit_enabled: data.trailing_daily_limit_enabled ?? true,
          kelly_max_risk_cap: data.kelly_max_risk_cap ?? 3.0,
          min_trades_for_kelly: data.min_trades_for_kelly ?? 10,
          volatility_max_trades_reduction: data.volatility_max_trades_reduction ?? 0.5,
        });
      }
    } catch (error) {
      console.error("Error fetching smart risk settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("risk_parameters")
        .update(settings)
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Smart risk management settings updated successfully.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>Smart Risk Management</CardTitle>
          <Badge variant="secondary">AI-Powered</Badge>
        </div>
        <CardDescription>
          Intelligent risk controls that adapt based on performance and market conditions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dynamic Max Trades */}
        <div className="space-y-4 p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <Label htmlFor="dynamic-max-trades" className="font-medium">
                Dynamic Max Trades
              </Label>
            </div>
            <Switch
              id="dynamic-max-trades"
              checked={settings.dynamic_max_trades_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, dynamic_max_trades_enabled: checked }))
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Automatically adjusts max open trades based on recent win rate.
            <span className="block mt-1 text-xs">
              • Win rate ≥70%: +2 trades bonus
              • Win rate &lt;40%: 50% reduction
            </span>
          </p>
        </div>

        {/* Kelly Criterion */}
        <div className="space-y-4 p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              <Label htmlFor="kelly-criterion" className="font-medium">
                Kelly Criterion Sizing
              </Label>
            </div>
            <Switch
              id="kelly-criterion"
              checked={settings.kelly_criterion_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, kelly_criterion_enabled: checked }))
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Calculates optimal position size from your historical win rate and avg win/loss ratio.
          </p>
          
          {settings.kelly_criterion_enabled && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Max Risk Cap</span>
                  <span className="font-mono">{settings.kelly_max_risk_cap.toFixed(1)}%</span>
                </div>
                <Slider
                  value={[settings.kelly_max_risk_cap]}
                  onValueChange={([value]) =>
                    setSettings((prev) => ({ ...prev, kelly_max_risk_cap: value }))
                  }
                  min={1}
                  max={10}
                  step={0.5}
                />
                <p className="text-xs text-muted-foreground">
                  Caps Kelly calculation to prevent over-betting
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Min Trades for Kelly</span>
                  <span className="font-mono">{settings.min_trades_for_kelly}</span>
                </div>
                <Slider
                  value={[settings.min_trades_for_kelly]}
                  onValueChange={([value]) =>
                    setSettings((prev) => ({ ...prev, min_trades_for_kelly: value }))
                  }
                  min={5}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Trades needed before Kelly applies (uses strategy default before)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Trailing Daily Limit */}
        <div className="space-y-4 p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              <Label htmlFor="trailing-daily-limit" className="font-medium">
                Trailing Daily Limit
              </Label>
            </div>
            <Switch
              id="trailing-daily-limit"
              checked={settings.trailing_daily_limit_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, trailing_daily_limit_enabled: checked }))
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Locks 50% of daily gains by tightening the daily loss limit.
            <span className="block mt-1 text-xs">
              Example: If up $200 today, loss limit tightens to protect $100 of gains.
            </span>
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Smart Risk Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
