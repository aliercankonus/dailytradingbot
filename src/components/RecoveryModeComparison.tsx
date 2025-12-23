import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSymbols } from '@/hooks/useSymbols';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Activity, 
  Target, 
  Shield,
  Loader2,
  CheckCircle,
  XCircle,
  BarChart3
} from 'lucide-react';
import { formatPercent, formatPrice } from '@/lib/utils';

interface BacktestResult {
  mode: 'before' | 'after';
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netProfit: number;
  maxDrawdown: number;
  recoveryTrades: number;
  recoveryWins: number;
  recoveryLosses: number;
  recoveryWinRate: number;
  avgRecoveryProfit: number;
  avgRecoveryLoss: number;
  maxConsecutiveLosses: number;
  avgDrawdownDuringLosingStreak: number;
}

interface ComparisonResult {
  before: BacktestResult;
  after: BacktestResult;
  comparison: {
    winRateImprovement: number;
    drawdownImprovement: number;
    profitImprovement: number;
    recoveryWinRateImprovement: number;
    tradeCountDiff: number;
    recoveryTradeCountDiff: number;
  };
}

export const RecoveryModeComparison = () => {
  const { toast } = useToast();
  const { symbols } = useSymbols();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  
  const [formData, setFormData] = useState({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    consecutiveLossThreshold: 3,
  });

  const handleRunComparison = async () => {
    setIsRunning(true);
    setResult(null);
    
    try {
      toast({
        title: 'Running Comparison Backtest',
        description: `Testing ${formData.symbol} with before/after recovery logic...`,
      });
      
      const { data, error } = await supabase.functions.invoke('backtest-recovery-comparison', {
        body: formData,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setResult({
        before: data.before,
        after: data.after,
        comparison: data.comparison,
      });
      
      toast({
        title: 'Comparison Complete',
        description: `Analyzed ${data.before.totalTrades + data.after.totalTrades} total trades`,
      });
    } catch (error) {
      console.error('Comparison error:', error);
      toast({
        title: 'Comparison Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const MetricCard = ({ 
    label, 
    before, 
    after, 
    improvement, 
    format = 'percent',
    higherIsBetter = true 
  }: { 
    label: string; 
    before: number; 
    after: number; 
    improvement: number;
    format?: 'percent' | 'currency' | 'number';
    higherIsBetter?: boolean;
  }) => {
    const isImproved = higherIsBetter ? improvement > 0 : improvement < 0;
    const formatValue = (v: number) => {
      if (format === 'percent') return formatPercent(v, 1);
      if (format === 'currency') return formatPrice(v, 2, '$');
      return v.toFixed(1);
    };
    
    return (
      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-mono">{formatValue(before)}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className={`text-lg font-mono font-semibold ${isImproved ? 'text-success' : 'text-destructive'}`}>
            {formatValue(after)}
          </span>
        </div>
        <div className={`text-xs font-mono ${isImproved ? 'text-success' : 'text-destructive'}`}>
          {isImproved ? '+' : ''}{formatValue(Math.abs(improvement))} {higherIsBetter ? (isImproved ? '↑' : '↓') : (isImproved ? '↓' : '↑')}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">Recovery Mode Comparison</h2>
          <p className="text-sm text-muted-foreground">
            Compare before/after Scenario 6 improvements
          </p>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Configuration</h3>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Select
              value={formData.symbol}
              onValueChange={(value) => setFormData({ ...formData, symbol: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.filter(s => s.is_active).map(s => (
                  <SelectItem key={s.id} value={s.symbol}>{s.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Initial Capital ($)</Label>
            <Input
              type="number"
              value={formData.initialCapital}
              onChange={(e) => setFormData({ ...formData, initialCapital: parseFloat(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label>Consecutive Loss Threshold</Label>
            <Input
              type="number"
              value={formData.consecutiveLossThreshold}
              onChange={(e) => setFormData({ ...formData, consecutiveLossThreshold: parseInt(e.target.value) })}
              min={2}
              max={10}
            />
          </div>
        </div>

        <Button 
          onClick={handleRunComparison} 
          disabled={isRunning}
          className="w-full mt-6"
          size="lg"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Comparison...
            </>
          ) : (
            <>
              <BarChart3 className="mr-2 h-4 w-4" />
              Run Before/After Comparison
            </>
          )}
        </Button>
      </Card>

      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Win Rate Change</span>
              </div>
              <div className={`text-2xl font-bold ${result.comparison.winRateImprovement >= 0 ? 'text-success' : 'text-destructive'}`}>
                {result.comparison.winRateImprovement >= 0 ? '+' : ''}{formatPercent(result.comparison.winRateImprovement, 1)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPercent(result.before.winRate, 1)} → {formatPercent(result.after.winRate, 1)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium">Drawdown Reduction</span>
              </div>
              <div className={`text-2xl font-bold ${result.comparison.drawdownImprovement >= 0 ? 'text-success' : 'text-destructive'}`}>
                {result.comparison.drawdownImprovement >= 0 ? '-' : '+'}{formatPercent(Math.abs(result.comparison.drawdownImprovement), 1)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPercent(result.before.maxDrawdown, 1)} → {formatPercent(result.after.maxDrawdown, 1)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-success" />
                <span className="text-sm font-medium">Profit Change</span>
              </div>
              <div className={`text-2xl font-bold ${result.comparison.profitImprovement >= 0 ? 'text-success' : 'text-destructive'}`}>
                {result.comparison.profitImprovement >= 0 ? '+' : ''}{formatPrice(result.comparison.profitImprovement, 2, '$')}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPrice(result.before.netProfit, 2, '$')} → {formatPrice(result.after.netProfit, 2, '$')}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-warning" />
                <span className="text-sm font-medium">Recovery Win Rate</span>
              </div>
              <div className={`text-2xl font-bold ${result.comparison.recoveryWinRateImprovement >= 0 ? 'text-success' : 'text-destructive'}`}>
                {result.comparison.recoveryWinRateImprovement >= 0 ? '+' : ''}{formatPercent(result.comparison.recoveryWinRateImprovement, 1)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPercent(result.before.recoveryWinRate, 1)} → {formatPercent(result.after.recoveryWinRate, 1)}
              </div>
            </Card>
          </div>

          {/* Detailed Comparison */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Detailed Metrics</h3>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Overall Win Rate"
                before={result.before.winRate}
                after={result.after.winRate}
                improvement={result.comparison.winRateImprovement}
              />
              <MetricCard
                label="Max Drawdown"
                before={result.before.maxDrawdown}
                after={result.after.maxDrawdown}
                improvement={result.comparison.drawdownImprovement}
                higherIsBetter={false}
              />
              <MetricCard
                label="Net Profit"
                before={result.before.netProfit}
                after={result.after.netProfit}
                improvement={result.comparison.profitImprovement}
                format="currency"
              />
              <MetricCard
                label="Recovery Win Rate"
                before={result.before.recoveryWinRate}
                after={result.after.recoveryWinRate}
                improvement={result.comparison.recoveryWinRateImprovement}
              />
              <MetricCard
                label="Total Trades"
                before={result.before.totalTrades}
                after={result.after.totalTrades}
                improvement={result.comparison.tradeCountDiff}
                format="number"
              />
              <MetricCard
                label="Recovery Trades"
                before={result.before.recoveryTrades}
                after={result.after.recoveryTrades}
                improvement={result.comparison.recoveryTradeCountDiff}
                format="number"
              />
            </div>

            <Separator className="my-6" />

            {/* Side by Side Comparison */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Before */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Before</Badge>
                  <span className="text-sm text-muted-foreground">Old Recovery Logic</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Trades</span>
                    <span className="font-mono">{result.before.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Winning Trades</span>
                    <span className="font-mono text-success">{result.before.winningTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Losing Trades</span>
                    <span className="font-mono text-destructive">{result.before.losingTrades}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Trades</span>
                    <span className="font-mono">{result.before.recoveryTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Wins</span>
                    <span className="font-mono text-success">{result.before.recoveryWins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Losses</span>
                    <span className="font-mono text-destructive">{result.before.recoveryLosses}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Consecutive Losses</span>
                    <span className="font-mono">{result.before.maxConsecutiveLosses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Recovery Profit</span>
                    <span className="font-mono text-success">{formatPrice(result.before.avgRecoveryProfit, 2, '$')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Recovery Loss</span>
                    <span className="font-mono text-destructive">{formatPrice(result.before.avgRecoveryLoss, 2, '$')}</span>
                  </div>
                </div>
              </div>

              {/* After */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-success text-success-foreground">After</Badge>
                  <span className="text-sm text-muted-foreground">Scenario 6 Improvements</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Trades</span>
                    <span className="font-mono">{result.after.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Winning Trades</span>
                    <span className="font-mono text-success">{result.after.winningTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Losing Trades</span>
                    <span className="font-mono text-destructive">{result.after.losingTrades}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Trades</span>
                    <span className="font-mono">{result.after.recoveryTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Wins</span>
                    <span className="font-mono text-success">{result.after.recoveryWins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Losses</span>
                    <span className="font-mono text-destructive">{result.after.recoveryLosses}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Consecutive Losses</span>
                    <span className="font-mono">{result.after.maxConsecutiveLosses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Recovery Profit</span>
                    <span className="font-mono text-success">{formatPrice(result.after.avgRecoveryProfit, 2, '$')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Recovery Loss</span>
                    <span className="font-mono text-destructive">{formatPrice(result.after.avgRecoveryLoss, 2, '$')}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Improvements Applied */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Scenario 6 Improvements Applied</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Win-based Recovery Exit</div>
                  <div className="text-xs text-muted-foreground">Exit recovery after 2 consecutive wins</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Conditional Confidence Cap</div>
                  <div className="text-xs text-muted-foreground">80% cap with deep pullback exception</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">HTF Alignment Gate</div>
                  <div className="text-xs text-muted-foreground">Hard requirement for trend continuation</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Pullback Depth Scoring</div>
                  <div className="text-xs text-muted-foreground">Weighted 0-3 point scoring system</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Adaptive ADX Rule</div>
                  <div className="text-xs text-muted-foreground">23 hard minimum, 23-25 soft zone</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">No First Candle Rule</div>
                  <div className="text-xs text-muted-foreground">Block first continuation candle</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Dynamic Position Sizing</div>
                  <div className="text-xs text-muted-foreground">Quality-based size 0.5x-1.0x</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Cooldown After Loss</div>
                  <div className="text-xs text-muted-foreground">10 minute cooldown after recovery loss</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Capped Quality Threshold</div>
                  <div className="text-xs text-muted-foreground">Max 70 to prevent paralysis</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Recovery Trade Counter</div>
                  <div className="text-xs text-muted-foreground">Max 3 recovery trades per day</div>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
