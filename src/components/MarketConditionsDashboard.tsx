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
  RefreshCw,
  Sun,
  CloudOff,
  Activity,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const VolumeStatusBadge = ({ ratio }: { ratio: number }) => {
  const percentage = Math.round(ratio * 100);
  
  if (ratio >= 0.7) {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
        {percentage}% Normal
      </Badge>
    );
  } else if (ratio >= 0.5) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
        {percentage}% Low
      </Badge>
    );
  } else if (ratio >= 0.3) {
    return (
      <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
        {percentage}% Very Low
      </Badge>
    );
  } else {
    return (
      <Badge variant="destructive">
        {percentage}% Holiday Mode
      </Badge>
    );
  }
};

const GateCountBadge = ({ count, label, color }: { count: number; label: string; color: string }) => {
  if (count === 0) return null;
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-${color}-500/10 border border-${color}-500/20`}>
      <span className={`text-${color}-500 font-medium`}>{count}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export const MarketConditionsDashboard = () => {
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Conditions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !conditions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error || 'No data available'}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { gateStatus } = conditions;
  const totalGateBlocks = Object.values(gateStatus).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Conditions
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Holiday Mode Banner */}
        {conditions.isGlobalHolidayMode && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <Sun className="h-5 w-5 text-orange-500" />
            <div>
              <p className="font-medium text-orange-500">Holiday Mode Active</p>
              <p className="text-sm text-muted-foreground">
                Volume is {Math.round(conditions.averageVolumeRatio * 100)}% of normal - thresholds raised
              </p>
            </div>
          </div>
        )}

        {/* Volume & Threshold Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Volume Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Average Volume</span>
              </div>
              <VolumeStatusBadge ratio={conditions.averageVolumeRatio} />
            </div>
            <Progress 
              value={Math.min(conditions.averageVolumeRatio * 100, 100)} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {conditions.averageVolumeRatio >= 0.7 ? 'Normal trading conditions' : 
               conditions.averageVolumeRatio >= 0.5 ? 'Reduced liquidity - caution advised' :
               conditions.averageVolumeRatio >= 0.3 ? 'Very low volume - limited signals' :
               'Holiday-like conditions - signals paused'}
            </p>
          </div>

          {/* Quality Threshold */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Quality Threshold</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline">
                      {conditions.effectiveThreshold}/100
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p>Base: 65</p>
                      {conditions.averageVolumeRatio < 0.5 && (
                        <p>Low Volume Boost: +3</p>
                      )}
                      <p className="font-medium">Effective: {conditions.effectiveThreshold}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Base: 65</span>
              {conditions.averageVolumeRatio < 0.5 && (
                <>
                  <span>+</span>
                  <Badge variant="outline" className="text-xs px-1 py-0 bg-yellow-500/10 text-yellow-500">
                    +5 low volume
                  </Badge>
                </>
              )}
              <span>=</span>
              <span className="font-medium">{conditions.effectiveThreshold}</span>
            </div>
          </div>
        </div>

        {/* Gate Status Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Signal Blocks by Gate</span>
            </div>
            <Badge variant={totalGateBlocks > 0 ? "secondary" : "outline"}>
              {totalGateBlocks} total
            </Badge>
          </div>
          
          {totalGateBlocks === 0 ? (
            <p className="text-sm text-green-500">All gates open - signals can flow</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {gateStatus.htfExtreme > 0 && (
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">
                  HTF Extreme: {gateStatus.htfExtreme}
                </Badge>
              )}
              {gateStatus.bollingerPosition > 0 && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                  Bollinger: {gateStatus.bollingerPosition}
                </Badge>
              )}
              {gateStatus.qualityScore > 0 && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                  Quality: {gateStatus.qualityScore}
                </Badge>
              )}
              {gateStatus.momentum > 0 && (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                  Momentum: {gateStatus.momentum}
                </Badge>
              )}
              {gateStatus.trendDirection > 0 && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Direction: {gateStatus.trendDirection}
                </Badge>
              )}
              {gateStatus.ranging > 0 && (
                <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                  Ranging: {gateStatus.ranging}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Per-Symbol Details (Collapsible) */}
        {conditions.symbols.length > 0 && (
          <Collapsible open={isSymbolsOpen} onOpenChange={setIsSymbolsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm">Per-Symbol Status ({conditions.symbols.length})</span>
                </div>
                {isSymbolsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {conditions.symbols.map((sym) => (
                  <div 
                    key={sym.symbol} 
                    className="p-3 rounded-lg border bg-muted/30 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{sym.symbol}</span>
                        <VolumeStatusBadge ratio={sym.volumeRatio} />
                      </div>
                      <div className="flex items-center gap-2">
                        {sym.trendDirection !== 'unknown' && (
                          <Badge variant="outline" className="text-xs">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            {sym.trendDirection}
                          </Badge>
                        )}
                        {typeof sym.adx === 'number' && (
                          <Badge variant="outline" className="text-xs">
                            ADX: {sym.adx.toFixed(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs">
                      {sym.qualityScore !== null && (
                        <span className={sym.qualityScore >= sym.effectiveThreshold ? 'text-green-500' : 'text-yellow-500'}>
                          Quality: {sym.qualityScore}/{sym.effectiveThreshold}
                        </span>
                      )}
                      {sym.momentumState !== 'unknown' && (
                        <span className="text-muted-foreground">
                          • Momentum: {sym.momentumState}
                        </span>
                      )}
                    </div>

                    {sym.blockingGates.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {sym.blockingGates.map((gate) => (
                          <Badge key={gate} variant="destructive" className="text-xs px-1.5 py-0">
                            {gate}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {conditions.symbols.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">No recent rejection data available</p>
            <p className="text-xs">Signals may be flowing normally or no symbols are being analyzed</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
