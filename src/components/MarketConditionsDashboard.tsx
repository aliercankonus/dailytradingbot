import { useMarketConditions } from '@/hooks/useMarketConditions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  Volume2, 
  Shield, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Sun,
  Activity,
  BarChart3,
  Zap,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useState, memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const VolumeIndicator = ({ ratio }: { ratio: number | null }) => {
  if (ratio === null) {
    return <span className="text-xs text-muted-foreground font-mono">N/A</span>;
  }
  
  const percentage = Math.round(ratio * 100);
  const color = ratio >= 0.7 ? 'text-green-500' : ratio >= 0.5 ? 'text-yellow-500' : ratio >= 0.3 ? 'text-orange-500' : 'text-destructive';
  const label = ratio >= 0.7 ? 'Normal' : ratio >= 0.5 ? 'Low' : ratio >= 0.3 ? 'Very Low' : 'Holiday';
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-semibold text-sm ${color}`}>{percentage}%</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

const TrendIcon = ({ direction }: { direction: string }) => {
  if (direction.toLowerCase().includes('bull') || direction.toLowerCase().includes('up')) {
    return <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />;
  }
  if (direction.toLowerCase().includes('bear') || direction.toLowerCase().includes('down')) {
    return <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />;
  }
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
};

const GateBar = ({ count, label, total, color }: { count: number; label: string; total: number; color: string }) => {
  if (count === 0) return null;
  const widthPercent = total > 0 ? Math.max((count / total) * 100, 8) : 0;
  
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
          <div 
            className={`h-full rounded-full bg-${color}-500/70`} 
            style={{ width: `${widthPercent}%` }}
          />
        </div>
        <span className={`font-mono text-xs font-semibold text-${color}-400 w-5 text-right`}>{count}</span>
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div className="p-3 rounded-lg border bg-card space-y-2">
    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    {children}
  </div>
);

export const MarketConditionsDashboard = memo(function MarketConditionsDashboard() {
  const { conditions, loading, error, refresh } = useMarketConditions();
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Market Conditions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !conditions) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Market Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error || 'No data available'}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { gateStatus } = conditions;
  const totalGateBlocks = Object.values(gateStatus).reduce((a, b) => a + b, 0);
  const maxGate = Math.max(...Object.values(gateStatus));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Market Conditions
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Holiday Mode Banner */}
        {conditions.isGlobalHolidayMode && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Sun className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-orange-500">Holiday Mode</p>
              <p className="text-xs text-muted-foreground">
                Volume at {Math.round((conditions.averageVolumeRatio ?? 0) * 100)}% — thresholds raised
              </p>
            </div>
          </div>
        )}

        {/* Top Metrics Row */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard icon={Volume2} label="Volume">
            {conditions.isVolumeUnknown ? (
              <p className="text-xs text-muted-foreground">No data</p>
            ) : (
              <>
                <VolumeIndicator ratio={conditions.averageVolumeRatio} />
                <Progress 
                  value={Math.min((conditions.averageVolumeRatio ?? 0) * 100, 100)} 
                  className="h-1.5"
                />
              </>
            )}
          </MetricCard>

          <MetricCard icon={Shield} label="Quality Gate">
            <div className="flex items-baseline gap-1">
              <span className="font-mono font-semibold text-sm text-foreground">
                {conditions.effectiveThreshold}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            {!conditions.isVolumeUnknown && (conditions.averageVolumeRatio ?? 1) < 0.5 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                +3 low vol
              </Badge>
            )}
          </MetricCard>
        </div>

        {/* Gate Blocks — Horizontal Bar Chart */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Signal Blocks</span>
            <span className="font-mono text-xs text-muted-foreground">
              {totalGateBlocks === 0 ? (
                <span className="text-green-500 font-semibold">All Clear</span>
              ) : (
                <>{totalGateBlocks} blocked</>
              )}
            </span>
          </div>
          
          {totalGateBlocks > 0 && (
            <div className="space-y-1 py-1">
              <GateBar count={gateStatus.htfExtreme} label="HTF Extreme" total={maxGate} color="red" />
              <GateBar count={gateStatus.bollingerPosition} label="Bollinger" total={maxGate} color="orange" />
              <GateBar count={gateStatus.qualityScore} label="Quality" total={maxGate} color="yellow" />
              <GateBar count={gateStatus.momentum} label="Momentum" total={maxGate} color="purple" />
              <GateBar count={gateStatus.trendDirection} label="Direction" total={maxGate} color="blue" />
              <GateBar count={gateStatus.ranging} label="Ranging" total={maxGate} color="gray" />
            </div>
          )}
        </div>

        {/* Per-Symbol Breakdown */}
        {conditions.symbols.length > 0 && (
          <div className="space-y-1.5">
            <button 
              onClick={() => setIsSymbolsOpen(!isSymbolsOpen)}
              className="flex items-center justify-between w-full py-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Symbols ({conditions.symbols.length})
              </div>
              {isSymbolsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            
            {isSymbolsOpen && (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {/* Table Header */}
                <div className="grid grid-cols-[72px_1fr_1fr_1fr_40px] gap-3 px-2.5 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium border-b border-border/50">
                  <span>Symbol</span>
                  <span className="text-right">Volume</span>
                  <span className="text-right">ADX</span>
                  <span className="text-right">Quality</span>
                  <span className="text-center">Status</span>
                </div>

                {conditions.symbols.map((sym) => {
                  const hasBlocks = sym.blockingGates.length > 0;
                  const qualityOk = sym.qualityScore !== null && sym.qualityScore >= sym.effectiveThreshold;

                  return (
                    <TooltipProvider key={sym.symbol}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div 
                            className={`grid grid-cols-[72px_1fr_1fr_1fr_40px] gap-3 px-2.5 py-2 rounded-md border transition-colors hover:bg-muted/30 ${
                              hasBlocks ? 'border-destructive/20 bg-destructive/5' : 'border-border/30 bg-card'
                            }`}
                          >
                            {/* Symbol + Trend */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <TrendIcon direction={sym.trendDirection} />
                              <span className="font-mono text-xs font-semibold truncate text-foreground">
                                {sym.symbol.replace(/USDT$/i, '')}
                              </span>
                            </div>

                            {/* Volume */}
                            <div className="text-right">
                              {sym.volumeRatio === null ? (
                                <span className="text-xs text-muted-foreground font-mono">—</span>
                              ) : (
                                <span className={`text-xs font-mono font-medium ${
                                  sym.volumeRatio >= 0.7 ? 'text-green-500' : 
                                  sym.volumeRatio >= 0.5 ? 'text-yellow-500' : 'text-orange-500'
                                }`}>
                                  {Math.round(sym.volumeRatio * 100)}%
                                </span>
                              )}
                            </div>

                            {/* ADX */}
                            <div className="text-right">
                              {typeof sym.adx === 'number' ? (
                                <span className={`text-xs font-mono font-medium ${
                                  sym.adx >= 25 ? 'text-foreground' : 'text-muted-foreground'
                                }`}>
                                  {sym.adx.toFixed(0)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground font-mono">—</span>
                              )}
                            </div>

                            {/* Quality */}
                            <div className="text-right">
                              {sym.qualityScore !== null ? (
                                <span className={`text-xs font-mono font-medium ${
                                  qualityOk ? 'text-green-500' : 'text-yellow-500'
                                }`}>
                                  {sym.qualityScore}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </div>

                            {/* Status */}
                            <div className="flex items-center justify-center">
                              {hasBlocks ? (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                                  {sym.blockingGates.length}
                                </Badge>
                              ) : (
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" className="max-w-64 z-50">
                          <div className="space-y-1.5 text-xs">
                            <p className="font-semibold">{sym.symbol}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <span className="text-muted-foreground">Trend</span>
                              <span>{sym.trendDirection}</span>
                              <span className="text-muted-foreground">Momentum</span>
                              <span>{sym.momentumState}</span>
                              {sym.qualityScore !== null && (
                                <>
                                  <span className="text-muted-foreground">Quality</span>
                                  <span>{sym.qualityScore} / {sym.effectiveThreshold}</span>
                                </>
                              )}
                            </div>
                            {hasBlocks && (
                              <div className="pt-1 border-t border-border/50">
                                <p className="text-muted-foreground mb-1">Blocking Gates:</p>
                                <div className="flex flex-wrap gap-1">
                                  {sym.blockingGates.map((gate) => (
                                    <Badge key={gate} variant="destructive" className="text-[10px] px-1 py-0">
                                      {gate}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {conditions.symbols.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-xs">No recent rejection data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
