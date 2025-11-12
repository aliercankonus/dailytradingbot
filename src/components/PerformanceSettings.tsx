import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Settings, Gauge } from 'lucide-react';

const DEFAULT_AI_TTL = 5 * 60 * 1000; // 5 minutes

export const PerformanceSettings = () => {
  const { toast } = useToast();
  const [aiCacheTTL, setAiCacheTTL] = useState(5); // in minutes

  useEffect(() => {
    // Load saved settings
    const savedTTL = localStorage.getItem('ai_recommendation_ttl');
    
    if (savedTTL) {
      setAiCacheTTL(parseInt(savedTTL) / 60000); // Convert ms to minutes
    }
  }, []);

  const handleSaveSettings = () => {
    try {
      // Save AI cache TTL in milliseconds
      localStorage.setItem('ai_recommendation_ttl', String(aiCacheTTL * 60 * 1000));

      // Clear existing AI cache to apply new TTL immediately
      localStorage.removeItem('ai_recommendations_cache');

      toast({
        title: "Settings Saved",
        description: "Performance settings have been updated. Refresh the page for changes to take effect.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setAiCacheTTL(5);
    localStorage.removeItem('ai_recommendation_ttl');
    localStorage.removeItem('ai_recommendations_cache');
    
    toast({
      title: "Settings Reset",
      description: "Performance settings have been reset to defaults.",
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Gauge className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Performance Settings</h2>
      </div>
      
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ai-cache-ttl" className="text-base">
              AI Recommendation Cache Duration
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              How long to cache AI strategy recommendations before fetching new ones. Longer duration reduces API calls but may show outdated insights.
            </p>
            <div className="flex items-center gap-4">
              <Slider
                id="ai-cache-ttl"
                min={1}
                max={30}
                step={1}
                value={[aiCacheTTL]}
                onValueChange={(value) => setAiCacheTTL(value[0])}
                className="flex-1"
              />
              <div className="w-20">
                <Input
                  type="number"
                  value={aiCacheTTL}
                  onChange={(e) => setAiCacheTTL(parseInt(e.target.value) || 5)}
                  min={1}
                  max={30}
                  className="text-center"
                />
              </div>
              <span className="text-sm text-muted-foreground w-16">minutes</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex gap-3">
            <Button onClick={handleSaveSettings}>
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Changes will take effect after refreshing the page
          </p>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Current Configuration
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Cache:</span>
              <span className="font-mono">{aiCacheTTL} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Market Data:</span>
              <span className="font-mono">Live WebSocket</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. AI calls/hour:</span>
              <span className="font-mono">~{Math.ceil(60 / aiCacheTTL)}</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <h3 className="font-medium mb-2 text-primary">🚀 WebSocket Performance</h3>
          <p className="text-sm text-muted-foreground">
            Market data now uses real-time WebSocket connections instead of polling, eliminating repeated API calls and providing instant price updates with zero latency.
          </p>
        </div>
      </div>
    </Card>
  );
};
