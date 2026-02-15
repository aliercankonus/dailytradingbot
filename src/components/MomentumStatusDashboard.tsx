import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Gauge,
  Target,
  Zap,
  RefreshCw,
  Radio,
} from "lucide-react";
import { useMomentumStatus } from "@/hooks/useMomentumStatus";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";

const chartConfig = {
  momentum: {
    label: "Momentum",
    color: "hsl(var(--chart-1))",
  },
  adx: {
    label: "ADX",
    color: "hsl(var(--chart-2))",
  },
  quality: {
    label: "Entry Quality",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

const getMomentumColor = (state: string) => {
  switch (state) {
    case "confirmed": return "hsl(142, 76%, 36%)";
    case "building": return "hsl(217, 91%, 60%)";
    case "mixed": return "hsl(45, 93%, 47%)";
    default: return "hsl(0, 0%, 45%)";
  }
};

const getRegimeColor = (adx: number) => {
  if (adx >= 25) return "hsl(142, 76%, 36%)";
  if (adx >= 20) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
};

const getRegimeLabel = (adx: number) => {
  if (adx >= 25) return "Trending";
  if (adx >= 20) return "Weak Trend";
  return "Ranging";
};

export const MomentumStatusDashboard = () => {
  const { momentumData, loading, refetch } = useMomentumStatus();
  const { prices, priceVersion, connected: wsConnected, getPrice } = useRealtimePricesContext();

  // Enhance momentum data with live prices
  const enhancedMomentumData = momentumData.map(data => {
    const livePrice = getPrice(data.symbol);
    const priceNum = parseFloat(livePrice?.price) || 0;
    const priceChangeNum = parseFloat(livePrice?.priceChangePercent) || 0;
    return {
      ...data,
      livePrice: priceNum,
      priceChange24h: priceChangeNum,
    };
  });

  const summaryStats = {
    confirmed: enhancedMomentumData.filter(d => d.momentum?.state === "confirmed").length,
    building: enhancedMomentumData.filter(d => d.momentum?.state === "building").length,
    mixed: enhancedMomentumData.filter(d => d.momentum?.state === "mixed").length,
    none: enhancedMomentumData.filter(d => d.momentum?.state === "none" || !d.momentum?.state).length,
    bullish: enhancedMomentumData.filter(d => d.trend === "bullish").length,
    bearish: enhancedMomentumData.filter(d => d.trend === "bearish").length,
  };

  const avgADX = enhancedMomentumData.length > 0
    ? enhancedMomentumData.reduce((sum, d) => sum + (d.momentum?.adx ?? 0), 0) / enhancedMomentumData.length
    : 0;

  const readyForEntry = enhancedMomentumData.filter(
    d => d.momentum?.state === "confirmed" || d.momentum?.state === "building"
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Gauge className="h-5 w-5 text-primary" />
              <span className="sm:hidden">Momentum</span>
              <span className="hidden sm:inline">Momentum Status Dashboard</span>
              {wsConnected && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <Radio className="h-3 w-3 mr-1 animate-pulse" />
                  Live
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="hidden sm:block">
              Real-time momentum scores, entry quality, and market regime for active symbols
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : enhancedMomentumData.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No active symbols configured</p>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide sm:grid sm:grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Symbol Details</TabsTrigger>
              <TabsTrigger value="regime">Market Regime</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">Confirmed</p>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">{summaryStats.confirmed}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Building</p>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summaryStats.building}</p>
                      </div>
                      <Activity className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Mixed</p>
                        <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{summaryStats.mixed}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted border-border">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">None</p>
                        <p className="text-2xl font-bold">{summaryStats.none}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Trend Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Trend Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-green-600" /> Bullish
                          </span>
                          <span className="text-xs font-medium">{summaryStats.bullish}</span>
                        </div>
                        <Progress value={(summaryStats.bullish / enhancedMomentumData.length) * 100} className="h-2 bg-muted" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <TrendingDown className="h-3 w-3 text-red-600" /> Bearish
                          </span>
                          <span className="text-xs font-medium">{summaryStats.bearish}</span>
                        </div>
                        <Progress value={(summaryStats.bearish / enhancedMomentumData.length) * 100} className="h-2 bg-muted [&>div]:bg-red-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Average Market Regime</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">ADX Average</span>
                          <Badge variant={avgADX >= 25 ? "default" : avgADX >= 20 ? "secondary" : "destructive"}>
                            {getRegimeLabel(avgADX)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={(avgADX / 50) * 100} className="h-2 flex-1" />
                          <span className="text-sm font-medium w-12 text-right">{avgADX.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Ready for Entry */}
              {readyForEntry.length > 0 && (
                <Card className="border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Ready for Entry ({readyForEntry.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {readyForEntry.map((d) => (
                        <Badge
                          key={d.symbol}
                          variant={d.momentum?.state === "confirmed" ? "default" : "secondary"}
                          className="flex items-center gap-1"
                        >
                          {d.trend === "bullish" ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {d.symbol}
                          {d.momentum?.genuineMomentum && <Zap className="h-3 w-3 text-yellow-400" />}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-3">
              {enhancedMomentumData.map((data) => {
                if (data.error) {
                  return (
                    <Card key={data.symbol} className="border-destructive/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{data.symbol}</span>
                          <Badge variant="destructive">Error: {data.error}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                const { momentum, higherTimeframeFilter, trend, livePrice, priceChange24h } = data;
                const adxValue = momentum?.adx ?? 0;
                const macdHistogram = momentum?.macdHistogram ?? 0;

                // Calculate quality score (simplified)
                let qualityScore = 0;
                if (momentum?.confirms) qualityScore += 30;
                if (momentum?.state === "building") qualityScore += 20;
                if (higherTimeframeFilter?.aligned) qualityScore += 20;
                if (momentum?.volumeConfirms) qualityScore += 15;
                if (adxValue >= 25) qualityScore += 15;

                return (
                  <Card
                    key={data.symbol}
                    className={
                      momentum?.state === "confirmed"
                        ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                        : momentum?.state === "building"
                          ? "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20"
                          : ""
                    }
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className="font-bold text-lg">{data.symbol}</span>
                            {livePrice > 0 && (
                              <span className="text-sm font-mono">
                                ${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                                {priceChange24h !== 0 && (
                                  <span className={`ml-1 text-xs ${priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%)
                                  </span>
                                )}
                              </span>
                            )}
                            <Badge
                              style={{ backgroundColor: getMomentumColor(momentum?.state ?? "none") }}
                              className="text-white"
                            >
                              {momentum?.state ?? "none"}
                            </Badge>
                            <Badge variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "outline"}>
                              {trend === "bullish" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                              {trend}
                            </Badge>
                            {momentum?.genuineMomentum && (
                              <Badge className="bg-yellow-500 text-white">
                                <Zap className="h-3 w-3 mr-1" />
                                Genuine
                              </Badge>
                            )}
                            {momentum?.fakeBreakoutRisk && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Fake Breakout Risk
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">ADX (Trend Strength)</p>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={(adxValue / 50) * 100}
                                  className="h-2 flex-1"
                                />
                                <span className="text-sm font-medium w-10">{adxValue.toFixed(1)}</span>
                              </div>
                              <p className="text-xs mt-1" style={{ color: getRegimeColor(adxValue) }}>
                                {getRegimeLabel(adxValue)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">MACD Histogram</p>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${macdHistogram > 0 ? "text-green-600" : "text-red-600"}`}>
                                  {macdHistogram.toFixed(4)}
                                </span>
                                {momentum?.macdExpanding && (
                                  <Badge variant="outline" className="text-xs">Expanding</Badge>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Timeframe Alignment</p>
                              <div className="flex items-center gap-1">
                                <span className="text-xs">4h: {higherTimeframeFilter?.trend4h}</span>
                                <span className="text-xs">1h: {higherTimeframeFilter?.trend1h}</span>
                                {higherTimeframeFilter?.aligned ? (
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Entry Quality</p>
                              <div className="flex items-center gap-2">
                                <Progress value={qualityScore} className="h-2 flex-1" />
                                <span className="text-sm font-medium w-10">{qualityScore}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {momentum?.volumeConfirms && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Volume Confirmed
                              </Badge>
                            )}
                            {momentum?.lastCloseAlignsWithTrend && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Close Aligned
                              </Badge>
                            )}
                            {!momentum?.hasDivergence && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                No Divergence
                              </Badge>
                            )}
                            {momentum?.hasDivergence && (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Divergence Detected
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="regime" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">ADX Distribution by Symbol</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="min-w-[320px]">
                    <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={enhancedMomentumData.map(d => ({
                            symbol: d.symbol.replace('USDT', ''),
                            adx: d.momentum?.adx ?? 0,
                            fill: getRegimeColor(d.momentum?.adx ?? 0)
                          }))}
                          margin={{ top: 10, right: 5, left: 0, bottom: 30 }}
                        >
                          <XAxis
                            dataKey="symbol"
                            tick={{ fontSize: 10 }}
                            angle={-45}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis domain={[0, 50]} tick={{ fontSize: 10 }} width={30} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="adx" radius={[4, 4, 0, 0]}>
                            {enhancedMomentumData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getRegimeColor(entry.momentum?.adx ?? 0)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="bg-green-50 dark:bg-green-950/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
                      Trending (ADX ≥ 25)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {enhancedMomentumData
                        .filter(d => (d.momentum?.adx ?? 0) >= 25)
                        .map(d => (
                          <Badge key={d.symbol} variant="outline" className="border-green-600 text-green-700 dark:text-green-300">
                            {d.symbol.replace('USDT', '')}
                          </Badge>
                        ))
                      }
                      {enhancedMomentumData.filter(d => (d.momentum?.adx ?? 0) >= 25).length === 0 && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50 dark:bg-yellow-950/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                      Weak Trend (20 ≤ ADX &lt; 25)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {enhancedMomentumData
                        .filter(d => {
                          const adx = d.momentum?.adx ?? 0;
                          return adx >= 20 && adx < 25;
                        })
                        .map(d => (
                          <Badge key={d.symbol} variant="outline" className="border-yellow-600 text-yellow-700 dark:text-yellow-300">
                            {d.symbol.replace('USDT', '')}
                          </Badge>
                        ))
                      }
                      {enhancedMomentumData.filter(d => {
                        const adx = d.momentum?.adx ?? 0;
                        return adx >= 20 && adx < 25;
                      }).length === 0 && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-red-50 dark:bg-red-950/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">
                      Ranging (ADX &lt; 20)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {enhancedMomentumData
                        .filter(d => (d.momentum?.adx ?? 0) < 20)
                        .map(d => (
                          <Badge key={d.symbol} variant="outline" className="border-red-600 text-red-700 dark:text-red-300">
                            {d.symbol.replace('USDT', '')}
                          </Badge>
                        ))
                      }
                      {enhancedMomentumData.filter(d => (d.momentum?.adx ?? 0) < 20).length === 0 && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
