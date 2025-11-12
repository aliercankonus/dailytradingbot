import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBacktesting } from '@/hooks/useBacktesting';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export const BacktestingModule = () => {
  const { results, runningBacktest, runBacktest } = useBacktesting();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    strategyName: 'Momentum Strategy',
  });

  const handleRunBacktest = async () => {
    try {
      toast({
        title: "Running Backtest",
        description: "This may take a few moments...",
      });

      await runBacktest(formData);

      toast({
        title: "Backtest Complete",
        description: "Results have been generated successfully",
      });
    } catch (error) {
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
        <h3 className="text-lg font-semibold mb-4">Run New Backtest</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              placeholder="BTCUSDT"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="strategy">Strategy Name</Label>
            <Input
              id="strategy"
              value={formData.strategyName}
              onChange={(e) => setFormData({ ...formData, strategyName: e.target.value })}
            />
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
          disabled={runningBacktest}
          className="w-full mt-4"
        >
          {runningBacktest ? 'Running...' : 'Run Backtest'}
        </Button>
      </Card>

      {latestResult && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Net Profit</span>
              </div>
              <div className={`text-2xl font-bold ${latestResult.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${latestResult.net_profit?.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {((latestResult.net_profit / latestResult.initial_capital) * 100).toFixed(2)}% return
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Win Rate</span>
              </div>
              <div className="text-2xl font-bold">{latestResult.win_rate?.toFixed(1)}%</div>
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
                {latestResult.max_drawdown?.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground">Largest decline</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Sharpe Ratio</span>
              </div>
              <div className="text-2xl font-bold">{latestResult.sharpe_ratio?.toFixed(2)}</div>
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
                <div className="text-xl font-bold">{latestResult.profit_factor?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Win</div>
                <div className="text-xl font-bold text-green-500">${latestResult.avg_win?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Loss</div>
                <div className="text-xl font-bold text-red-500">${latestResult.avg_loss?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Largest Win</div>
                <div className="text-xl font-bold text-green-500">${latestResult.largest_win?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Largest Loss</div>
                <div className="text-xl font-bold text-red-500">${latestResult.largest_loss?.toFixed(2)}</div>
              </div>
            </div>
          </Card>

          {latestResult.results_data?.trades && latestResult.results_data.trades.length > 0 && (
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