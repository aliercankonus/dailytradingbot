import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  RefreshCw,
  Gauge,
  ArrowUp,
  ArrowDown,
  Clock,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";
import { usePositions } from "@/hooks/usePositions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LineChart, Line } from "recharts";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";

interface ExitData {
  positionId: string;
  symbol: string;
  side: string;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlPercent: number;
  rMultiple: number;
  peakR: number;
  lockR: number;
  trailingActivated: boolean;
  activationR: number;
  trailDistanceR: number;
  exitScore: number;
  shouldExit: boolean;
  isEmergency: boolean;
  exitComponents: {
    momentumExhaustion: number;
    swingViolation: number;
    reversalSignal: number;
    timeDecay: number;
    volatilitySpike: number;
  };
  stopType: "atr_based" | "swing_based" | "hybrid" | "original";
  distanceATR: number;
  hoursOpen: number;
  trend?: string;
  strategyName?: string;
}

const chartConfig = {
  rMultiple: {
    label: "R-Multiple",
    color: "hsl(var(--chart-1))",
  },
  exitScore: {
    label: "Exit Score",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const getRMultipleColor = (r: number) => {
  if (r >= 2) return "hsl(142, 76%, 36%)";
  if (r >= 1) return "hsl(142, 50%, 50%)";
  if (r >= 0) return "hsl(45, 93%, 47%)";
  if (r >= -0.5) return "hsl(25, 95%, 53%)";
  return "hsl(0, 84%, 60%)";
};

const getExitScoreColor = (score: number) => {
  if (score >= 70) return "text-red-600";
  if (score >= 50) return "text-yellow-600";
  if (score >= 30) return "text-blue-600";
  return "text-green-600";
};

const getLockTier = (r: number) => {
  if (r >= 5) return { tier: "T7", lock: 3.0, color: "bg-purple-500" };
  if (r >= 4) return { tier: "T6", lock: 2.0, color: "bg-indigo-500" };
  if (r >= 3) return { tier: "T5", lock: 1.5, color: "bg-blue-500" };
  if (r >= 2.5) return { tier: "T4", lock: 1.0, color: "bg-cyan-500" };
  if (r >= 2) return { tier: "T3", lock: 0.75, color: "bg-green-500" };
  if (r >= 1.5) return { tier: "T2", lock: 0.5, color: "bg-lime-500" };
  if (r >= 1) return { tier: "T1", lock: 0.25, color: "bg-yellow-500" };
  return { tier: "-", lock: 0, color: "bg-gray-400" };
};

// Calculate exit data for positions with real-time prices
const calculateExitData = (positions: any[], pricesMap: Map<string, { price: string }>): ExitData[] => {
  if (!positions || positions.length === 0) return [];

  return positions.map((pos) => {
    const entryPrice = pos.entry_price || 0;
    // Use real-time price if available, otherwise fall back to position's current_price
    const realtimePriceStr = pricesMap.get(pos.symbol)?.price;
    const realtimePrice = realtimePriceStr ? parseFloat(realtimePriceStr) : null;
    const currentPrice = realtimePrice || pos.current_price || entryPrice;
    const stopLoss = pos.stop_loss || 0;
    const takeProfit = pos.take_profit || 0;
    const side = pos.side?.toLowerCase() || "buy";

    // Calculate R-multiple
    const riskPrice = side === "buy" 
      ? entryPrice - stopLoss 
      : stopLoss - entryPrice;
    
    const pnlPrice = side === "buy"
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;
    
    const rMultiple = riskPrice > 0 ? pnlPrice / riskPrice : 0;
    const pnlPercent = entryPrice > 0 ? (pnlPrice / entryPrice) * 100 : 0;
    
    // Peak R-multiple from position data
    const peakPnlPercent = pos.peak_pnl_percent || 0;
    const peakR = riskPrice > 0 ? (peakPnlPercent / 100 * entryPrice) / riskPrice : Math.max(rMultiple, 0);

    // Calculate lock tier
    const lockTier = getLockTier(Math.max(rMultiple, peakR));
    
    // Determine trailing activation (simplified - based on R thresholds)
    const activationR = 1.0;
    const trailDistanceR = 0.5;
    const trailingActivated = rMultiple >= activationR;

    // Calculate hours open
    const openedAt = new Date(pos.opened_at);
    const hoursOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60);

    // Exit scoring
    const exitComponents = {
      momentumExhaustion: 0,
      swingViolation: 0,
      reversalSignal: 0,
      timeDecay: 0,
      volatilitySpike: 0,
    };

    // Time decay component (increases after 4 hours)
    if (hoursOpen > 4) {
      exitComponents.timeDecay = Math.min(20, (hoursOpen - 4) * 2);
    }

    // Simple reversal signal check
    if (rMultiple < peakR - 0.5) {
      exitComponents.reversalSignal = Math.min(25, (peakR - rMultiple) * 10);
    }

    const exitScore = Object.values(exitComponents).reduce((a, b) => a + b, 0);

    // Stop type based on distance
    const distancePercent = side === "buy"
      ? ((entryPrice - stopLoss) / entryPrice) * 100
      : ((stopLoss - entryPrice) / entryPrice) * 100;
    
    const distanceATR = distancePercent / 0.5;

    return {
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice,
      currentPrice,
      stopLoss,
      takeProfit,
      pnlPercent,
      rMultiple,
      peakR,
      lockR: lockTier.lock,
      trailingActivated,
      activationR,
      trailDistanceR,
      exitScore,
      shouldExit: exitScore >= 70,
      isEmergency: exitScore >= 85,
      exitComponents,
      stopType: distanceATR < 1.5 ? "swing_based" : distanceATR < 2 ? "hybrid" : "atr_based",
      distanceATR,
      hoursOpen,
      trend: pos.trend,
      strategyName: pos.strategy_name,
    };
  });
};

export const ExitManagementDashboard = () => {
  const { positions, loading: positionsLoading, refetch: refetchPositions } = usePositions();
  const { prices, priceVersion, connected } = useRealtimePricesContext();
  
  // Calculate exit data reactively based on real-time prices
  const exitData = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return calculateExitData(positions, prices);
  }, [positions, prices, priceVersion]);

  const loading = positionsLoading;

  const handleRefresh = () => {
    refetchPositions();
  };

  // Summary stats
  const stats = {
    totalPositions: exitData?.length ?? 0,
    trailingActive: exitData?.filter(d => d.trailingActivated).length ?? 0,
    inProfit: exitData?.filter(d => d.rMultiple > 0).length ?? 0,
    atRisk: exitData?.filter(d => d.exitScore >= 50).length ?? 0,
    avgR: exitData && exitData.length > 0
      ? exitData.reduce((sum, d) => sum + d.rMultiple, 0) / exitData.length
      : 0,
    totalLockR: exitData?.reduce((sum, d) => sum + d.lockR, 0) ?? 0,
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Exit Management Dashboard
            {connected ? (
              <Badge variant="outline" className="ml-2 text-green-600 border-green-300">
                <Wifi className="h-3 w-3 mr-1" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2 text-yellow-600 border-yellow-300">
                <WifiOff className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Phase 3: Trailing status, R-multiple levels, and exit signal scores
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !exitData || exitData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active positions to monitor</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trailing">Trailing Status</TabsTrigger>
              <TabsTrigger value="exits">Exit Signals</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Active Positions</p>
                        <p className="text-2xl font-bold">{stats.totalPositions}</p>
                      </div>
                      <Activity className="h-8 w-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-700 dark:text-green-300">Trailing Active</p>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.trailingActive}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-700 dark:text-blue-300">Avg R-Multiple</p>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                          {stats.avgR >= 0 ? '+' : ''}{stats.avgR.toFixed(2)}R
                        </p>
                      </div>
                      <Target className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className={stats.atRisk > 0 ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">At Risk (Score≥50)</p>
                        <p className="text-2xl font-bold">{stats.atRisk}</p>
                      </div>
                      <AlertTriangle className={`h-8 w-8 ${stats.atRisk > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* R-Multiple Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">R-Multiple by Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={exitData.map(d => ({
                          symbol: d.symbol.replace('USDT', ''),
                          rMultiple: d.rMultiple,
                          peakR: d.peakR,
                          fill: getRMultipleColor(d.rMultiple)
                        }))}
                        margin={{ top: 10, right: 10, left: 10, bottom: 30 }}
                      >
                        <XAxis
                          dataKey="symbol"
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="rMultiple" radius={[4, 4, 0, 0]}>
                          {exitData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getRMultipleColor(entry.rMultiple)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Positions List */}
              <div className="space-y-2">
                {exitData.map((data) => (
                  <Card
                    key={data.positionId}
                    className={
                      data.isEmergency
                        ? "border-red-500/50 bg-red-50/50 dark:bg-red-950/20"
                        : data.shouldExit
                          ? "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20"
                          : data.trailingActivated
                            ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                            : ""
                    }
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{data.symbol}</span>
                          <Badge variant={data.side.toLowerCase() === "buy" ? "default" : "destructive"}>
                            {data.side.toLowerCase() === "buy" ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                            {data.side}
                          </Badge>
                          {data.strategyName && (
                            <Badge variant="outline">{data.strategyName}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            style={{ backgroundColor: getRMultipleColor(data.rMultiple) }}
                            className="text-white"
                          >
                            {data.rMultiple >= 0 ? '+' : ''}{data.rMultiple.toFixed(2)}R
                          </Badge>
                          {data.trailingActivated && (
                            <Badge className="bg-green-500">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Trailing
                            </Badge>
                          )}
                          {data.isEmergency && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              EMERGENCY
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="trailing" className="space-y-4">
              {/* Lock Tier Legend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">R-Multiple Lock Tiers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { r: "1R", lock: "0.25R", color: "bg-yellow-500" },
                      { r: "1.5R", lock: "0.5R", color: "bg-lime-500" },
                      { r: "2R", lock: "0.75R", color: "bg-green-500" },
                      { r: "2.5R", lock: "1R", color: "bg-cyan-500" },
                      { r: "3R", lock: "1.5R", color: "bg-blue-500" },
                      { r: "4R", lock: "2R", color: "bg-indigo-500" },
                      { r: "5R", lock: "3R", color: "bg-purple-500" },
                    ].map((tier) => (
                      <div key={tier.r} className="flex items-center gap-1 px-2 py-1 rounded bg-muted">
                        <div className={`w-3 h-3 rounded ${tier.color}`} />
                        <span className="text-xs">{tier.r}→{tier.lock}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Trailing Details */}
              {exitData.map((data) => {
                const lockTier = getLockTier(Math.max(data.rMultiple, data.peakR));
                
                return (
                  <Card key={data.positionId}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{data.symbol}</span>
                          <Badge variant={data.side.toLowerCase() === "buy" ? "default" : "destructive"}>
                            {data.side}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={lockTier.color}>
                            {lockTier.tier}: Lock {lockTier.lock}R
                          </Badge>
                          {data.trailingActivated ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Current R</p>
                          <p className="text-lg font-bold" style={{ color: getRMultipleColor(data.rMultiple) }}>
                            {data.rMultiple >= 0 ? '+' : ''}{data.rMultiple.toFixed(2)}R
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Peak R</p>
                          <p className="text-lg font-bold text-blue-600">
                            {data.peakR >= 0 ? '+' : ''}{data.peakR.toFixed(2)}R
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Activation Threshold</p>
                          <Progress 
                            value={Math.min(100, (data.rMultiple / data.activationR) * 100)} 
                            className="h-2 mt-2"
                          />
                          <p className="text-xs mt-1">
                            {data.rMultiple.toFixed(2)} / {data.activationR}R
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Stop Type</p>
                          <Badge variant="outline">
                            {data.stopType.replace('_', ' ')}
                          </Badge>
                          <p className="text-xs mt-1 text-muted-foreground">
                            {data.distanceATR.toFixed(1)} ATR distance
                          </p>
                        </div>
                      </div>

                      {/* R-Multiple Progress Bar */}
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Stop ({(data.stopLoss).toFixed(2)})</span>
                          <span>Entry ({data.entryPrice.toFixed(2)})</span>
                          <span>Current ({data.currentPrice.toFixed(2)})</span>
                          <span>TP ({data.takeProfit.toFixed(2)})</span>
                        </div>
                        <div className="relative h-4 bg-muted rounded overflow-hidden">
                          {/* Progress indicator */}
                          <div 
                            className="absolute h-full transition-all"
                            style={{
                              left: '0%',
                              width: `${Math.min(100, Math.max(0, ((data.rMultiple + 1) / 4) * 100))}%`,
                              backgroundColor: getRMultipleColor(data.rMultiple)
                            }}
                          />
                          {/* Lock level marker */}
                          {data.lockR > 0 && (
                            <div 
                              className="absolute h-full w-1 bg-white/80"
                              style={{ left: `${Math.min(100, ((data.lockR + 1) / 4) * 100)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="exits" className="space-y-4">
              {/* Exit Score Legend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Exit Signal Scoring</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span>0-29: Safe</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span>30-49: Monitor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span>50-69: Warning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>70+: Exit</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exit Signals by Position */}
              {exitData
                .sort((a, b) => b.exitScore - a.exitScore)
                .map((data) => (
                  <Card
                    key={data.positionId}
                    className={
                      data.isEmergency
                        ? "border-red-500 bg-red-50/50 dark:bg-red-950/20"
                        : data.shouldExit
                          ? "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20"
                          : ""
                    }
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{data.symbol}</span>
                          <Badge variant="outline">{data.side}</Badge>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {data.hoursOpen.toFixed(1)}h
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-bold ${getExitScoreColor(data.exitScore)}`}>
                            {data.exitScore}
                          </span>
                          {data.isEmergency && (
                            <Badge variant="destructive">
                              <Zap className="h-3 w-3 mr-1" />
                              EMERGENCY
                            </Badge>
                          )}
                          {data.shouldExit && !data.isEmergency && (
                            <Badge className="bg-yellow-500">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              EXIT
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Exit Components */}
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Momentum Exhaustion</span>
                            <span>{data.exitComponents.momentumExhaustion}</span>
                          </div>
                          <Progress value={data.exitComponents.momentumExhaustion} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Swing Violation</span>
                            <span>{data.exitComponents.swingViolation}</span>
                          </div>
                          <Progress value={data.exitComponents.swingViolation} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Reversal Signal</span>
                            <span>{data.exitComponents.reversalSignal}</span>
                          </div>
                          <Progress 
                            value={data.exitComponents.reversalSignal} 
                            className="h-1.5 [&>div]:bg-yellow-500" 
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Time Decay</span>
                            <span>{data.exitComponents.timeDecay}</span>
                          </div>
                          <Progress 
                            value={data.exitComponents.timeDecay} 
                            className="h-1.5 [&>div]:bg-blue-500" 
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Volatility Spike</span>
                            <span>{data.exitComponents.volatilitySpike}</span>
                          </div>
                          <Progress 
                            value={data.exitComponents.volatilitySpike} 
                            className="h-1.5 [&>div]:bg-red-500" 
                          />
                        </div>
                      </div>

                      {/* Exit Score Bar */}
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Exit Score</span>
                          <span>{data.exitScore}/100</span>
                        </div>
                        <div className="h-3 bg-muted rounded overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              data.exitScore >= 70 ? 'bg-red-500' :
                              data.exitScore >= 50 ? 'bg-yellow-500' :
                              data.exitScore >= 30 ? 'bg-blue-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${data.exitScore}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
