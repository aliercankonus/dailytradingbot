import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2, BarChart3, Shield, Target, Activity } from 'lucide-react';

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netProfit: number;
  maxConsecutiveLosses: number;
  maxDrawdownPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  recoveryTradesCount: number;
  recoveryWinRate: number;
  avgQuality: number;
  avgPositionSize: number;
}

interface ComparisonResult {
  baseline: BacktestResult;
  improved: BacktestResult;
  improvements: {
    winRateDelta: number;
    maxConsecutiveLossesDelta: number;
    maxDrawdownDelta: number;
    profitFactorDelta: number;
    recoveryWinRateDelta: number;
    avgQualityDelta: number;
    netProfitDelta: number;
  };
  settings: {
    symbol: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
  };
  phaseImprovements: {
    preRecoveryBlocks: number;
    drawdownScalingReductions: number;
    regimeGateBlocks: number;
    lossClusteringCooldowns: number;
    graduatedQualityReductions: number;
    recoveryExits: number;
  };
}

export function PhaseComparisonBacktest() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [formData, setFormData] = useState({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
  });
  const { toast } = useToast();

  const handleRunComparison = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('backtest-phase-comparison', {
        body: formData,
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: 'Backtest Complete',
        description: `Compared ${data.baseline.totalTrades} baseline trades vs ${data.improved.totalTrades} improved trades`,
      });
    } catch (error) {
      console.error('Backtest error:', error);
      toast({
        title: 'Backtest Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const MetricCard = ({ 
    title, 
    baseline, 
    improved, 
    delta, 
    format = 'number',
    higherIsBetter = true 
  }: { 
    title: string;
    baseline: number;
    improved: number;
    delta: number;
    format?: 'number' | 'percent' | 'currency';
    higherIsBetter?: boolean;
  }) => {
    const isPositive = higherIsBetter ? delta > 0 : delta < 0;
    const formatValue = (v: number) => {
      if (format === 'percent') return `${v.toFixed(1)}%`;
      if (format === 'currency') return `$${v.toFixed(2)}`;
      return v.toFixed(2);
    };

    return (
      <div className="p-4 rounded-lg border bg-card">
        <div className="text-sm text-muted-foreground mb-2">{title}</div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Baseline</div>
            <div className="text-lg font-medium">{formatValue(baseline)}</div>
          </div>
          <div className={`flex items-center ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            <span className="font-medium">{format === 'percent' ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp` : formatValue(Math.abs(delta))}</span>
          </div>
          <div className="space-y-1 text-right">
            <div className="text-xs text-muted-foreground">Improved</div>
            <div className={`text-lg font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>{formatValue(improved)}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Phase 1-8 Backtest Comparison
          </CardTitle>
          <CardDescription>
            Compare trading performance with and without the 9 Findings improvements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <Label>Symbol</Label>
              <Input
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                placeholder="BTCUSDT"
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Initial Capital</Label>
              <Input
                type="number"
                value={formData.initialCapital}
                onChange={(e) => setFormData({ ...formData, initialCapital: Number(e.target.value) })}
              />
            </div>
          </div>

          <Button onClick={handleRunComparison} disabled={isRunning} className="w-full">
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Backtest Comparison...
              </>
            ) : (
              <>
                <Target className="mr-2 h-4 w-4" />
                Run Phase 1-8 Comparison
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className={result.improvements.winRateDelta > 0 ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Win Rate Change</div>
                    <div className={`text-2xl font-bold ${result.improvements.winRateDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {result.improvements.winRateDelta > 0 ? '+' : ''}{result.improvements.winRateDelta.toFixed(1)}%
                    </div>
                  </div>
                  {result.improvements.winRateDelta > 0 ? <TrendingUp className="h-8 w-8 text-green-500" /> : <TrendingDown className="h-8 w-8 text-red-500" />}
                </div>
              </CardContent>
            </Card>

            <Card className={result.improvements.maxConsecutiveLossesDelta > 0 ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Max Consec. Losses</div>
                    <div className={`text-2xl font-bold ${result.improvements.maxConsecutiveLossesDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {result.improvements.maxConsecutiveLossesDelta > 0 ? '-' : '+'}{Math.abs(result.improvements.maxConsecutiveLossesDelta)}
                    </div>
                  </div>
                  <Shield className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={result.improvements.maxDrawdownDelta > 0 ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Max Drawdown</div>
                    <div className={`text-2xl font-bold ${result.improvements.maxDrawdownDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {result.improvements.maxDrawdownDelta > 0 ? '-' : '+'}{Math.abs(result.improvements.maxDrawdownDelta).toFixed(1)}%
                    </div>
                  </div>
                  <Activity className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={result.improvements.netProfitDelta > 0 ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Net Profit Change</div>
                    <div className={`text-2xl font-bold ${result.improvements.netProfitDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {result.improvements.netProfitDelta > 0 ? '+' : ''}${result.improvements.netProfitDelta.toFixed(2)}
                    </div>
                  </div>
                  <BarChart3 className="h-8 w-8 text-amber-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Metrics Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <MetricCard
                title="Win Rate"
                baseline={result.baseline.winRate}
                improved={result.improved.winRate}
                delta={result.improvements.winRateDelta}
                format="percent"
              />
              <MetricCard
                title="Max Consecutive Losses"
                baseline={result.baseline.maxConsecutiveLosses}
                improved={result.improved.maxConsecutiveLosses}
                delta={result.improvements.maxConsecutiveLossesDelta}
                higherIsBetter={false}
              />
              <MetricCard
                title="Max Drawdown"
                baseline={result.baseline.maxDrawdownPercent}
                improved={result.improved.maxDrawdownPercent}
                delta={result.improvements.maxDrawdownDelta}
                format="percent"
                higherIsBetter={false}
              />
              <MetricCard
                title="Profit Factor"
                baseline={result.baseline.profitFactor}
                improved={result.improved.profitFactor}
                delta={result.improvements.profitFactorDelta}
              />
              <MetricCard
                title="Recovery Win Rate"
                baseline={result.baseline.recoveryWinRate}
                improved={result.improved.recoveryWinRate}
                delta={result.improvements.recoveryWinRateDelta}
                format="percent"
              />
              <MetricCard
                title="Average Quality Score"
                baseline={result.baseline.avgQuality}
                improved={result.improved.avgQuality}
                delta={result.improvements.avgQualityDelta}
              />
            </CardContent>
          </Card>

          {/* Phase Improvement Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Phase 1-8 Improvement Activity</CardTitle>
              <CardDescription>How often each phase improvement was triggered</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Pre-Recovery Blocks</span>
                    <Badge variant="secondary">{result.phaseImprovements.preRecoveryBlocks}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 3: Entries blocked in pre-recovery state
                  </div>
                </div>

                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Drawdown Scaling</span>
                    <Badge variant="secondary">{result.phaseImprovements.drawdownScalingReductions}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 4: Position size reductions applied
                  </div>
                </div>

                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Regime Gate Blocks</span>
                    <Badge variant="secondary">{result.phaseImprovements.regimeGateBlocks}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 2: Low regime score rejections
                  </div>
                </div>

                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Loss Clustering Cooldowns</span>
                    <Badge variant="secondary">{result.phaseImprovements.lossClusteringCooldowns}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 6: Entries blocked during cooldown
                  </div>
                </div>

                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Graduated Quality Reductions</span>
                    <Badge variant="secondary">{result.phaseImprovements.graduatedQualityReductions}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 7: Position size adjusted by quality tier
                  </div>
                </div>

                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Recovery Exits</span>
                    <Badge variant="secondary">{result.phaseImprovements.recoveryExits}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Phase 8: Early recovery mode exits triggered
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade Statistics */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline">Baseline</Badge>
                  Trade Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between"><span>Total Trades</span><span>{result.baseline.totalTrades}</span></div>
                <div className="flex justify-between"><span>Winning</span><span className="text-green-500">{result.baseline.winningTrades}</span></div>
                <div className="flex justify-between"><span>Losing</span><span className="text-red-500">{result.baseline.losingTrades}</span></div>
                <div className="flex justify-between"><span>Avg Win</span><span className="text-green-500">{result.baseline.avgWin.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>Avg Loss</span><span className="text-red-500">{result.baseline.avgLoss.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>Sharpe Ratio</span><span>{result.baseline.sharpeRatio.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Recovery Trades</span><span>{result.baseline.recoveryTradesCount}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge className="bg-green-500">Improved</Badge>
                  Trade Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between"><span>Total Trades</span><span>{result.improved.totalTrades}</span></div>
                <div className="flex justify-between"><span>Winning</span><span className="text-green-500">{result.improved.winningTrades}</span></div>
                <div className="flex justify-between"><span>Losing</span><span className="text-red-500">{result.improved.losingTrades}</span></div>
                <div className="flex justify-between"><span>Avg Win</span><span className="text-green-500">{result.improved.avgWin.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>Avg Loss</span><span className="text-red-500">{result.improved.avgLoss.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>Sharpe Ratio</span><span>{result.improved.sharpeRatio.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Recovery Trades</span><span>{result.improved.recoveryTradesCount}</span></div>
                <div className="flex justify-between"><span>Avg Position Size</span><span>{(result.improved.avgPositionSize * 100).toFixed(0)}%</span></div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
