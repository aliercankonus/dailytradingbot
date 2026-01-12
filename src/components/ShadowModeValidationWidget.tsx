import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useShadowModeStats } from '@/hooks/useShadowModeStats';
import { Eye, TrendingUp, TrendingDown, Clock, Filter, BarChart3 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const GATE_LABELS: Record<string, string> = {
  macd_divergence: 'MACD Divergence',
  adx_exhaustion: 'ADX Exhaustion',
  stochrsi_extreme: 'StochRSI Extreme',
  volume_filter: 'Volume Filter',
  trend_consistency: 'Trend Consistency',
};

const GATE_COLORS: Record<string, string> = {
  macd_divergence: 'bg-blue-500',
  adx_exhaustion: 'bg-orange-500',
  stochrsi_extreme: 'bg-purple-500',
  volume_filter: 'bg-green-500',
  trend_consistency: 'bg-yellow-500',
};

export const ShadowModeValidationWidget = () => {
  const { data: stats, isLoading, error } = useShadowModeStats(72);

  if (isLoading) {
    return (
      <Card className="border-dashed border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Shadow Mode Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card className="border-dashed border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-destructive" />
            Shadow Mode Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load shadow mode data</p>
        </CardContent>
      </Card>
    );
  }

  const winRate = stats.wouldHaveWon + stats.wouldHaveLost > 0
    ? (stats.wouldHaveWon / (stats.wouldHaveWon + stats.wouldHaveLost)) * 100
    : 0;

  const sortedGates = Object.entries(stats.byGate)
    .sort(([, a], [, b]) => b - a);

  const sortedSymbols = Object.entries(stats.bySymbol)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Shadow Mode Validation
            </CardTitle>
            <CardDescription className="mt-1">
              Tracking signals that would pass with relaxed gates (72h window)
            </CardDescription>
          </div>
          <Badge variant={stats.totalSignals > 0 ? 'default' : 'secondary'}>
            {stats.totalSignals} signals
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-green-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-lg font-bold">{stats.wouldHaveWon}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Would Win</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-red-500">
              <TrendingDown className="h-4 w-4" />
              <span className="text-lg font-bold">{stats.wouldHaveLost}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Would Lose</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-yellow-500">
              <Clock className="h-4 w-4" />
              <span className="text-lg font-bold">{stats.pending}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pending</p>
          </div>
        </div>

        {/* Win Rate Progress */}
        {stats.wouldHaveWon + stats.wouldHaveLost > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Projected Win Rate</span>
              <span className={winRate >= 50 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                {winRate.toFixed(1)}%
              </span>
            </div>
            <Progress value={winRate} className="h-2" />
          </div>
        )}

        {/* Gate Attribution */}
        {sortedGates.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              Gate Attribution
            </div>
            <div className="space-y-2">
              {sortedGates.map(([gate, count]) => (
                <div key={gate} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${GATE_COLORS[gate] || 'bg-gray-500'}`} />
                    <span className="text-sm">{GATE_LABELS[gate] || gate}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {count} ({((count / stats.totalSignals) * 100).toFixed(0)}%)
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Symbols */}
        {sortedSymbols.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4" />
              Top Symbols
            </div>
            <div className="flex flex-wrap gap-2">
              {sortedSymbols.map(([symbol, count]) => (
                <Badge key={symbol} variant="secondary" className="text-xs">
                  {symbol.replace('USDT', '')} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recent Signals */}
        {stats.recentSignals.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Recent Shadow Signals</div>
            <ScrollArea className="h-40">
              <div className="space-y-2">
                {stats.recentSignals.slice(0, 10).map((signal) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={signal.signalType === 'long' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {signal.signalType.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{signal.symbol.replace('USDT', '')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {GATE_LABELS[signal.gateBlockedBy] || signal.gateBlockedBy}
                      </span>
                      <Badge
                        variant={signal.newGateResult === 'passed' ? 'outline' : 'secondary'}
                        className="text-xs"
                      >
                        {signal.oldGateResult} → {signal.newGateResult}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(signal.createdAt), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {stats.totalSignals === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No shadow signals captured yet</p>
            <p className="text-xs mt-1">Signals that would pass with relaxed gates will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
