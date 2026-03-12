import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSymbolsContext } from "@/contexts/SymbolsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import { FlaskConical, Play, Loader2, TrendingUp, TrendingDown, Target, Shield, Clock, BarChart3, Layers, Activity } from "lucide-react";

interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  totalReturnPercent: number;
  finalEquity: number;
  exitBreakdown: Record<string, number>;
  expectancy?: number;
  strategyBreakdown?: Record<string, { trades: number; winRate: number; avgPnl: number; totalPnl: number }>;
  regimeBreakdown?: Record<string, { trades: number; winRate: number; avgPnl: number }>;
  symbolBreakdown?: Record<string, { trades: number; winRate: number; avgPnl: number; totalPnl: number }>;
}

interface BacktestTrade {
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  pnlPercent: number;
  netPnlPercent: number;
  exitReason: string;
  entryScore: number;
  strategyName?: string;
  regime?: string;
}

interface BacktestResult {
  id: string;
  status: string;
  config: { symbols: string[]; startDate: string; endDate: string; barInterval: string };
  summary: BacktestSummary | null;
  trades: BacktestTrade[];
  equity_curve: { time: string; equity: number; drawdown: number }[];
  gate_stats: Record<string, number>;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

const Backtest = () => {
  const { user } = useAuth();
  const { symbols } = useSymbolsContext();
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTCUSDT']);
  const [barInterval, setBarInterval] = useState('1h');
  const [period, setPeriod] = useState('7');
  const [running, setRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [activeResult, setActiveResult] = useState<BacktestResult | null>(null);

  const loadHistory = async () => {
    const { data } = await supabase
      .from('backtest_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setResults(data as any);
  };

  const mergeBacktestResults = (batchResults: BacktestResult[]): BacktestResult => {
    const allTrades: BacktestTrade[] = [];
    const mergedGateStats: Record<string, number> = {};
    let totalDuration = 0;

    for (const batch of batchResults) {
      if (batch.trades) allTrades.push(...batch.trades);
      if (batch.gate_stats) {
        for (const [gate, count] of Object.entries(batch.gate_stats)) {
          mergedGateStats[gate] = (mergedGateStats[gate] || 0) + (count as number);
        }
      }
      totalDuration += batch.duration_ms || 0;
    }

    allTrades.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    let equity = 10000;
    let peak = equity;
    const allEquity: { time: string; equity: number; drawdown: number }[] = [];
    for (const trade of allTrades) {
      const positionSize = equity * 0.015;
      equity += positionSize * (trade.netPnlPercent / 100);
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      allEquity.push({ time: trade.exitTime, equity: Math.round(equity * 100) / 100, drawdown: Math.round(drawdown * 100) / 100 });
    }

    const winningTrades = allTrades.filter(t => t.netPnlPercent > 0);
    const losingTrades = allTrades.filter(t => t.netPnlPercent <= 0);
    const winRate = allTrades.length > 0 ? (winningTrades.length / allTrades.length) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.netPnlPercent, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.netPnlPercent, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : winningTrades.length > 0 ? 999 : 0;
    const maxDrawdown = allEquity.length > 0 ? Math.max(...allEquity.map(e => e.drawdown)) : 0;
    const totalReturn = ((equity - 10000) / 10000) * 100;
    const wr = winRate / 100;
    const expectancy = wr * avgWin - (1 - wr) * avgLoss;

    const exitBreakdown: Record<string, number> = {};
    for (const t of allTrades) exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;

    const strategyBreakdown = buildStrategyBreakdown(allTrades);
    const symbolBreakdown = buildSymbolBreakdown(allTrades);

    const firstConfig = batchResults[0]?.config;
    const lastConfig = batchResults[batchResults.length - 1]?.config;

    return {
      id: `merged-${Date.now()}`,
      status: 'completed',
      config: {
        symbols: firstConfig?.symbols || selectedSymbols,
        startDate: firstConfig?.startDate || '',
        endDate: lastConfig?.endDate || '',
        barInterval: firstConfig?.barInterval || '1h',
      },
      summary: {
        totalTrades: allTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: Math.round(winRate * 10) / 10,
        avgWinPercent: Math.round(avgWin * 1000) / 1000,
        avgLossPercent: Math.round(avgLoss * 1000) / 1000,
        profitFactor: Math.round(profitFactor * 100) / 100,
        maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
        totalReturnPercent: Math.round(totalReturn * 100) / 100,
        finalEquity: Math.round(equity * 100) / 100,
        exitBreakdown,
        expectancy: Math.round(expectancy * 1000) / 1000,
        strategyBreakdown,
        symbolBreakdown,
      },
      trades: allTrades,
      equity_curve: allEquity,
      gate_stats: mergedGateStats,
      duration_ms: totalDuration,
      error_message: null,
      created_at: new Date().toISOString(),
    };
  };

  const buildStrategyBreakdown = (trades: BacktestTrade[]) => {
    const map: Record<string, { wins: number; total: number; pnlSum: number }> = {};
    for (const t of trades) {
      const s = t.strategyName || 'UNKNOWN';
      if (!map[s]) map[s] = { wins: 0, total: 0, pnlSum: 0 };
      map[s].total++;
      map[s].pnlSum += t.netPnlPercent;
      if (t.netPnlPercent > 0) map[s].wins++;
    }
    const result: Record<string, { trades: number; winRate: number; avgPnl: number; totalPnl: number }> = {};
    for (const [k, v] of Object.entries(map)) {
      result[k] = {
        trades: v.total,
        winRate: Math.round((v.wins / v.total) * 1000) / 10,
        avgPnl: Math.round((v.pnlSum / v.total) * 1000) / 1000,
        totalPnl: Math.round(v.pnlSum * 1000) / 1000,
      };
    }
    return result;
  };

  const buildSymbolBreakdown = (trades: BacktestTrade[]) => {
    const map: Record<string, { wins: number; total: number; pnlSum: number }> = {};
    for (const t of trades) {
      const s = t.symbol;
      if (!map[s]) map[s] = { wins: 0, total: 0, pnlSum: 0 };
      map[s].total++;
      map[s].pnlSum += t.netPnlPercent;
      if (t.netPnlPercent > 0) map[s].wins++;
    }
    const result: Record<string, { trades: number; winRate: number; avgPnl: number; totalPnl: number }> = {};
    for (const [k, v] of Object.entries(map)) {
      result[k] = {
        trades: v.total,
        winRate: Math.round((v.wins / v.total) * 1000) / 10,
        avgPnl: Math.round((v.pnlSum / v.total) * 1000) / 1000,
        totalPnl: Math.round(v.pnlSum * 1000) / 1000,
      };
    }
    return result;
  };

  const runSingleChunk = async (startDate: Date, endDate: Date): Promise<BacktestResult | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    const body: any = {
      symbols: selectedSymbols,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      barInterval,
      user_id: session?.user?.id,
    };

    const { data, error } = await supabase.functions.invoke('backtest-runner', { body });
    if (error) throw error;

    const { data: result } = await supabase
      .from('backtest_results')
      .select('*')
      .eq('id', data.id)
      .single();

    return result ? (result as any as BacktestResult) : null;
  };

  const runBacktest = async () => {
    if (!user) return;
    setRunning(true);
    setBatchProgress(null);

    try {
      const days = parseInt(period);
      const CHUNK_SIZE = 30;

      if (days > CHUNK_SIZE) {
        const chunks: { start: Date; end: Date }[] = [];
        const now = new Date();
        let remaining = days;
        let chunkEnd = now;

        while (remaining > 0) {
          const chunkDays = Math.min(remaining, CHUNK_SIZE);
          const chunkStart = new Date(chunkEnd.getTime() - chunkDays * 24 * 60 * 60 * 1000);
          chunks.unshift({ start: chunkStart, end: chunkEnd });
          chunkEnd = chunkStart;
          remaining -= chunkDays;
        }

        const batchResults: BacktestResult[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const startLabel = chunk.start.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
          const endLabel = chunk.end.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
          setBatchProgress({ current: i + 1, total: chunks.length, label: `${startLabel} → ${endLabel}` });
          toast.info(`Batch ${i + 1}/${chunks.length}: ${startLabel} → ${endLabel}`);

          const result = await runSingleChunk(chunk.start, chunk.end);
          if (result && result.status === 'completed') {
            batchResults.push(result);
          } else {
            toast.warning(`Batch ${i + 1} başarısız, devam ediliyor...`);
          }
        }

        if (batchResults.length === 0) throw new Error('Hiçbir batch başarılı olamadı');

        const merged = mergeBacktestResults(batchResults);
        setActiveResult(merged);
        toast.success(`${days} gün batch backtest tamamlandı: ${batchResults.length}/${chunks.length} batch, ${merged.summary?.totalTrades} trade`);
        await loadHistory();
      } else {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await runSingleChunk(startDate, endDate);
        if (result) {
          // Enrich with client-side strategy breakdown
          if (result.trades?.length > 0 && result.summary) {
            (result.summary as any).strategyBreakdown = buildStrategyBreakdown(result.trades);
            (result.summary as any).symbolBreakdown = buildSymbolBreakdown(result.trades);
            const wr = (result.summary.winRate || 0) / 100;
            (result.summary as any).expectancy = Math.round(
              (wr * result.summary.avgWinPercent - (1 - wr) * result.summary.avgLossPercent) * 1000
            ) / 1000;
          }
          setActiveResult(result);
          setResults(prev => [result, ...prev]);
          toast.success(`Backtest tamamlandı: ${result.id?.substring(0, 8)}`);
        }
      }
    } catch (error: any) {
      toast.error(`Backtest hatası: ${error.message}`);
    } finally {
      setRunning(false);
      setBatchProgress(null);
    }
  };

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  };

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  const summary = activeResult?.summary;
  const equityCurve = activeResult?.equity_curve || [];
  const gateStats = activeResult?.gate_stats || {};
  const trades = activeResult?.trades || [];
  const sortedGates = Object.entries(gateStats).sort(([, a], [, b]) => (b as number) - (a as number));
  const strategyBreakdown = summary?.strategyBreakdown || {};
  const symbolBreakdown = summary?.symbolBreakdown || {};

  const COLORS = [
    'hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(210 80% 55%)',
    'hsl(45 90% 55%)', 'hsl(160 60% 45%)', 'hsl(280 60% 55%)',
    'hsl(30 80% 55%)', 'hsl(350 70% 50%)', 'hsl(190 70% 45%)',
    'hsl(120 50% 45%)', 'hsl(260 50% 55%)', 'hsl(15 70% 50%)',
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Backtest Engine</h1>
            <p className="text-xs text-muted-foreground">Event-driven candle replay — production pipeline ile tarihsel simülasyon</p>
          </div>
        </div>

        {/* Config Panel */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Backtest Konfigürasyonu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Symbol Selection */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Semboller</label>
              <div className="flex flex-wrap gap-1.5">
                {(symbols.length > 0 ? symbols : [
                  { symbol: 'BTCUSDT', display_name: 'BTC' },
                  { symbol: 'ETHUSDT', display_name: 'ETH' },
                  { symbol: 'BNBUSDT', display_name: 'BNB' },
                  { symbol: 'SOLUSDT', display_name: 'SOL' },
                  { symbol: 'ADAUSDT', display_name: 'ADA' },
                ]).map((s: any) => (
                  <Badge
                    key={s.symbol}
                    variant={selectedSymbols.includes(s.symbol) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleSymbol(s.symbol)}
                  >
                    {s.display_name || s.symbol.replace('USDT', '')}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Period */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Süre</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Gün</SelectItem>
                    <SelectItem value="7">7 Gün</SelectItem>
                    <SelectItem value="14">14 Gün</SelectItem>
                    <SelectItem value="30">30 Gün</SelectItem>
                    <SelectItem value="60">60 Gün</SelectItem>
                    <SelectItem value="90">90 Gün</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bar Interval */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Bar Aralığı</label>
                <Select value={barInterval} onValueChange={setBarInterval}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 Saat</SelectItem>
                    <SelectItem value="4h">4 Saat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Run Button */}
              <div className="flex items-end">
                <Button
                  onClick={runBacktest}
                  disabled={running || selectedSymbols.length === 0}
                  className="w-full h-9 text-xs"
                >
                  {running ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {batchProgress
                        ? `Batch ${batchProgress.current}/${batchProgress.total}`
                        : 'Çalışıyor...'}
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      {parseInt(period) > 30 ? `Batch Backtest (${Math.ceil(parseInt(period) / 30)}×30g)` : 'Backtest Başlat'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batch Progress Banner */}
        {batchProgress && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">
                    Batch Backtest {batchProgress.current}/{batchProgress.total}
                  </span>
                  <span className="text-xs text-muted-foreground">{batchProgress.label}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Merged Result Badge */}
        {activeResult?.id?.startsWith('merged-') && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              📊 Merged Result — {activeResult.config?.startDate ? new Date(activeResult.config.startDate).toLocaleDateString('tr-TR') : ''} → {activeResult.config?.endDate ? new Date(activeResult.config.endDate).toLocaleDateString('tr-TR') : ''}
            </Badge>
          </div>
        )}

        {/* Results */}
        {activeResult && summary && (
          <>
            {/* Summary Metrics - 5 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">Win Rate</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{summary.winRate}%</p>
                  <p className="text-[10px] text-muted-foreground">{summary.winningTrades}W / {summary.losingTrades}L</p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs text-muted-foreground">Toplam Getiri</span>
                  </div>
                  <p className={`text-xl font-bold ${summary.totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                    {summary.totalReturnPercent >= 0 ? '+' : ''}{summary.totalReturnPercent}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">${summary.finalEquity.toLocaleString()}</p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-info" />
                    <span className="text-xs text-muted-foreground">Profit Factor</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{summary.profitFactor}</p>
                  <p className="text-[10px] text-muted-foreground">Avg W: {summary.avgWinPercent}% / L: {summary.avgLossPercent}%</p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-3.5 w-3.5 text-danger" />
                    <span className="text-xs text-muted-foreground">Max Drawdown</span>
                  </div>
                  <p className="text-xl font-bold text-danger">-{summary.maxDrawdownPercent}%</p>
                  <p className="text-[10px] text-muted-foreground">{summary.totalTrades} toplam trade</p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">Expectancy</span>
                  </div>
                  <p className={`text-xl font-bold ${(summary.expectancy || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {(summary.expectancy || 0) >= 0 ? '+' : ''}{summary.expectancy || 0}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">WR×AvgW − (1-WR)×AvgL</p>
                </CardContent>
              </Card>
            </div>

            {/* Equity Curve */}
            {equityCurve.length > 0 && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Equity Eğrisi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="time"
                          tickFormatter={(t) => new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                          stroke="hsl(var(--border))"
                        />
                        <YAxis
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                          stroke="hsl(var(--border))"
                          domain={['dataMin - 100', 'dataMax + 100']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                          labelFormatter={(t) => new Date(t).toLocaleString('tr-TR')}
                          formatter={(value: number, name: string) => [
                            name === 'equity' ? `$${value.toLocaleString()}` : `${value}%`,
                            name === 'equity' ? 'Equity' : 'Drawdown'
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="equity"
                          stroke="hsl(var(--primary))"
                          fill="url(#equityGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Strategy Breakdown + Symbol Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Strategy Performance */}
              {Object.keys(strategyBreakdown).length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">Strateji Performansı</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(strategyBreakdown)
                        .sort(([, a], [, b]) => b.trades - a.trades)
                        .map(([strategy, data], i) => (
                          <div key={strategy} className="p-2.5 rounded-md border border-border/50 bg-muted/20">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-xs font-medium text-foreground font-mono">{strategy}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px]">{data.trades} trade</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div>
                                <span className="text-muted-foreground">WR</span>
                                <p className={`font-medium ${data.winRate >= 50 ? 'text-success' : 'text-danger'}`}>{data.winRate}%</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg PnL</span>
                                <p className={`font-medium ${data.avgPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {data.avgPnl >= 0 ? '+' : ''}{data.avgPnl}%
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Total PnL</span>
                                <p className={`font-medium ${data.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {data.totalPnl >= 0 ? '+' : ''}{data.totalPnl}%
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Symbol Performance */}
              {Object.keys(symbolBreakdown).length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">Sembol Performansı</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(symbolBreakdown)
                        .sort(([, a], [, b]) => b.totalPnl - a.totalPnl)
                        .map(([symbol, data], i) => (
                          <div key={symbol} className="p-2.5 rounded-md border border-border/50 bg-muted/20">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-medium text-foreground font-mono">{symbol.replace('USDT', '')}</span>
                              <Badge variant="outline" className="text-[9px]">{data.trades} trade</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div>
                                <span className="text-muted-foreground">WR</span>
                                <p className={`font-medium ${data.winRate >= 50 ? 'text-success' : 'text-danger'}`}>{data.winRate}%</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg PnL</span>
                                <p className={`font-medium ${data.avgPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {data.avgPnl >= 0 ? '+' : ''}{data.avgPnl}%
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Total PnL</span>
                                <p className={`font-medium ${data.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {data.totalPnl >= 0 ? '+' : ''}{data.totalPnl}%
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gate Rejection Breakdown Chart */}
              {sortedGates.length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">Gate Rejection Dağılımı</CardTitle>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Toplam {Object.values(gateStats).reduce((s, v) => s + (v as number), 0)} sinyal bloke edildi
                    </p>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const total = Object.values(gateStats).reduce((s, v) => s + (v as number), 0);
                      const chartData = sortedGates.map(([gate, count]) => ({
                        gate: gate.replace(/_/g, ' ').replace(/\b\w/g, l => l),
                        gateKey: gate,
                        count: count as number,
                        pct: total > 0 ? Math.round((count as number) / total * 1000) / 10 : 0,
                      }));
                      return (
                        <div>
                          <div style={{ height: Math.max(200, chartData.length * 32) }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} stroke="hsl(var(--border))" />
                                <YAxis
                                  type="category"
                                  dataKey="gate"
                                  width={160}
                                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                                  stroke="hsl(var(--border))"
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                  }}
                                  formatter={(value: number, _name: string, props: any) => [
                                    `${value} blok (${props.payload.pct}%)`,
                                    'Rejection'
                                  ]}
                                  labelFormatter={(label) => label}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                                  {chartData.map((_entry, index) => (
                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <Separator className="my-3" />
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {chartData.slice(0, 6).map((item, i) => (
                              <div key={item.gateKey} className="flex items-center gap-1.5 text-[10px]">
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-muted-foreground truncate">{item.gateKey}</span>
                                <span className="text-foreground ml-auto font-medium">{item.pct}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Exit Reason Breakdown */}
              {summary.exitBreakdown && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Çıkış Sebepleri</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(summary.exitBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([reason, count]) => (
                          <div key={reason} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-mono">{reason}</span>
                            <Badge variant="outline" className="text-[10px]">{count}</Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Trade List */}
            {trades.length > 0 && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Trade Listesi ({trades.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Sembol</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Yön</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Strateji</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Giriş</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Çıkış</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Net P&L</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Çıkış Sebebi</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium hidden sm:table-cell">Tarih</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.slice(0, 50).map((trade, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="py-1.5 px-2 font-mono">{trade.symbol.replace('USDT', '')}</td>
                            <td className="py-1.5 px-2">
                              <Badge variant={trade.side === 'LONG' ? 'default' : 'destructive'} className="text-[9px] px-1.5">
                                {trade.side}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-2">
                              <span className="text-[9px] text-muted-foreground font-mono">{trade.strategyName || '-'}</span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right font-mono">${trade.exitPrice.toFixed(2)}</td>
                            <td className={`py-1.5 px-2 text-right font-mono font-medium ${trade.netPnlPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                              {trade.netPnlPercent >= 0 ? '+' : ''}{trade.netPnlPercent.toFixed(3)}%
                            </td>
                            <td className="py-1.5 px-2">
                              <span className="text-muted-foreground font-mono">{trade.exitReason}</span>
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground hidden sm:table-cell">
                              {new Date(trade.entryTime).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {trades.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ... ve {trades.length - 50} trade daha
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Past Backtests */}
        {results.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Geçmiş Backtestler</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={loadHistory}>
                <Clock className="h-3 w-3 mr-1" /> Yenile
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-secondary/40 transition-colors ${activeResult?.id === r.id ? 'bg-secondary/60' : ''}`}
                    onClick={() => setActiveResult(r)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'} className="text-[9px]">
                        {r.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {(r.config as any)?.symbols?.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {r.summary && (
                        <>
                          <span className="text-muted-foreground font-mono">
                            {(r.summary as any).totalTrades}T | PF {(r.summary as any).profitFactor}
                          </span>
                          <span className={`font-mono font-medium ${(r.summary as any).totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                            {(r.summary as any).totalReturnPercent >= 0 ? '+' : ''}{(r.summary as any).totalReturnPercent}%
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!activeResult && results.length === 0 && (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Henüz backtest çalıştırılmadı. Yukarıdan sembol ve süre seçerek başlayın.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Event-driven candle replay — production pipeline ile tarihsel simülasyon
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default Backtest;
