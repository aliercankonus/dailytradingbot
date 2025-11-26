import { Card } from '@/components/ui/card';
import { useTrades } from '@/hooks/useTrades';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

export const PerformanceAnalytics = () => {
  const { trades } = useTrades();

  // Calculate equity curve
  const equityCurve = trades
    .filter(t => t.closed_at)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())
    .reduce((acc, trade, index) => {
      const prevEquity = index > 0 ? acc[index - 1].equity : 10000;
      acc.push({
        trade: index + 1,
        equity: prevEquity + (trade.realized_pnl || 0),
        date: new Date(trade.closed_at!).toLocaleDateString(),
      });
      return acc;
    }, [] as any[]);

  // Win/Loss ratio over time
  const winLossData = trades
    .filter(t => t.closed_at)
    .reduce((acc, trade) => {
      const month = new Date(trade.closed_at!).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const existing = acc.find(d => d.month === month);
      
      if (existing) {
        if ((trade.realized_pnl || 0) > 0) {
          existing.wins += 1;
        } else {
          existing.losses += 1;
        }
      } else {
        acc.push({
          month,
          wins: (trade.realized_pnl || 0) > 0 ? 1 : 0,
          losses: (trade.realized_pnl || 0) <= 0 ? 1 : 0,
        });
      }
      return acc;
    }, [] as any[]);

  // Strategy comparison
  const strategyData = trades
    .filter(t => t.closed_at)
    .reduce((acc, trade) => {
      const strategy = 'Default Strategy'; // You can add strategy field to trades table
      const existing = acc.find(d => d.strategy === strategy);
      
      if (existing) {
        existing.totalPnL += trade.realized_pnl || 0;
        existing.trades += 1;
        if ((trade.realized_pnl || 0) > 0) existing.wins += 1;
      } else {
        acc.push({
          strategy,
          totalPnL: trade.realized_pnl || 0,
          trades: 1,
          wins: (trade.realized_pnl || 0) > 0 ? 1 : 0,
        });
      }
      return acc;
    }, [] as any[]);

  strategyData.forEach(s => {
    s.winRate = s.trades > 0 ? (s.wins / s.trades) * 100 : 0;
  });

  const totalPnL = trades
    .filter(t => t.closed_at)
    .reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  
  const winningTrades = trades.filter(t => t.closed_at && (t.realized_pnl || 0) > 0).length;
  const losingTrades = trades.filter(t => t.closed_at && (t.realized_pnl || 0) <= 0).length;
  const totalClosedTrades = winningTrades + losingTrades;
  const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;

  const pieData = [
    { name: 'Wins', value: winningTrades, color: '#10b981' },
    { name: 'Losses', value: losingTrades, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Performance Analytics</h2>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Total P&L</span>
          </div>
          <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
            ${totalPnL.toFixed(2)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Win Rate</span>
          </div>
          <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">
            {winningTrades}/{totalClosedTrades} trades
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Total Trades</span>
          </div>
          <div className="text-2xl font-bold">{totalClosedTrades}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Avg Win/Loss</span>
          </div>
          <div className="text-2xl font-bold">
            ${winningTrades > 0 ? (trades.filter(t => (t.realized_pnl || 0) > 0).reduce((s, t) => s + (t.realized_pnl || 0), 0) / winningTrades).toFixed(2) : '0.00'}
          </div>
        </Card>
      </div>

      {/* Equity Curve */}
      {equityCurve.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={equityCurve}>
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

      {/* Win/Loss Over Time */}
      {winLossData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Win/Loss Ratio Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={winLossData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="wins" fill="#10b981" />
              <Bar dataKey="losses" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pie Chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Win/Loss Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Strategy Comparison */}
        {strategyData.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Strategy Performance</h3>
            <div className="space-y-4">
              {strategyData.map((strategy, idx) => (
                <div key={idx} className="border-b pb-3">
                  <div className="font-medium mb-2">{strategy.strategy}</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground">P&L</div>
                      <div className={strategy.totalPnL >= 0 ? 'text-profit' : 'text-loss'}>
                        ${strategy.totalPnL.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Trades</div>
                      <div>{strategy.trades}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Win Rate</div>
                      <div>{strategy.winRate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {trades.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No trade data available yet. Execute some trades to see analytics.</p>
        </Card>
      )}
    </div>
  );
};
