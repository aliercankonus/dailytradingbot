import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function DivergenceSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [enablePullback, setEnablePullback] = useState(true);
  const [enableEarlyReversal, setEnableEarlyReversal] = useState(true);
  const [pullbackSize, setPullbackSize] = useState(50);
  const [earlyReversalSize, setEarlyReversalSize] = useState(40);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('risk_parameters')
        .select('enable_pullback_signals, enable_early_reversal_signals, pullback_position_size_percent, early_reversal_position_size_percent')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setEnablePullback(data.enable_pullback_signals ?? true);
        setEnableEarlyReversal(data.enable_early_reversal_signals ?? true);
        setPullbackSize(data.pullback_position_size_percent ?? 50);
        setEarlyReversalSize(data.early_reversal_position_size_percent ?? 40);
      }
    } catch (error) {
      console.error('Error fetching divergence settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load divergence settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('risk_parameters')
        .update({
          enable_pullback_signals: enablePullback,
          enable_early_reversal_signals: enableEarlyReversal,
          pullback_position_size_percent: pullbackSize,
          early_reversal_position_size_percent: earlyReversalSize,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Divergence opportunity settings updated',
      });
    } catch (error) {
      console.error('Error saving divergence settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save divergence settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Divergence Opportunity Strategy</CardTitle>
        <CardDescription>
          Capture trend transitions when 4h and 1h timeframes diverge
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Divergence signals allow trading during trend transitions with reduced position sizing.
            Aligned signals (4h + 1h agree) always trade at 100% position size.
          </AlertDescription>
        </Alert>

        {/* Pullback Signals */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <Label htmlFor="pullback-signals" className="text-base font-semibold">
                  Pullback Signals
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Trade with 4h trend when it's strong (≥60%) but 1h opposes, confirmed by 30m/15m alignment
              </p>
            </div>
            <Switch
              id="pullback-signals"
              checked={enablePullback}
              onCheckedChange={setEnablePullback}
            />
          </div>

          {enablePullback && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Position Size</Label>
                <span className="text-sm font-medium">{pullbackSize}%</span>
              </div>
              <Slider
                value={[pullbackSize]}
                onValueChange={(value) => setPullbackSize(value[0])}
                min={20}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 50% (requires 30m or 15m to confirm 4h trend direction)
              </p>
            </div>
          )}
        </div>

        {/* Early Reversal Signals */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-secondary" />
                <Label htmlFor="early-reversal-signals" className="text-base font-semibold">
                  Early Reversal Signals
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Trade with 1h reversal when it's strong (≥70%) and 4h is weak, confirmed by 30m/15m alignment
              </p>
            </div>
            <Switch
              id="early-reversal-signals"
              checked={enableEarlyReversal}
              onCheckedChange={setEnableEarlyReversal}
            />
          </div>

          {enableEarlyReversal && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Position Size</Label>
                <span className="text-sm font-medium">{earlyReversalSize}%</span>
              </div>
              <Slider
                value={[earlyReversalSize]}
                onValueChange={(value) => setEarlyReversalSize(value[0])}
                min={20}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 40% (requires both 30m and 15m to confirm 1h reversal)
              </p>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Divergence Settings'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
