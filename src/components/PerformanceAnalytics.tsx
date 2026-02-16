import { Card } from '@/components/ui/card';
import { useTrades } from '@/hooks/useTrades';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Target, Activity, Zap, ArrowLeftRight, TrendingUp as TrendIcon, Layers } from 'lucide-react';

// Strategy type detection function (synced with backend)
const detectStrategyType = (strategyId: string, strategyName: string): 'MOMENTUM' | 'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'GRID_RANGE' | 'NEUTRAL_BREAKOUT' => {
  const name = (strategyName || '').toUpperCase();
  const id = (strategyId || '').toUpperCase();
  
  const momentumKeywords = ['MOMENTUM', 'RSI_REVERSAL', 'BREAKOUT', 'MACD_CROSS', 'ADX_TREND'];
  const meanReversionKeywords = ['MEAN_REVERSION', 'BOLLINGER', 'OVERSOLD', 'OVERBOUGHT', 'RSI_EXTREME', 'STOCH'];
  const trendKeywords = ['TREND', 'EMA_CROSS', 'MOVING_AVERAGE', 'ICHIMOKU', 'SUPERTREND'];
  const gridKeywords = ['GRID', 'RANGE', 'SCALP', 'CHANNEL'];
  
  for (const keyword of momentumKeywords) {
    if (name.includes(keyword) || id.includes(keyword)) return 'MOMENTUM';
  }
  for (const keyword of meanReversionKeywords) {
    if (name.includes(keyword) || id.includes(keyword)) return 'MEAN_REVERSION';
  }
  for (const keyword of trendKeywords) {
    if (name.includes(keyword) || id.includes(keyword)) return 'TREND_FOLLOWING';
  }
  for (const keyword of gridKeywords) {
    if (name.includes(keyword) || id.includes(keyword)) return 'GRID_RANGE';
  }
  
  return 'NEUTRAL_BREAKOUT';
};

const getStrategyTypeLabel = (type: string): string => {
  switch (type) {
    case 'MOMENTUM': return 'Momentum';
    case 'MEAN_REVERSION': return 'Mean Reversion';
    case 'TREND_FOLLOWING': return 'Trend Following';
    case 'GRID_RANGE': return 'Grid/Range';
    case 'NEUTRAL_BREAKOUT': return 'Other';
    default: return 'Other';
  }
};

const getStrategyTypeColor = (type: string): string => {
  switch (type) {
    case 'MOMENTUM': return 'hsl(280, 70%, 50%)'; // Purple
    case 'MEAN_REVERSION': return 'hsl(200, 70%, 50%)'; // Blue
    case 'TREND_FOLLOWING': return 'hsl(140, 70%, 40%)'; // Green
    case 'GRID_RANGE': return 'hsl(35, 80%, 50%)'; // Orange
    case 'NEUTRAL_BREAKOUT': return 'hsl(220, 10%, 50%)'; // Gray
    default: return 'hsl(220, 10%, 50%)';
  }
};

export const PerformanceAnalytics = () => {
  const { trades } = useTrades();

  // Calculate equity curve and cumulative P&L
  const equityCurve = trades
    .filter(t => t.closed_at)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())
    .reduce((acc, trade, index) => {
      const prevEquity = index > 0 ? acc[index - 1].equity : 10000;
      const prevPnL = index > 0 ? acc[index - 1].cumulativePnL : 0;
      acc.push({
        trade: index + 1,
        equity: prevEquity + (trade.realized_pnl || 0),
        cumulativePnL: prevPnL + (trade.realized_pnl || 0),
        date: new Date(trade.closed_at!).toLocaleDateString(),
      });
      return acc;
    }, [] as any[]);

  // Win/Loss ratio over time (excluding breakeven)
  const winLossData = trades
    .filter(t => t.closed_at)
    .reduce((acc, trade) => {
      const month = new Date(trade.closed_at!).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const existing = acc.find(d => d.month === month);
      const pnl = trade.realized_pnl || 0;
      
      if (existing) {
        if (pnl > 0) {
          existing.wins += 1;
        } else if (pnl < 0) {
          existing.losses += 1;
        } else {
          existing.breakeven += 1;
        }
      } else {
        acc.push({
          month,
          wins: pnl > 0 ? 1 : 0,
          losses: pnl < 0 ? 1 : 0,
          breakeven: pnl === 0 ? 1 : 0,
        });
      }
      return acc;
    }, [] as any[]);

  // Strategy Type Breakdown (with proper breakeven handling)
  const strategyTypeData = trades
    .filter(t => t.closed_at)
    .reduce((acc, trade) => {
      const strategyType = detectStrategyType('', trade.strategy_name || '');
      const existing = acc.find(d => d.type === strategyType);
      const pnl = trade.realized_pnl || 0;
      
      if (existing) {
        existing.totalPnL += pnl;
        existing.trades += 1;
        if (pnl > 0) existing.wins += 1;
        else if (pnl < 0) existing.losses += 1;
      } else {
        acc.push({
          type: strategyType,
          label: getStrategyTypeLabel(strategyType),
          color: getStrategyTypeColor(strategyType),
          totalPnL: pnl,
          trades: 1,
          wins: pnl > 0 ? 1 : 0,
          losses: pnl < 0 ? 1 : 0,
        });
      }
      return acc;
    }, [] as any[]);

  // Win rate excludes breakeven trades
  strategyTypeData.forEach(s => {
    const decisiveTrades = s.wins + s.losses;
    s.winRate = decisiveTrades > 0 ? (s.wins / decisiveTrades) * 100 : 0;
    s.avgPnL = s.trades > 0 ? s.totalPnL / s.trades : 0;
  });

  // Sort by total trades descending
  strategyTypeData.sort((a, b) => b.trades - a.trades);

  // Strategy comparison (individual strategies with proper breakeven handling)
  const strategyData = trades
    .filter(t => t.closed_at)
    .reduce((acc, trade) => {
      const strategy = trade.strategy_name || 'Default Strategy';
      const existing = acc.find(d => d.strategy === strategy);
      const pnl = trade.realized_pnl || 0;
      
      if (existing) {
        existing.totalPnL += pnl;
        existing.trades += 1;
        if (pnl > 0) existing.wins += 1;
        else if (pnl < 0) existing.losses += 1;
      } else {
        acc.push({
          strategy,
          totalPnL: pnl,
          trades: 1,
          wins: pnl > 0 ? 1 : 0,
          losses: pnl < 0 ? 1 : 0,
        });
      }
      return acc;
    }, [] as any[]);

  // Win rate excludes breakeven trades
  strategyData.forEach(s => {
    const decisiveTrades = s.wins + s.losses;
    s.winRate = decisiveTrades > 0 ? (s.wins / decisiveTrades) * 100 : 0;
  });

  const totalPnL = trades
    .filter(t => t.closed_at)
    .reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  
  // Include ALL closed trades (including partial closes) in win rate calculation
  // Exclude only breakeven trades (PnL = 0)
  const winningTrades = trades.filter(t => t.closed_at && (t.realized_pnl || 0) > 0).length;
  const losingTrades = trades.filter(t => t.closed_at && (t.realized_pnl || 0) < 0).length;
  const breakEvenTrades = trades.filter(t => t.closed_at && (t.realized_pnl || 0) === 0).length;
  const decisiveTrades = winningTrades + losingTrades;
  const totalClosedTrades = winningTrades + losingTrades + breakEvenTrades;
  const winRate = decisiveTrades > 0 ? (winningTrades / decisiveTrades) * 100 : 0;

  const pieData = [
    { name: 'Wins', value: winningTrades, color: '#10b981' },
    { name: 'Losses', value: losingTrades, color: '#ef4444' },
    { name: 'Breakeven', value: breakEvenTrades, color: '#6b7280' },
  ];

  const strategyTypePieData = strategyTypeData.map(s => ({
    name: s.label,
    value: s.trades,
    color: s.color,
  }));

  return (
    <div className="space-y-4">

      {/* Equity Curve */}
      {equityCurve.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="trade" stroke="hsl(var(--muted-foreground))" />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                domain={[(dataMin: number) => {
                  const padding = Math.max(Math.abs(dataMin - 10000) * 0.5, 50);
                  return Math.floor(dataMin - padding);
                }, (dataMax: number) => {
                  const padding = Math.max(Math.abs(dataMax - 10000) * 0.5, 50);
                  return Math.ceil(dataMax + padding);
                }]}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
              />
              <Legend />
              <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Cumulative P&L Chart */}
      {equityCurve.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Cumulative P&L</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={equityCurve}>
              <defs>
                <linearGradient id="pnlGradientPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--profit))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--profit))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlGradientNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="trade" stroke="hsl(var(--muted-foreground))" />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                domain={[(dataMin: number) => {
                  const padding = Math.max(Math.abs(dataMin) * 0.2, 10);
                  return Math.floor(dataMin - padding);
                }, (dataMax: number) => {
                  const padding = Math.max(Math.abs(dataMax) * 0.2, 10);
                  return Math.ceil(dataMax + padding);
                }]}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Cumulative P&L"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="cumulativePnL" 
                stroke={totalPnL >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"} 
                fill={totalPnL >= 0 ? "url(#pnlGradientPositive)" : "url(#pnlGradientNegative)"}
                strokeWidth={2}
                name="Cumulative P&L"
              />
            </AreaChart>
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

      {/* Strategy Type Breakdown */}
      {strategyTypeData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Strategy Type Breakdown
          </h3>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Strategy Type Distribution Pie Chart */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Trade Distribution</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={strategyTypePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {strategyTypePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Win Rate by Strategy Type Bar Chart */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Win Rate by Type</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={strategyTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="label" type="category" width={100} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                    {strategyTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Detailed Strategy Type Stats */}
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {strategyTypeData.map((strategy, idx) => (
              <Card key={idx} className="p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: strategy.color }}
                  />
                  <span className="font-medium text-sm">{strategy.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">P&L</div>
                    <div className={`font-semibold ${strategy.totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                      ${strategy.totalPnL.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Trades</div>
                    <div className="font-semibold">{strategy.trades}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Win Rate</div>
                    <div className={`font-semibold ${strategy.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                      {strategy.winRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Avg P&L</div>
                    <div className={`font-semibold ${strategy.avgPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                      ${strategy.avgPnL.toFixed(2)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
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
            <div className="space-y-4 max-h-[250px] overflow-y-auto">
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
