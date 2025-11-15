import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Target, Activity } from "lucide-react";

interface BacktestResult {
  id: string;
  strategy_name: string;
  symbol: string;
  win_rate: number;
  net_profit: number;
  sharpe_ratio: number;
  max_drawdown: number;
  total_trades: number;
  winning_trades?: number;
  profit_factor: number;
  results_data: any;
  initial_capital: number;
}

export const StrategyComparison = () => {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      // Fetch backtesting results
      const { data: backtestData, error: backtestError } = await supabase
        .from("backtesting_results")
        .select("*")
        .order("created_at", { ascending: false });

      if (backtestError) throw backtestError;

      // Fetch strategy performance data
      const { data: perfData, error: perfError } = await supabase
        .from("strategy_performance")
        .select("*")
        .order("total_profit", { ascending: false })
        .limit(10);

      if (perfError) console.error("Error fetching performance data:", perfError);

      // Fetch ALL trades (both open and closed) for comprehensive performance
      const { data: tradeData, error: tradeError } = await supabase.from("trades").select("*");

      if (tradeError) console.error("Error fetching trade data:", tradeError);

      // Calculate performance from actual trades, grouped by strategy name only (not symbol)
      const tradePerformance = new Map<string, any>();
      if (tradeData) {
        tradeData.forEach((trade) => {
          // Strip symbol suffix from strategy name
          const cleanStrategyName = (trade.strategy_name || "Unknown")
            .replace(/\s*(BTCUSDT|ETHUSDT|BNBUSDT|SOLUSDT)$/i, "")
            .trim();
          if (!tradePerformance.has(cleanStrategyName)) {
            tradePerformance.set(cleanStrategyName, {
              total_trades: 0,
              winning_trades: 0,
              total_profit: 0,
              total_loss: 0,
              symbols: new Set<string>(),
            });
          }
          const perf = tradePerformance.get(cleanStrategyName);
          perf.total_trades++;
          perf.symbols.add(trade.symbol);

          // Only count P/L for closed trades
          if (trade.status === "closed" && trade.profit_loss !== null) {
            if (trade.profit_loss > 0) {
              perf.winning_trades++;
              perf.total_profit += trade.profit_loss;
            } else {
              perf.total_loss += Math.abs(trade.profit_loss);
            }
          }
        });
      }

      // Fetch custom strategies
      const { data: customData, error: customError } = await supabase.from("custom_strategies").select("*");

      if (customError) console.error("Error fetching custom strategies:", customError);

      // Use a Map to group by strategy name, aggregating across all symbols
      const resultsMap = new Map<string, BacktestResult>();

      // First, aggregate backtesting results by strategy name across all symbols
      const backtestByStrategy = new Map<string, any>();
      (backtestData || []).forEach((result) => {
        // Strip symbol suffix from strategy name (e.g., "Strategy BTCUSDT" -> "Strategy")
        const cleanStrategyName = result.strategy_name.replace(/\s*(BTCUSDT|ETHUSDT|BNBUSDT|SOLUSDT)$/i, "").trim();
        const key = cleanStrategyName;
        if (!backtestByStrategy.has(key)) {
          backtestByStrategy.set(key, {
            ...result,
            strategy_name: cleanStrategyName,
            symbols: new Set([result.symbol]),
            total_trades: result.total_trades || 0,
            winning_trades: result.winning_trades || 0,
            net_profit: result.net_profit || 0,
            max_drawdown: result.max_drawdown || 0,
          });
        } else {
          const existing = backtestByStrategy.get(key);
          existing.symbols.add(result.symbol);
          existing.total_trades += result.total_trades || 0;
          existing.winning_trades += result.winning_trades || 0;
          existing.net_profit += result.net_profit || 0;
          existing.max_drawdown = Math.min(existing.max_drawdown, result.max_drawdown || 0);
        }
      });

      // Add aggregated backtest results
      backtestByStrategy.forEach((result, strategyName) => {
        const symbolText: string =
          result.symbols.size > 1 ? `${result.symbols.size} symbols` : String(Array.from(result.symbols)[0]);

        resultsMap.set(strategyName, {
          ...result,
          symbol: symbolText,
          win_rate: (result.winning_trades / (result.total_trades || 1)) * 100,
        });
      });

      // Merge or add trade performance data
      tradePerformance.forEach((perf, strategyName) => {
        const closedTrades =
          perf.winning_trades + Math.floor(perf.total_loss / (perf.total_profit / (perf.winning_trades || 1)));
        const netProfit = perf.total_profit - perf.total_loss;
        const profitFactor = perf.total_loss > 0 ? perf.total_profit / perf.total_loss : 0;
        const symbolText: string =
          perf.symbols.size > 1 ? `${perf.symbols.size} symbols` : String(Array.from(perf.symbols)[0]);

        if (resultsMap.has(strategyName)) {
          // Merge with existing data
          const existing = resultsMap.get(strategyName)!;
          existing.total_trades += perf.total_trades;
          existing.winning_trades = (existing.winning_trades || 0) + perf.winning_trades;
          existing.net_profit = (existing.net_profit || 0) + netProfit;
          existing.win_rate = ((existing.winning_trades || 0) / (existing.total_trades || 1)) * 100;
          existing.profit_factor = profitFactor;
          existing.symbol = symbolText;
        } else {
          // Add as new entry
          resultsMap.set(strategyName, {
            id: `trade-${strategyName}`,
            strategy_name: strategyName,
            symbol: symbolText,
            win_rate: closedTrades > 0 ? (perf.winning_trades / closedTrades) * 100 : 0,
            net_profit: netProfit,
            sharpe_ratio: 0,
            max_drawdown: 0,
            total_trades: perf.total_trades,
            profit_factor: profitFactor,
            results_data: null,
            initial_capital: 10000,
          });
        }
      });

      // Add performance data for strategies without backtest or trade data
      (perfData || []).forEach((p) => {
        // Strip symbol suffix from strategy name
        const cleanStrategyName = p.strategy_name.replace(/\s*(BTCUSDT|ETHUSDT|BNBUSDT|SOLUSDT)$/i, "").trim();
        if (!resultsMap.has(cleanStrategyName)) {
          resultsMap.set(cleanStrategyName, {
            id: p.id,
            strategy_name: cleanStrategyName,
            symbol: "Multiple",
            win_rate: (p.winning_trades / (p.total_trades || 1)) * 100,
            net_profit: p.total_profit || 0,
            sharpe_ratio: 0,
            max_drawdown: p.max_drawdown || 0,
            total_trades: p.total_trades || 0,
            profit_factor: 0,
            results_data: null,
            initial_capital: 10000,
          });
        }
      });

      // Add custom strategies only if not already in map
      (customData || []).forEach((cs) => {
        if (!resultsMap.has(cs.name)) {
          resultsMap.set(cs.name, {
            id: cs.id,
            strategy_name: cs.name,
            symbol: "Custom",
            win_rate: 0,
            net_profit: 0,
            sharpe_ratio: 0,
            max_drawdown: 0,
            total_trades: 0,
            profit_factor: 0,
            results_data: null,
            initial_capital: 10000,
          });
        }
      });

      const combinedResults = Array.from(resultsMap.values());

      console.log("StrategyComparison - Combined Results:", combinedResults);
      setResults(combinedResults);

      // Auto-select first 3 results
      if (combinedResults.length > 0) {
        setSelectedIds(combinedResults.slice(0, Math.min(3, combinedResults.length)).map((r) => r.id));
      }
    } catch (error) {
      console.error("Error fetching results:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedResults = results.filter((r) => selectedIds.includes(r.id));
  console.log("StrategyComparison - Selected Results:", selectedResults);

  // Prepare comparison data
  const metricsComparison = selectedResults.map((result) => ({
    name: result.strategy_name,
    "Win Rate": result.win_rate || 0,
    "Net Profit": result.net_profit || 0,
    "Max Drawdown": Math.abs(result.max_drawdown || 0),
    "Sharpe Ratio": result.sharpe_ratio || 0,
    "Profit Factor": result.profit_factor || 0,
  }));
  console.log("StrategyComparison - Metrics Comparison:", metricsComparison);

  const colors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No backtest results available for comparison</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Select Strategies to Compare</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => (
            <Card
              key={result.id}
              className={`p-4 cursor-pointer transition-colors ${
                selectedIds.includes(result.id) ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => toggleSelection(result.id)}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedIds.includes(result.id)}
                  onCheckedChange={() => toggleSelection(result.id)}
                />
                <div className="flex-1">
                  <div className="font-semibold">{result.strategy_name}</div>
                  <div className="text-sm text-muted-foreground">{result.symbol}</div>
                  <div
                    className={`text-sm font-medium mt-1 ${(result.net_profit || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {(result.net_profit || 0) >= 0 ? "+" : ""}
                    {(result.net_profit || 0).toFixed(2)} ({(result.win_rate || 0).toFixed(1)}% win)
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {selectedResults.length > 0 && (
        <>
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6">Performance Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Metric</th>
                    {selectedResults.map((result, idx) => (
                      <th key={result.id} className="text-right py-3 px-4">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline">{result.strategy_name}</Badge>
                          <span className="text-xs text-muted-foreground">{result.symbol}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Net Profit</td>
                    {selectedResults.map((r) => (
                      <td
                        key={r.id}
                        className={`py-3 px-4 text-right font-mono ${(r.net_profit || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        ${(r.net_profit || 0).toFixed(2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Win Rate</td>
                    {selectedResults.map((r) => (
                      <td key={r.id} className="py-3 px-4 text-right font-mono">
                        {(r.win_rate || 0).toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Total Trades</td>
                    {selectedResults.map((r) => (
                      <td key={r.id} className="py-3 px-4 text-right font-mono">
                        {r.total_trades || 0}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Profit Factor</td>
                    {selectedResults.map((r) => (
                      <td key={r.id} className="py-3 px-4 text-right font-mono">
                        {r.profit_factor?.toFixed(2) || "N/A"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Sharpe Ratio</td>
                    {selectedResults.map((r) => (
                      <td key={r.id} className="py-3 px-4 text-right font-mono">
                        {r.sharpe_ratio?.toFixed(2) || "N/A"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Max Drawdown</td>
                    {selectedResults.map((r) => (
                      <td key={r.id} className="py-3 px-4 text-right font-mono text-red-500">
                        {(r.max_drawdown || 0).toFixed(2)}%
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Win Rate Comparison</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metricsComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Win Rate" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Risk Metrics</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metricsComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Sharpe Ratio" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="Max Drawdown" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {selectedResults.every((r) => r.results_data?.trades?.length > 0) && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Equity Curves Comparison</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart
                  data={(() => {
                    // Find the max number of trades across all strategies
                    const maxTrades = Math.max(...selectedResults.map((r) => r.results_data.trades.length));

                    // Create data points for each trade number
                    const data = [];
                    for (let i = 0; i < maxTrades; i++) {
                      const point: any = { trade: i + 1 };

                      selectedResults.forEach((result) => {
                        if (i < result.results_data.trades.length) {
                          point[result.strategy_name] =
                            result.initial_capital +
                            result.results_data.trades
                              .slice(0, i + 1)
                              .reduce((sum: number, t: any) => sum + t.profit, 0);
                        }
                      });

                      data.push(point);
                    }

                    return data;
                  })()}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="trade" label={{ value: "Trade Number", position: "insideBottom", offset: -5 }} />
                  <YAxis label={{ value: "Equity ($)", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  {selectedResults.map((result, idx) => (
                    <Line
                      key={result.id}
                      type="monotone"
                      dataKey={result.strategy_name}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
