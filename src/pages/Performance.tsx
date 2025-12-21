import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, TrendingUp, TrendingDown, Target, DollarSign, AlertTriangle, BarChart3, Zap } from "lucide-react";
import { usePortfolioHistory } from "@/hooks/usePortfolioHistory";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { MomentumBacktestSimulation } from "@/components/MomentumBacktestSimulation";

const Performance = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState("30");
  const { history, loading } = usePortfolioHistory(parseInt(timeRange));

  // Transform data for charts
  const chartData = history.map((snapshot) => ({
    date: format(new Date(snapshot.snapshot_date), "MMM dd"),
    portfolioValue: parseFloat(snapshot.portfolio_value.toString()),
    totalPnL: parseFloat(snapshot.total_pnl.toString()),
    realizedPnL: parseFloat(snapshot.realized_pnl.toString()),
    unrealizedPnL: parseFloat(snapshot.unrealized_pnl.toString()),
    winRate: parseFloat(snapshot.win_rate.toString()),
    totalTrades: snapshot.total_trades,
    winningTrades: snapshot.winning_trades,
    losingTrades: snapshot.losing_trades,
    maxDrawdown: parseFloat(snapshot.max_drawdown.toString()),
    profitFactor: parseFloat(snapshot.profit_factor.toString()),
    avgWin: parseFloat(snapshot.avg_win.toString()),
    avgLoss: parseFloat(snapshot.avg_loss.toString()),
  }));

  // Calculate summary stats
  const latestSnapshot = history[history.length - 1];
  const firstSnapshot = history[0];
  const periodChange = latestSnapshot && firstSnapshot
    ? ((latestSnapshot.portfolio_value - firstSnapshot.portfolio_value) / firstSnapshot.portfolio_value) * 100
    : 0;

  const stats = [
    {
      label: "Current Portfolio Value",
      value: latestSnapshot ? `$${parseFloat(latestSnapshot.portfolio_value.toString()).toFixed(2)}` : "$0.00",
      change: `${periodChange >= 0 ? "+" : ""}${periodChange.toFixed(2)}%`,
      changePositive: periodChange >= 0,
      icon: DollarSign,
    },
    {
      label: "Total P&L",
      value: latestSnapshot ? `${latestSnapshot.total_pnl >= 0 ? "+" : ""}$${Math.abs(parseFloat(latestSnapshot.total_pnl.toString())).toFixed(2)}` : "$0.00",
      change: latestSnapshot ? `${latestSnapshot.total_return_percent.toFixed(2)}% return` : "No data yet",
      changePositive: latestSnapshot ? latestSnapshot.total_pnl >= 0 : false,
      icon: latestSnapshot && latestSnapshot.total_pnl >= 0 ? TrendingUp : TrendingDown,
    },
    {
      label: "Win Rate",
      value: latestSnapshot ? `${latestSnapshot.win_rate.toFixed(1)}%` : "0%",
      change: latestSnapshot ? `${latestSnapshot.winning_trades || 0}W / ${latestSnapshot.losing_trades || 0}L` : "No trades yet",
      changePositive: latestSnapshot ? latestSnapshot.win_rate >= 50 : false,
      icon: Target,
    },
    {
      label: "Max Drawdown",
      value: latestSnapshot ? `${latestSnapshot.max_drawdown.toFixed(2)}%` : "0%",
      change: latestSnapshot && latestSnapshot.max_drawdown > 10 ? "High risk" : "Within limits",
      changePositive: latestSnapshot ? latestSnapshot.max_drawdown < 10 : true,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="hover:bg-secondary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="h-8 w-8 text-primary" />
                Portfolio Performance
              </h1>
              <p className="text-muted-foreground mt-1">Historical performance tracking and analytics</p>
            </div>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <Card key={idx} className="p-6 bg-card border-border shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground font-mono">{stat.value}</div>
              <div className={`text-sm mt-1 flex items-center gap-1 ${stat.changePositive ? "text-profit" : "text-loss"}`}>
                {stat.changePositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stat.change}
              </div>
            </Card>
          ))}
        </div>

        {/* Charts */}
        {loading ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Loading performance data...</p>
          </Card>
        ) : history.length === 0 ? (
          <Card className="p-12 text-center">
            <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Performance Data Yet</h3>
            <p className="text-muted-foreground mb-4">
              Portfolio snapshots are captured daily. Start trading to see your performance history.
            </p>
          </Card>
        ) : (
          <Tabs defaultValue="portfolio" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="portfolio">Portfolio Value</TabsTrigger>
              <TabsTrigger value="pnl">P&L Breakdown</TabsTrigger>
              <TabsTrigger value="winrate">Win Rate</TabsTrigger>
              <TabsTrigger value="drawdown">Drawdown & Risk</TabsTrigger>
              <TabsTrigger value="momentum" className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Momentum Backtest
              </TabsTrigger>
            </TabsList>

            <TabsContent value="portfolio" className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Portfolio Value Over Time</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      domain={[(dataMin: number) => {
                        const range = Math.max(dataMin * 0.02, 100);
                        return Math.floor((dataMin - range) / 10) * 10;
                      }, (dataMax: number) => {
                        const range = Math.max(dataMax * 0.02, 100);
                        return Math.ceil((dataMax + range) / 10) * 10;
                      }]}
                      tickFormatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Portfolio Value"]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="portfolioValue"
                      stroke="hsl(var(--primary))"
                      fill="url(#portfolioGradient)"
                      name="Portfolio Value"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            <TabsContent value="pnl" className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">P&L Breakdown</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      domain={[(dataMin: number) => {
                        const padding = Math.max(Math.abs(dataMin) * 0.1, 10);
                        return Math.floor(dataMin - padding);
                      }, (dataMax: number) => {
                        const padding = Math.max(Math.abs(dataMax) * 0.1, 10);
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
                    />
                    <Legend />
                    <Line type="monotone" dataKey="totalPnL" stroke="hsl(var(--primary))" name="Total P&L" strokeWidth={2} />
                    <Line type="monotone" dataKey="realizedPnL" stroke="hsl(var(--profit))" name="Realized P&L" strokeWidth={2} />
                    <Line type="monotone" dataKey="unrealizedPnL" stroke="hsl(var(--chart-3))" name="Unrealized P&L" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            <TabsContent value="winrate" className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Win Rate & Trade Distribution</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="winningTrades" fill="hsl(var(--profit))" name="Winning Trades" />
                    <Bar dataKey="losingTrades" fill="hsl(var(--loss))" name="Losing Trades" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Win Rate Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="winRate" stroke="hsl(var(--primary))" name="Win Rate %" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            <TabsContent value="drawdown" className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Maximum Drawdown</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="maxDrawdown"
                      stroke="hsl(var(--loss))"
                      fill="url(#drawdownGradient)"
                      name="Max Drawdown %"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Profit Factor</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="profitFactor" stroke="hsl(var(--primary))" name="Profit Factor" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            <TabsContent value="momentum" className="space-y-4">
              <MomentumBacktestSimulation />
            </TabsContent>

          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Performance;
