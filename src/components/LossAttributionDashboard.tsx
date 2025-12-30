import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { Loader2, TrendingDown, AlertTriangle, Clock, Target, ShieldAlert, Activity } from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { useMemo } from 'react';
import { formatPrice, formatPercent } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface LossCategory {
  name: string;
  count: number;
  totalLoss: number;
  avgLoss: number;
  description: string;
  icon: React.ReactNode;
}

export const LossAttributionDashboard = () => {
  const { data: positions, isLoading } = useClosedPositions(true);

  // Analyze only losing positions
  const lossAnalysis = useMemo(() => {
    if (!positions) return null;

    // Filter only losing full closes (exclude partial closes for accurate analysis)
    const losingPositions = positions.filter(p => {
      const pnl = p.realized_pnl || 0;
      const reason = p.close_reason;
      const isPartial = reason === 'partial_loss' || reason === 'partial_tp_close' || 
                        reason?.startsWith('partial_tp_');
      return pnl < 0 && !isPartial;
    });

    if (losingPositions.length === 0) {
      return { categories: [], totalLosses: 0, losingPositions: [] };
    }

    // Categorize losses
    const categories: Record<string, { count: number; totalLoss: number; positions: any[] }> = {
      stop_loss: { count: 0, totalLoss: 0, positions: [] },
      trend_reversal: { count: 0, totalLoss: 0, positions: [] },
      time_exit: { count: 0, totalLoss: 0, positions: [] },
      emergency: { count: 0, totalLoss: 0, positions: [] },
      early_exit: { count: 0, totalLoss: 0, positions: [] },
      chop_market: { count: 0, totalLoss: 0, positions: [] },
      other: { count: 0, totalLoss: 0, positions: [] },
    };

    losingPositions.forEach(p => {
      const reason = p.close_reason || '';
      const holdMinutes = p.opened_at && p.closed_at 
        ? differenceInMinutes(new Date(p.closed_at), new Date(p.opened_at))
        : 0;
      const pnl = Math.abs(p.realized_pnl || 0);

      // Categorize by close reason and patterns
      if (reason === 'stop_loss') {
        categories.stop_loss.count++;
        categories.stop_loss.totalLoss += pnl;
        categories.stop_loss.positions.push(p);
      } else if (reason.includes('trend') || reason.includes('reversal')) {
        categories.trend_reversal.count++;
        categories.trend_reversal.totalLoss += pnl;
        categories.trend_reversal.positions.push(p);
      } else if (reason === 'time_based_stop' || reason === 'time_exit') {
        categories.time_exit.count++;
        categories.time_exit.totalLoss += pnl;
        categories.time_exit.positions.push(p);
      } else if (reason.includes('emergency') || reason.includes('flash') || reason.includes('volatility')) {
        categories.emergency.count++;
        categories.emergency.totalLoss += pnl;
        categories.emergency.positions.push(p);
      } else if (holdMinutes < 30) {
        // Early exits - closed within 30 minutes
        categories.early_exit.count++;
        categories.early_exit.totalLoss += pnl;
        categories.early_exit.positions.push(p);
      } else if ((p.confidence_score || 0) < 60 || (p.trend_consistency || 0) < 50) {
        // Chop market entries - low confidence or trend consistency
        categories.chop_market.count++;
        categories.chop_market.totalLoss += pnl;
        categories.chop_market.positions.push(p);
      } else {
        categories.other.count++;
        categories.other.totalLoss += pnl;
        categories.other.positions.push(p);
      }
    });

    // Format categories for display
    const categoryList: LossCategory[] = [
      {
        name: 'Stop Loss Hit',
        count: categories.stop_loss.count,
        totalLoss: categories.stop_loss.totalLoss,
        avgLoss: categories.stop_loss.count > 0 ? categories.stop_loss.totalLoss / categories.stop_loss.count : 0,
        description: 'Price moved against position and hit stop loss',
        icon: <ShieldAlert className="h-4 w-4 text-destructive" />,
      },
      {
        name: 'Trend Reversal',
        count: categories.trend_reversal.count,
        totalLoss: categories.trend_reversal.totalLoss,
        avgLoss: categories.trend_reversal.count > 0 ? categories.trend_reversal.totalLoss / categories.trend_reversal.count : 0,
        description: 'Exited due to trend change detection',
        icon: <TrendingDown className="h-4 w-4 text-amber-500" />,
      },
      {
        name: 'Time-Based Exit',
        count: categories.time_exit.count,
        totalLoss: categories.time_exit.totalLoss,
        avgLoss: categories.time_exit.count > 0 ? categories.time_exit.totalLoss / categories.time_exit.count : 0,
        description: 'Position held too long without reaching target',
        icon: <Clock className="h-4 w-4 text-orange-500" />,
      },
      {
        name: 'Emergency Exit',
        count: categories.emergency.count,
        totalLoss: categories.emergency.totalLoss,
        avgLoss: categories.emergency.count > 0 ? categories.emergency.totalLoss / categories.emergency.count : 0,
        description: 'Flash crash, volatility spike, or emergency conditions',
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      },
      {
        name: 'Early Exit (<30m)',
        count: categories.early_exit.count,
        totalLoss: categories.early_exit.totalLoss,
        avgLoss: categories.early_exit.count > 0 ? categories.early_exit.totalLoss / categories.early_exit.count : 0,
        description: 'Closed within 30 minutes - possibly poor entry timing',
        icon: <Clock className="h-4 w-4 text-purple-500" />,
      },
      {
        name: 'Chop/Ranging Entry',
        count: categories.chop_market.count,
        totalLoss: categories.chop_market.totalLoss,
        avgLoss: categories.chop_market.count > 0 ? categories.chop_market.totalLoss / categories.chop_market.count : 0,
        description: 'Entered with low confidence or weak trend',
        icon: <Activity className="h-4 w-4 text-yellow-500" />,
      },
      {
        name: 'Other',
        count: categories.other.count,
        totalLoss: categories.other.totalLoss,
        avgLoss: categories.other.count > 0 ? categories.other.totalLoss / categories.other.count : 0,
        description: 'Uncategorized losses',
        icon: <Target className="h-4 w-4 text-muted-foreground" />,
      },
    ].filter(c => c.count > 0).sort((a, b) => b.totalLoss - a.totalLoss);

    const totalLosses = losingPositions.reduce((sum, p) => sum + Math.abs(p.realized_pnl || 0), 0);

    // Identify top losing strategies
    const strategyLosses: Record<string, { count: number; loss: number }> = {};
    losingPositions.forEach(p => {
      const strategy = p.strategy_name || 'Unknown';
      if (!strategyLosses[strategy]) {
        strategyLosses[strategy] = { count: 0, loss: 0 };
      }
      strategyLosses[strategy].count++;
      strategyLosses[strategy].loss += Math.abs(p.realized_pnl || 0);
    });

    const topLosingStrategies = Object.entries(strategyLosses)
      .map(([name, data]) => ({ name, ...data, avgLoss: data.loss / data.count }))
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 5);

    // Identify top losing symbols
    const symbolLosses: Record<string, { count: number; loss: number }> = {};
    losingPositions.forEach(p => {
      if (!symbolLosses[p.symbol]) {
        symbolLosses[p.symbol] = { count: 0, loss: 0 };
      }
      symbolLosses[p.symbol].count++;
      symbolLosses[p.symbol].loss += Math.abs(p.realized_pnl || 0);
    });

    const topLosingSymbols = Object.entries(symbolLosses)
      .map(([symbol, data]) => ({ symbol, ...data, avgLoss: data.loss / data.count }))
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 5);

    return {
      categories: categoryList,
      totalLosses,
      losingPositions,
      topLosingStrategies,
      topLosingSymbols,
    };
  }, [positions]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!lossAnalysis || lossAnalysis.losingPositions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Loss Attribution Analysis
          </CardTitle>
          <CardDescription>No losing positions found</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Losses</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {formatPrice(lossAnalysis.totalLosses, 2, '-$')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Losing Trades</CardDescription>
            <CardTitle className="text-2xl">{lossAnalysis.losingPositions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Loss Per Trade</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {formatPrice(lossAnalysis.totalLosses / lossAnalysis.losingPositions.length, 2, '-$')}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Loss Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Loss Attribution by Category
          </CardTitle>
          <CardDescription>Understand why trades are losing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {lossAnalysis.categories.map((category, idx) => {
              const percentage = (category.totalLoss / lossAnalysis.totalLosses) * 100;
              return (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {category.icon}
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="outline">{category.count} trades</Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-destructive font-medium">
                        {formatPrice(category.totalLoss, 2, '-$')}
                      </span>
                      <span className="text-muted-foreground text-sm ml-2">
                        ({formatPercent(percentage, 1)})
                      </span>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Losing Strategies & Symbols */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Losing Strategies</CardTitle>
            <CardDescription>Strategies contributing most to losses</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Total Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lossAnalysis.topLosingStrategies?.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatPrice(s.loss, 2, '-$')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Losing Symbols</CardTitle>
            <CardDescription>Symbols contributing most to losses</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Total Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lossAnalysis.topLosingSymbols?.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{s.symbol}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatPrice(s.loss, 2, '-$')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Recent Losses Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Losses Detail</CardTitle>
          <CardDescription>Last 10 losing trades with full context</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead>Hold Time</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Close Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lossAnalysis.losingPositions.slice(0, 10).map((p, idx) => {
                const holdMinutes = p.opened_at && p.closed_at 
                  ? differenceInMinutes(new Date(p.closed_at), new Date(p.opened_at))
                  : 0;
                const holdTime = holdMinutes >= 60 
                  ? `${Math.floor(holdMinutes / 60)}h ${holdMinutes % 60}m`
                  : `${holdMinutes}m`;
                
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-sm">{p.strategy_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={p.side === 'BUY' ? 'default' : 'secondary'}>
                        {p.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(p.entry_price, 4)}</TableCell>
                    <TableCell className="text-right">{formatPrice(p.exit_price, 4)}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatPrice(p.realized_pnl, 2, '$')}
                    </TableCell>
                    <TableCell>{holdTime}</TableCell>
                    <TableCell>
                      <Badge variant={
                        (p.confidence_score || 0) >= 70 ? 'default' : 
                        (p.confidence_score || 0) >= 60 ? 'secondary' : 'destructive'
                      }>
                        {p.confidence_score || 0}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.close_reason || 'Unknown'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
