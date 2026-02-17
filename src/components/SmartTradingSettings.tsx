import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  TrendingUp, 
  Target, 
  BarChart3, 
  Shield,
  Activity
} from 'lucide-react';
import { RiskParameters } from '@/hooks/useRiskParameters';
import { useToast } from '@/hooks/use-toast';

interface SmartTradingSettingsProps {
  riskParams: RiskParameters | null;
  updateRiskParameters: (updates: Partial<RiskParameters>) => Promise<void>;
}

export function SmartTradingSettings({ riskParams, updateRiskParameters }: SmartTradingSettingsProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    regime_aware_trading: true,
    min_momentum_score: 30,
    max_overextension_atr: 2.0,
    min_pullback_depth: 0.382,
    require_volume_confirmation: true,
    exhaustion_block_enabled: true,
    min_entry_quality_score: 60,
    trending_regime_min_adx: 25,
    ranging_regime_max_adx: 20,
  });

  useEffect(() => {
    if (riskParams) {
      setFormData({
        regime_aware_trading: riskParams.regime_aware_trading ?? true,
        min_momentum_score: riskParams.min_momentum_score ?? 30,
        max_overextension_atr: riskParams.max_overextension_atr ?? 2.0,
        min_pullback_depth: riskParams.min_pullback_depth ?? 0.382,
        require_volume_confirmation: riskParams.require_volume_confirmation ?? true,
        exhaustion_block_enabled: riskParams.exhaustion_block_enabled ?? true,
        min_entry_quality_score: riskParams.min_entry_quality_score ?? 60,
        trending_regime_min_adx: riskParams.trending_regime_min_adx ?? 25,
        ranging_regime_max_adx: riskParams.ranging_regime_max_adx ?? 20,
      });
    }
  }, [riskParams]);

  const handleSave = async () => {
    try {
      await updateRiskParameters(formData);
      toast({
        title: "Settings Saved",
        description: "Smart trading settings have been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Smart Trading Intelligence
        </CardTitle>
        <CardDescription>
          Advanced AI-powered entry timing, momentum detection, and market regime awareness
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase 1: Trend Change Detection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <h3 className="font-semibold">Trend Change Detection</h3>
            <Badge variant="outline" className="text-xs">Phase 1</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
            <div className="space-y-2">
              <Label htmlFor="min_momentum_score" className="text-sm">
                Minimum Momentum Score
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="min_momentum_score"
                  value={[formData.min_momentum_score]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, min_momentum_score: v }))}
                  min={0}
                  max={60}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm font-mono">{formData.min_momentum_score}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Block entries when momentum score is below this threshold
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_overextension_atr" className="text-sm">
                Max Overextension (ATR)
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="max_overextension_atr"
                  value={[formData.max_overextension_atr]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, max_overextension_atr: v }))}
                  min={1.0}
                  max={4.0}
                  step={0.25}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm font-mono">{formData.max_overextension_atr.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Block entries when price is this many ATRs from EMA
              </p>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-sm">Exhaustion Detection</Label>
                <p className="text-xs text-muted-foreground">
                  Block entries when trend shows exhaustion
                </p>
              </div>
              <Switch
                checked={formData.exhaustion_block_enabled}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, exhaustion_block_enabled: v }))}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Phase 2: Entry Timing */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-500" />
            <h3 className="font-semibold">Smart Entry Timing</h3>
            <Badge variant="outline" className="text-xs">Phase 2</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
            <div className="space-y-2">
              <Label htmlFor="min_pullback_depth" className="text-sm">
                Minimum Pullback Depth (Fib)
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="min_pullback_depth"
                  value={[formData.min_pullback_depth * 100]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, min_pullback_depth: v / 100 }))}
                  min={20}
                  max={62}
                  step={2}
                  className="flex-1"
                />
                <span className="w-16 text-right text-sm font-mono">{(formData.min_pullback_depth * 100).toFixed(0)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum Fibonacci retracement for valid pullback entry
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_entry_quality_score" className="text-sm">
                Minimum Entry Quality Score
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="min_entry_quality_score"
                  value={[formData.min_entry_quality_score]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, min_entry_quality_score: v }))}
                  min={40}
                  max={85}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm font-mono">{formData.min_entry_quality_score}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Composite score from momentum, pullback, volume, timeframe alignment
              </p>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-sm">Require Volume Confirmation</Label>
                <p className="text-xs text-muted-foreground">
                  Block entries without volume spike or increasing volume
                </p>
              </div>
              <Switch
                checked={formData.require_volume_confirmation}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, require_volume_confirmation: v }))}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Phase 4: Market Regime */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-500" />
            <h3 className="font-semibold">Market Regime Detection</h3>
            <Badge variant="outline" className="text-xs">Phase 4</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-sm">Regime-Aware Trading</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust strategy based on market regime
                </p>
              </div>
              <Switch
                checked={formData.regime_aware_trading}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, regime_aware_trading: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trending_regime_min_adx" className="text-sm">
                Trending Regime Min ADX
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="trending_regime_min_adx"
                  value={[formData.trending_regime_min_adx]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, trending_regime_min_adx: v }))}
                  min={20}
                  max={35}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm font-mono">{formData.trending_regime_min_adx}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                ADX threshold for TRENDING classification
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ranging_regime_max_adx" className="text-sm">
                Ranging Regime Max ADX
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="ranging_regime_max_adx"
                  value={[formData.ranging_regime_max_adx]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, ranging_regime_max_adx: v }))}
                  min={15}
                  max={25}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm font-mono">{formData.ranging_regime_max_adx}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                ADX threshold for RANGING classification
              </p>
            </div>
          </div>
        </div>

        {/* Regime Legend */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Market Regime Behavior
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-500">TRENDING</Badge>
              <span>Full position</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-yellow-500">TRANSITION</Badge>
              <span>75% position</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-orange-500">RANGING</Badge>
              <span>50% (squeeze only)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-red-500">EXHAUSTED</Badge>
              <span>No entries</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} className="gap-2">
            <Shield className="h-4 w-4" />
            Save Smart Trading Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}