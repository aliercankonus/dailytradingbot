import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSymbols } from "@/hooks/useSymbols";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SimulationResults {
  statistics: {
    meanReturn: number;
    medianReturn: number;
    stdDeviation: number;
    confidenceInterval: {
      level: number;
      lowerBound: number;
      upperBound: number;
    };
    profitProbability: number;
    valueAtRisk: number;
    conditionalValueAtRisk: number;
    averageMaxDrawdown: number;
    averageSharpeRatio: number;
  };
  distribution: Array<{ range: string; count: number; percentage: number }>;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  rawResults: number[];
}

interface MonteCarloSimulationProps {
  strategies: Array<{ id: string; name: string }>;
}

export const MonteCarloSimulation = ({ strategies }: MonteCarloSimulationProps) => {
  const { toast } = useToast();
  const { activeSymbols, symbols } = useSymbols();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimulationResults | null>(null);

  const [strategyId, setStrategyId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [simulations, setSimulations] = useState(10000);
  const [timeHorizon, setTimeHorizon] = useState(30);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);

  // Set default symbol when activeSymbols loads
  useEffect(() => {
    if (activeSymbols.length > 0 && !symbol) {
      setSymbol(activeSymbols[0]);
    }
  }, [activeSymbols]);

  const runSimulation = async () => {
    if (!strategyId) {
      toast({
        title: "Error",
        description: "Please select a strategy",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      console.log("Starting Monte Carlo simulation...");

      const { data, error } = await supabase.functions.invoke("monte-carlo-simulation", {
        body: {
          strategyId,
          symbol,
          simulations,
          timeHorizonDays: timeHorizon,
          initialCapital,
          confidenceLevel,
        },
      });

      if (error) throw error;

      console.log("Simulation complete:", data);
      setResults(data);

      toast({
        title: "Simulation Complete",
        description: `Ran ${simulations.toLocaleString()} simulations successfully`,
      });
    } catch (error) {
      console.error("Error running simulation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run simulation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monte Carlo Simulation</CardTitle>
          <CardDescription>Test strategy robustness across thousands of randomized market scenarios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Strategy</Label>
              <Select value={strategyId} onValueChange={setStrategyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger>
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
              <Label>Number of Simulations</Label>
              <Input
                type="number"
                value={simulations}
                onChange={(e) => setSimulations(Number(e.target.value))}
                min={100}
                max={50000}
                step={1000}
              />
            </div>

            <div className="space-y-2">
              <Label>Time Horizon (Days)</Label>
              <Input
                type="number"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(Number(e.target.value))}
                min={7}
                max={365}
              />
            </div>

            <div className="space-y-2">
              <Label>Initial Capital ($)</Label>
              <Input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                min={100}
                step={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Confidence Level</Label>
              <Select value={confidenceLevel.toString()} onValueChange={(v) => setConfidenceLevel(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.90">90%</SelectItem>
                  <SelectItem value="0.95">95%</SelectItem>
                  <SelectItem value="0.99">99%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={runSimulation} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running {simulations.toLocaleString()} Simulations...
              </>
            ) : (
              "Run Monte Carlo Simulation"
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Expected Return</p>
                    <p
                      className={`text-2xl font-bold ${results.statistics.meanReturn >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {formatPercent(results.statistics.meanReturn)}
                    </p>
                  </div>
                  {results.statistics.meanReturn >= 0 ? (
                    <TrendingUp className="h-8 w-8 text-profit" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-loss" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Profit Probability</p>
                    <p className="text-2xl font-bold">{results.statistics.profitProbability.toFixed(1)}%</p>
                  </div>
                  <Target className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Value at Risk</p>
                    <p className="text-2xl font-bold text-loss">{formatPercent(results.statistics.valueAtRisk)}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-loss" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                  <p className="text-2xl font-bold">{results.statistics.averageSharpeRatio.toFixed(2)}</p>
                  <Badge variant={results.statistics.averageSharpeRatio > 1 ? "default" : "secondary"} className="mt-1">
                    {results.statistics.averageSharpeRatio > 2
                      ? "Excellent"
                      : results.statistics.averageSharpeRatio > 1
                        ? "Good"
                        : "Poor"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Confidence Interval */}
          <Card>
            <CardHeader>
              <CardTitle>Confidence Interval ({results.statistics.confidenceInterval.level}%)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Lower Bound</span>
                  <span className="font-mono font-bold text-loss">
                    {formatPercent(results.statistics.confidenceInterval.lowerBound)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expected Return</span>
                  <span className="font-mono font-bold">{formatPercent(results.statistics.meanReturn)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Upper Bound</span>
                  <span className="font-mono font-bold text-profit">
                    {formatPercent(results.statistics.confidenceInterval.upperBound)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Standard Deviation</span>
                  <span className="font-mono">{results.statistics.stdDeviation.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Median Return</span>
                  <span className="font-mono">{formatPercent(results.statistics.medianReturn)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average Max Drawdown</span>
                  <span className="font-mono text-loss">{results.statistics.averageMaxDrawdown.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conditional VaR</span>
                  <span className="font-mono text-loss">
                    {formatPercent(results.statistics.conditionalValueAtRisk)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Return Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={results.distribution.filter((_, i) => i % 2 === 0)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" angle={-45} textAnchor="end" height={100} tick={{ fontSize: 10 }} />
                  <YAxis label={{ value: "Frequency (%)", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Bar dataKey="percentage" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Percentiles */}
          <Card>
            <CardHeader>
              <CardTitle>Return Percentiles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-center">
                {Object.entries(results.percentiles).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-sm text-muted-foreground">{key.toUpperCase()}</p>
                    <p className={`font-mono font-bold ${value >= 0 ? "text-profit" : "text-loss"}`}>
                      {formatPercent(value)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
