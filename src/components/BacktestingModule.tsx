import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBacktesting } from '@/hooks/useBacktesting';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, Area } from 'recharts';
import { TrendingUp, TrendingDown, Target, Activity, Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { useSymbols } from '@/hooks/useSymbols';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { formatPrice, formatPercent } from '@/lib/utils';

interface BacktestingModuleProps {
  strategies: Array<{ id: string; name: string }>;
}

export const BacktestingModule = ({ strategies }: BacktestingModuleProps) => {
  const { results, runningBacktest, runBacktest, progress } = useBacktesting();
  const { toast } = useToast();
  const { activeSymbols, symbols } = useSymbols();

  const [formData, setFormData] = useState({
    strategyId: strategies[0]?.id || '',
    symbol: '',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
  });

  // Set default symbol when activeSymbols loads
  useEffect(() => {
    if (activeSymbols.length > 0 && !formData.symbol) {
      setFormData(prev => ({ ...prev, symbol: activeSymbols[0] }));
    }
  }, [activeSymbols]);

  const [selectedStrategyConfig, setSelectedStrategyConfig] = useState<any>(null);

  useEffect(() => {
    if (formData.strategyId) {
      // Find the strategy in the passed strategies prop (built-in only now)
      const builtIn = strategies.find(s => s.id === formData.strategyId);
      if (builtIn) {
        const name = builtIn.name.toLowerCase();
        if (name.includes('mean reversion')) {
          setSelectedStrategyConfig({
            name: builtIn.name,
            isBuiltIn: true,
            indicators: [
              { type: 'price', name: 'price' },
              { type: 'bb_lower', name: 'bb_lower', period: 20 },
              { type: 'bb_middle', name: 'bb_middle', period: 20 },
              { type: 'rsi', name: 'rsi', period: 14 },
            ],
            entry_conditions: [
              { indicator: 'price', operator: '<', targetIndicator: 'bb_lower' },
              { indicator: 'rsi', operator: '<', value: 30 },
            ],
            exit_conditions: [
              { indicator: 'price', operator: '>=', targetIndicator: 'bb_middle' },
            ],
            risk_settings: { stopLossPercent: 2, takeProfitPercent: 4 },
          });
        } else if (name.includes('momentum')) {
          setSelectedStrategyConfig({
            name: builtIn.name,
            isBuiltIn: true,
            indicators: [
              { type: 'macd', name: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
              { type: 'macd_signal', name: 'macd_signal', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
            ],
            entry_conditions: [
              { indicator: 'macd', operator: '>', targetIndicator: 'macd_signal' },
            ],
            exit_conditions: [
              { indicator: 'macd', operator: '<', targetIndicator: 'macd_signal' },
            ],
            risk_settings: { stopLossPercent: 3, takeProfitPercent: 6 },
          });
        } else if (name.includes('grid')) {
          setSelectedStrategyConfig({
            name: builtIn.name,
            isBuiltIn: true,
            indicators: [
              { type: 'price', name: 'price' },
              { type: 'bb_lower', name: 'bb_lower', period: 20 },
              { type: 'bb_upper', name: 'bb_upper', period: 20 },
            ],
            entry_conditions: [
              { indicator: 'price', operator: '<=', targetIndicator: 'bb_lower' },
            ],
            exit_conditions: [
              { indicator: 'price', operator: '>=', targetIndicator: 'bb_upper' },
            ],
            risk_settings: { stopLossPercent: 1.5, takeProfitPercent: 1.5 },
          });
        }
      }
    }
  }, [formData.strategyId, strategies]);

  const handleRunBacktest = async () => {
    if (!formData.strategyId) {
      toast({
        title: "Strategy Required",
        description: "Please select a strategy to backtest",
        variant: "destructive",
      });
      return;
    }

    if (!formData.symbol) {
      toast({
        title: "Symbol Required",
        description: "Please select a trading symbol",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Running Backtest",
        description: `Testing ${formData.symbol} with selected strategy...`,
      });

      const result = await runBacktest(formData);
      console.log('Backtest completed with result:', result);

      toast({
        title: "Backtest Complete",
        description: `Analyzed ${result?.results?.total_trades || 0} trades`,
      });
    } catch (error) {
      console.error('Backtest error:', error);
      toast({
        title: "Backtest Failed",
        description: error instanceof Error ? error.message : 'Failed to run backtest',
        variant: "destructive",
      });
    }
  };

  const latestResult = results[0];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Backtesting</h2>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Run Historical Backtest</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="strategy">Strategy</Label>
            <Select
              value={formData.strategyId}
              onValueChange={(value) => setFormData({ ...formData, strategyId: value })}
            >
              <SelectTrigger id="strategy">
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Select
              value={formData.symbol}
              onValueChange={(value) => setFormData({ ...formData, symbol: value })}
            >
              <SelectTrigger id="symbol">
                <SelectValue placeholder="Select symbol" />
              </SelectTrigger>
              <SelectContent>
                {symbols.filter(s => s.is_active).map(s => (
                  <SelectItem key={s.id} value={s.symbol}>{s.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capital">Initial Capital ($)</Label>
            <Input
              id="capital"
              type="number"
              value={formData.initialCapital}
              onChange={(e) => setFormData({ ...formData, initialCapital: parseFloat(e.target.value) })}
            />
          </div>
        </div>

        <Button 
          onClick={handleRunBacktest} 
          disabled={runningBacktest || !formData.strategyId}
          className="w-full mt-4"
        >
          {runningBacktest ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Backtest...
            </>
          ) : 'Run Historical Backtest'}
        </Button>

        {runningBacktest && progress.status !== 'idle' && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {progress.status === 'fetching' && 'Fetching market data...'}
                  {progress.status === 'processing' && 'Processing candles...'}
                  {progress.status === 'analyzing' && 'Analyzing trades...'}
                  {progress.status === 'complete' && 'Complete!'}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                Batch {progress.currentBatch}/{progress.totalBatches}
              </span>
            </div>
            <Progress 
              value={progress.totalCandles > 0 
                ? (progress.processedCandles / progress.totalCandles) * 100 
                : 0
              } 
              className="h-2"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.processedCandles.toLocaleString()} / {progress.totalCandles.toLocaleString()} candles</span>
              {progress.estimatedTimeRemaining !== null && progress.estimatedTimeRemaining > 0 && (
                <span>~{Math.ceil(progress.estimatedTimeRemaining / 1000)}s remaining</span>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2 text-center">
          Tests your strategy against past market data to see how it would have performed
        </p>
      </Card>

      {selectedStrategyConfig && (
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-1">Strategy Configuration Preview</h3>
              <p className="text-sm text-muted-foreground">
                {selectedStrategyConfig.isBuiltIn 
                  ? 'Built-in strategy using default configuration' 
                  : selectedStrategyConfig.description || 'Custom strategy configuration'}
              </p>
            </div>
            {selectedStrategyConfig.isBuiltIn && (
              <Badge variant="secondary">Built-in</Badge>
            )}
          </div>

          <div className="space-y-4">
            {/* Indicators */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Technical Indicators</h4>
              <div className="flex flex-wrap gap-2">
                {(selectedStrategyConfig.indicators || []).map((indicator: any, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {indicator.type.toUpperCase()}
                    {indicator.period && ` (${indicator.period})`}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Entry Conditions */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-success">Entry Conditions</h4>
              <div className="space-y-1 text-sm">
                {(selectedStrategyConfig.entry_conditions || []).map((condition: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="font-mono">{condition.indicator}</span>
                    <span>{condition.operator}</span>
                    {condition.targetIndicator ? (
                      <span className="font-mono">{condition.targetIndicator}</span>
                    ) : (
                      <span className="font-mono">{condition.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Exit Conditions */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-danger">Exit Conditions</h4>
              <div className="space-y-1 text-sm">
                {(selectedStrategyConfig.exit_conditions || []).map((condition: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-danger" />
                    <span className="font-mono">{condition.indicator}</span>
                    <span>{condition.operator}</span>
                    {condition.targetIndicator ? (
                      <span className="font-mono">{condition.targetIndicator}</span>
                    ) : (
                      <span className="font-mono">{condition.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Risk Management */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Risk Management</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Stop Loss:</span>
                  <span className="ml-2 font-mono font-semibold text-danger">
                    {selectedStrategyConfig.risk_settings?.stopLossPercent || 
                     selectedStrategyConfig.risk_management?.stopLossPercent || 2}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Take Profit:</span>
                  <span className="ml-2 font-mono font-semibold text-success">
                    {selectedStrategyConfig.risk_settings?.takeProfitPercent || 
                     selectedStrategyConfig.risk_management?.takeProfitPercent || 4}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {latestResult && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Net Profit</span>
              </div>
              <div className={`text-2xl font-bold ${latestResult.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPrice(latestResult.net_profit, 2, '$')}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPercent((latestResult.net_profit / latestResult.initial_capital) * 100)} return
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Win Rate</span>
              </div>
              <div className="text-2xl font-bold">{formatPercent(latestResult.win_rate, 1)}</div>
              <div className="text-xs text-muted-foreground">
                {latestResult.winning_trades}/{latestResult.total_trades} trades
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium">Max Drawdown</span>
              </div>
              <div className="text-2xl font-bold text-red-500">
                {formatPercent(latestResult.max_drawdown)}
              </div>
              <div className="text-xs text-muted-foreground">Largest decline</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Sharpe Ratio</span>
              </div>
              <div className="text-2xl font-bold">{latestResult.sharpe_ratio?.toFixed(2) ?? 'N/A'}</div>
              <div className="text-xs text-muted-foreground">Risk-adjusted return</div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-xl font-bold">{latestResult.total_trades}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Profit Factor</div>
                <div className="text-xl font-bold">{latestResult.profit_factor?.toFixed(2) ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Win</div>
                <div className="text-xl font-bold text-green-500">{formatPrice(latestResult.avg_win, 2, '$')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Loss</div>
                <div className="text-xl font-bold text-red-500">{formatPrice(latestResult.avg_loss, 2, '$')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Largest Win</div>
                <div className="text-xl font-bold text-green-500">{formatPrice(latestResult.largest_win, 2, '$')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Largest Loss</div>
                <div className="text-xl font-bold text-red-500">{formatPrice(latestResult.largest_loss, 2, '$')}</div>
              </div>
            </div>
          </Card>

          {latestResult.results_data?.trades && latestResult.results_data.trades.length > 0 && (
            <>
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={latestResult.results_data.trades.map((trade: any, index: number) => ({
                      trade: index + 1,
                      equity: latestResult.initial_capital + 
                        latestResult.results_data.trades
                          .slice(0, index + 1)
                          .reduce((sum: number, t: any) => sum + t.profit, 0),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="trade" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {latestResult.results_data?.volumeData && latestResult.results_data.volumeData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Price & Volume Analysis</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart
                      data={latestResult.results_data.volumeData.map((data: any, index: number) => ({
                        time: new Date(data.timestamp).toLocaleDateString(),
                        price: data.price,
                        volume: data.volume,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--primary))" />
                      <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Legend />
                      <Area 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="volume" 
                        fill="hsl(var(--muted))" 
                        stroke="hsl(var(--muted-foreground))" 
                        fillOpacity={0.3}
                        name="Volume"
                      />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="price" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                        name="Price"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {results.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No backtest results yet. Run your first backtest above.</p>
        </Card>
      )}
    </div>
  );
};