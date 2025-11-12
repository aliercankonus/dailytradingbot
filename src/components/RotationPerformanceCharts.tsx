import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RotationHistory {
  id: string;
  from_strategy_name: string;
  to_strategy_name: string;
  reason: string;
  rotated_at: string;
  market_condition?: {
    volatility: number;
    trend: string;
    volume: number;
  };
  performance_metrics?: {
    from_win_rate: number;
    to_win_rate: number;
    from_profit: number;
    to_profit: number;
    from_total_trades: number;
    to_total_trades: number;
    from_max_drawdown: number;
    to_max_drawdown: number;
  };
}

interface RotationPerformanceChartsProps {
  history: RotationHistory[];
}

export const RotationPerformanceCharts = ({ history }: RotationPerformanceChartsProps) => {
  if (history.length === 0) {
    return null;
  }

  // Get the most recent rotation
  const latestRotation = history[0];
  const metrics = latestRotation.performance_metrics;

  if (!metrics) {
    return null;
  }

  // Prepare comparison data for bar chart
  const comparisonData = [
    {
      metric: 'Win Rate %',
      Previous: metrics.from_win_rate,
      New: metrics.to_win_rate,
    },
    {
      metric: 'Total Trades',
      Previous: metrics.from_total_trades,
      New: metrics.to_total_trades,
    },
    {
      metric: 'Profit $',
      Previous: metrics.from_profit,
      New: metrics.to_profit,
    },
  ];

  // Prepare radar chart data
  const radarData = [
    {
      metric: 'Win Rate',
      Previous: metrics.from_win_rate,
      New: metrics.to_win_rate,
      fullMark: 100,
    },
    {
      metric: 'Profit Score',
      Previous: Math.min(100, (metrics.from_profit / 50) * 100),
      New: Math.min(100, (metrics.to_profit / 50) * 100),
      fullMark: 100,
    },
    {
      metric: 'Trade Volume',
      Previous: Math.min(100, (metrics.from_total_trades / 100) * 100),
      New: Math.min(100, (metrics.to_total_trades / 100) * 100),
      fullMark: 100,
    },
    {
      metric: 'Risk Control',
      Previous: Math.max(0, 100 - Math.abs(metrics.from_max_drawdown) * 2),
      New: Math.max(0, 100 - Math.abs(metrics.to_max_drawdown) * 2),
      fullMark: 100,
    },
  ];

  // Prepare trend data across all rotations
  const trendData = history.slice(0, 5).reverse().map((rotation, index) => ({
    rotation: `R${index + 1}`,
    strategy: rotation.to_strategy_name.substring(0, 10),
    winRate: rotation.performance_metrics?.to_win_rate || 0,
    profit: rotation.performance_metrics?.to_profit || 0,
  }));

  const winRateChange = metrics.to_win_rate - metrics.from_win_rate;
  const profitChange = metrics.to_profit - metrics.from_profit;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Win Rate Change</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">
                {winRateChange > 0 ? '+' : ''}{winRateChange.toFixed(1)}%
              </div>
              {winRateChange > 0 ? (
                <TrendingUp className="h-5 w-5 text-success" />
              ) : (
                <TrendingDown className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {metrics.from_win_rate.toFixed(1)}% → {metrics.to_win_rate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Profit Change</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">
                {profitChange > 0 ? '+' : ''}${profitChange.toFixed(2)}
              </div>
              {profitChange > 0 ? (
                <TrendingUp className="h-5 w-5 text-success" />
              ) : (
                <TrendingDown className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              ${metrics.from_profit.toFixed(2)} → ${metrics.to_profit.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Latest Rotation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                {latestRotation.from_strategy_name.substring(0, 10)}
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge className="text-xs">
                {latestRotation.to_strategy_name.substring(0, 10)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(latestRotation.rotated_at), { addSuffix: true })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Comparison</CardTitle>
          <CardDescription>
            Comparing {latestRotation.from_strategy_name} vs {latestRotation.to_strategy_name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="metric" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Bar dataKey="Previous" fill="hsl(var(--muted))" />
              <Bar dataKey="New" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy Profile</CardTitle>
            <CardDescription>Multi-dimensional performance view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis 
                  dataKey="metric" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Radar 
                  name="Previous" 
                  dataKey="Previous" 
                  stroke="hsl(var(--muted-foreground))" 
                  fill="hsl(var(--muted))" 
                  fillOpacity={0.5} 
                />
                <Radar 
                  name="New" 
                  dataKey="New" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))" 
                  fillOpacity={0.5} 
                />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trend Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Rotation Trend</CardTitle>
            <CardDescription>Win rate across last {trendData.length} rotations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="strategy" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="winRate" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  name="Win Rate %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
