import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

interface EarlyWarningExit {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  close_reason: string;
  closed_at: string | null;
  strategy_name: string | null;
}

const fetchEarlyWarningExits = async (): Promise<EarlyWarningExit[]> => {
  const [positionsRes, archiveRes] = await Promise.all([
    supabase
      .from('positions')
      .select('id, symbol, side, entry_price, exit_price, realized_pnl, realized_pnl_percent, close_reason, closed_at, strategy_name')
      .like('close_reason', 'early_warning%')
      .order('closed_at', { ascending: false })
      .limit(50),
    supabase
      .from('positions_archive')
      .select('id, symbol, side, entry_price, exit_price, realized_pnl, realized_pnl_percent, close_reason, closed_at, strategy_name')
      .like('close_reason', 'early_warning%')
      .order('closed_at', { ascending: false })
      .limit(50),
  ]);

  if (positionsRes.error) console.error('Error fetching positions:', positionsRes.error);
  if (archiveRes.error) console.error('Error fetching archive:', archiveRes.error);

  return [...(positionsRes.data || []), ...(archiveRes.data || [])]
    .sort((a, b) => new Date(b.closed_at || 0).getTime() - new Date(a.closed_at || 0).getTime())
    .slice(0, 50);
};

export function EarlyWarningExitsDashboard() {
  const { data: exits = [], isLoading: loading } = useQuery({
    queryKey: ['early-warning-exits'],
    queryFn: fetchEarlyWarningExits,
    staleTime: 60000,
    gcTime: 120000,
    placeholderData: keepPreviousData,
  });

  const metrics = useMemo(() => {
    if (exits.length === 0) return null;

    const profitableExits = exits.filter(e => (e.realized_pnl || 0) > 0).length;
    const totalPnl = exits.reduce((sum, e) => sum + (e.realized_pnl || 0), 0);
    const avgPnlPercent = exits.reduce((sum, e) => sum + (e.realized_pnl_percent || 0), 0) / exits.length;

    return {
      totalExits: exits.length,
      profitableExits,
      avgPnlPercent,
      totalPnl,
      winRate: (profitableExits / exits.length) * 100,
    };
  }, [exits]);

  const getCloseReasonLabel = (reason: string) => {
    if (reason === 'early_warning_1h_bearish') return '1h Bearish + 4h Weak';
    if (reason === 'early_warning_1h_bullish') return '1h Bullish + 4h Weak';
    return reason.replace('early_warning_', '').replace(/_/g, ' ');
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Early Warning Exits
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Early Warning Exits Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Metrics */}
        {metrics && metrics.totalExits > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{metrics.totalExits}</div>
              <div className="text-xs text-muted-foreground">Total Exits</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${metrics.winRate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {metrics.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${metrics.avgPnlPercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {metrics.avgPnlPercent >= 0 ? '+' : ''}{metrics.avgPnlPercent.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground">Avg P&L %</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${metrics.totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ${metrics.totalPnl.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">Total P&L</div>
            </div>
          </div>
        ) : null}

        {/* Exit List */}
        {exits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No early warning exits yet</p>
            <p className="text-sm mt-1">Exits will appear here when positions close via the early warning system</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {exits.map((exit) => (
              <div
                key={exit.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${exit.side === 'BUY' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                    {exit.side === 'BUY' ? (
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-rose-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {exit.symbol}
                      <Badge variant="outline" className="text-xs">
                        {exit.side}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {exit.closed_at ? format(new Date(exit.closed_at), 'MMM d, HH:mm') : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-medium ${(exit.realized_pnl || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(exit.realized_pnl_percent || 0) >= 0 ? '+' : ''}
                    {(exit.realized_pnl_percent || 0).toFixed(2)}%
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {getCloseReasonLabel(exit.close_reason)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Effectiveness Analysis */}
        {metrics && metrics.totalExits >= 5 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="text-sm font-medium mb-2">Effectiveness Analysis</div>
            <div className="text-xs text-muted-foreground space-y-1">
              {metrics.winRate >= 50 ? (
                <p className="text-emerald-500">
                  ✓ Early warning exits are performing well ({metrics.winRate.toFixed(0)}% win rate)
                </p>
              ) : (
                <p className="text-amber-500">
                  ⚠ Early warning exits have low win rate ({metrics.winRate.toFixed(0)}%) - consider adjusting the 70% confidence threshold
                </p>
              )}
              {metrics.avgPnlPercent > 0 ? (
                <p className="text-emerald-500">
                  ✓ Average exit is profitable (+{metrics.avgPnlPercent.toFixed(2)}%)
                </p>
              ) : (
                <p className="text-rose-500">
                  ✗ Average exit is at a loss ({metrics.avgPnlPercent.toFixed(2)}%) - exits may be triggering too early
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
