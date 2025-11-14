import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useStrategyRotation } from '@/hooks/useStrategyRotation';
import { Loader2, RefreshCw, History, TrendingUp, Clock, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react';
import { RotationPerformanceCharts } from './RotationPerformanceCharts';

export const StrategyRotationConfig = () => {
  const { config, history, loading, updateConfig, triggerRotation } = useStrategyRotation();
  const [nextRunTime, setNextRunTime] = useState<string>(''); // next hourly check
  const [earliestRotationTime, setEarliestRotationTime] = useState<string>(''); // earliest hour when rotation can occur

  useEffect(() => {
    const roundUpToNext5Min = (date: Date) => {
      const d = new Date(date);
      const minutes = d.getMinutes();
      const roundedMinutes = Math.ceil((minutes + 1) / 5) * 5;
      d.setMinutes(roundedMinutes, 0, 0);
      return d;
    };

    const calculateNextRun = () => {
      const now = new Date();
      const nextCheck = roundUpToNext5Min(now);

      if (!config || !config.enabled) {
        setNextRunTime(nextCheck.toLocaleString());
        setEarliestRotationTime('');
        return;
      }

      // If no history, rotation can happen at next check
      if (history.length === 0) {
        setNextRunTime(nextCheck.toLocaleString());
        setEarliestRotationTime(nextCheck.toLocaleString());
        return;
      }

      // Calculate when rotation becomes eligible based on interval
      const lastRotation = new Date(history[0].rotated_at);
      const intervalMs = config.rotation_interval_minutes * 60 * 1000;
      const eligibleAt = new Date(lastRotation.getTime() + intervalMs);

      const firstCheckWhenEligible = roundUpToNext5Min(eligibleAt > now ? eligibleAt : now);

      setNextRunTime(nextCheck.toLocaleString());
      setEarliestRotationTime(firstCheckWhenEligible.toLocaleString());
    };

    calculateNextRun();
    const interval = setInterval(calculateNextRun, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [config, history]);

  if (loading || !config) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Automated Strategy Rotation
              </CardTitle>
              <CardDescription>
                Automatically switch strategies based on market conditions and performance
              </CardDescription>
            </div>
            <Button onClick={triggerRotation} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cron Job Status */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">Automated Schedule</h3>
                  <p className="text-sm text-muted-foreground">
                    Checks every 5 minutes • Rotates when criteria met
                  </p>
                </div>
              </div>
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? "Active" : "Paused"}
              </Badge>
            </div>
            
            {config.enabled && (
              <div className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Next check: </span>
                  <span className="font-medium text-foreground">{nextRunTime}</span>
                </div>
                {earliestRotationTime && (
                  <div>
                    <span className="text-muted-foreground">Earliest rotation window: </span>
                    <span className="font-medium text-foreground">{earliestRotationTime}</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                variant={config.enabled ? "outline" : "default"}
                size="sm"
                onClick={() => updateConfig({ enabled: !config.enabled })}
                className="gap-2"
              >
                {config.enabled ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Rotation Interval */}
          <div className="space-y-2">
            <Label htmlFor="rotation-interval">
              Minimum Rotation Interval (minutes): {config.rotation_interval_minutes}
            </Label>
            <Input
              id="rotation-interval"
              type="number"
              min="15"
              max="1440"
              value={config.rotation_interval_minutes}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { updateConfig({ rotation_interval_minutes: Math.max(1, v) }); } }}
            />
          </div>

          {/* Performance Threshold */}
          <div className="space-y-2">
            <Label htmlFor="performance-threshold">
              Performance Threshold (%): {config.performance_threshold_percent}
            </Label>
            <Input
              id="performance-threshold"
              type="number"
              min="1"
              max="50"
              step="0.5"
              value={config.performance_threshold_percent}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { updateConfig({ performance_threshold_percent: v }); } }}
            />
            <div className="text-sm text-muted-foreground">
              Minimum time between strategy rotations
            </div>
          </div>

          {/* Min Trades Required */}
          <div className="space-y-2">
            <Label htmlFor="min-trades">
              Minimum Trades Required: {config.min_trades_required}
            </Label>
            <Input
              id="min-trades"
              type="number"
              min="5"
              max="100"
              value={config.min_trades_required}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { updateConfig({ min_trades_required: Math.max(1, v) }); } }}
            />
            <div className="text-sm text-muted-foreground">
              Strategies need this many trades before being eligible
            </div>
          </div>

          {/* Weights */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Market Condition Weight: {(config.market_condition_weight * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[config.market_condition_weight * 100]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) => updateConfig({ market_condition_weight: value / 100 })}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Performance Weight: {(config.performance_weight * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[config.performance_weight * 100]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) => updateConfig({ performance_weight: value / 100 })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Comparison Charts */}
      {history.length > 0 && <RotationPerformanceCharts history={history} />}

      {/* Rotation History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Rotation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No rotation history yet
            </p>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.from_strategy_name}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge>{entry.to_strategy_name}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.reason}</p>
                    {entry.market_condition && (
                      <div className="text-xs text-muted-foreground">
                        Market: {entry.market_condition.trend} | Volatility: {entry.market_condition.volatility?.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {formatDistanceToNow(new Date(entry.rotated_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
