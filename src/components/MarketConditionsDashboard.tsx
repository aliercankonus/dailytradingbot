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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useState, memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const getVolumeInfo = (ratio: number) => {
  if (ratio >= 1.2) return { label: 'High', color: 'text-green-400', bg: 'bg-green-500/10 text-green-500 border-green-500/20' };
  if (ratio >= 0.7) return { label: 'Normal', color: 'text-green-500', bg: 'bg-green-500/10 text-green-500 border-green-500/20' };
  if (ratio >= 0.5) return { label: 'Low', color: 'text-yellow-500', bg: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
  if (ratio >= 0.3) return { label: 'Very Low', color: 'text-orange-500', bg: 'bg-orange-500/10 text-orange-500 border-orange-500/20' };
  return { label: 'Holiday', color: 'text-destructive', bg: 'bg-destructive/10 text-destructive border-destructive/20' };
};

const VolumeIndicator = ({ ratio }: { ratio: number | null }) => {
  if (ratio === null) {
    return <span className="text-xs text-muted-foreground font-mono">N/A</span>;
  }
  
  const percentage = Math.round(ratio * 100);
  const info = getVolumeInfo(ratio);
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-semibold text-sm ${info.color}`}>{percentage}%</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 cursor-help ${info.bg}`}>
            {info.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-52 text-xs space-y-1 z-50">
          <p className="font-semibold mb-1">Volume vs 20-period avg</p>
          <p><span className="text-green-400">≥120%</span> — High</p>
          <p><span className="text-green-500">70–119%</span> — Normal</p>
          <p><span className="text-yellow-500">50–69%</span> — Low (+3 quality)</p>
          <p><span className="text-orange-500">30–49%</span> — Very Low (+3 quality)</p>
          <p><span className="text-destructive">&lt;30%</span> — Holiday mode</p>
        </TooltipContent>
      </Tooltip>
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
    <TooltipProvider>
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

          <MetricCard icon={Shield} label="Min Quality Threshold">
            <div className="flex items-baseline gap-1">
              <span className="font-mono font-semibold text-sm text-foreground">
                {conditions.effectiveThreshold}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">Min score required to pass</p>
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
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {conditions.symbols.map((sym) => {
                  const hasBlocks = sym.blockingGates.length > 0;
                  const qualityOk = sym.qualityScore !== null && sym.qualityScore >= sym.effectiveThreshold;

                  return (
                    <div 
                      key={sym.symbol}
                      className={`rounded border px-2 py-1.5 ${
                        hasBlocks ? 'border-destructive/20 bg-destructive/5' : 'border-border/30 bg-card'
                      }`}
                    >
                      {/* Single compact row: Symbol + inline metrics */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 min-w-[60px]">
                          <TrendIcon direction={sym.trendDirection} />
                          <span className="font-mono text-[11px] font-semibold text-foreground">
                            {sym.symbol.replace(/USDT$/i, '')}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] flex-1">
                          <span className="text-muted-foreground">
                            Vol: {sym.volumeRatio === null ? '—' : (
                              <>
                                <span className={getVolumeInfo(sym.volumeRatio).color}>
                                  {Math.round(sym.volumeRatio * 100)}%
                                </span>
                                {' '}
                                <span className={getVolumeInfo(sym.volumeRatio).color + ' opacity-70'}>
                                  {getVolumeInfo(sym.volumeRatio).label}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            ADX: {typeof sym.adx === 'number' ? (
                              <span className={sym.adx >= 25 ? 'text-foreground' : 'text-muted-foreground'}>{sym.adx.toFixed(0)}</span>
                            ) : '—'}
                          </span>
                          <span className="text-muted-foreground capitalize">
                            {sym.trendDirection === 'unknown' ? '' : sym.trendDirection}
                          </span>
                          {sym.qualityScore !== null && (
                            <span className="text-muted-foreground">
                              Q: <span className={qualityOk ? 'text-green-500' : 'text-yellow-500'}>{sym.qualityScore}</span>
                            </span>
                          )}
                        </div>

                        {hasBlocks ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {sym.blockingGates.map((gate) => (
                              <Badge key={gate} variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-destructive/10 text-destructive border-destructive/20">
                                {gate}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        )}
                      </div>
                    </div>
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
    </TooltipProvider>
  );
});
