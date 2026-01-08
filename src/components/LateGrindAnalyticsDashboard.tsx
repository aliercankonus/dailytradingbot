import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useLateGrindAnalytics } from "@/hooks/useLateGrindAnalytics";
import { Skeleton } from "@/components/ui/skeleton";

export default function LateGrindAnalyticsDashboard() {
  const { data: stats, isLoading, error } = useLateGrindAnalytics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Late Grind Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Late Grind Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load analytics</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Late Grind Analytics
          </CardTitle>
          <CardDescription>
            Tracks performance of Late Grind Acceptance entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No Late Grind trades recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  const winRateColor = stats.winRate >= 50 ? "text-green-500" : stats.winRate >= 40 ? "text-yellow-500" : "text-red-500";
  const profitFactorColor = stats.profitFactor >= 1.5 ? "text-green-500" : stats.profitFactor >= 1 ? "text-yellow-500" : "text-red-500";
  const showWarning = stats.winRate < 40;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Late Grind Analytics
            </CardTitle>
            <CardDescription>
              Tracking performance of Late Grind Acceptance entries (mid-move entries on failed pullback)
            </CardDescription>
          </div>
          {showWarning && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Low Win Rate
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold">{stats.totalTrades}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className={`text-2xl font-bold ${winRateColor}`}>
              {stats.winRate.toFixed(1)}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Profit Factor</p>
            <p className={`text-2xl font-bold ${profitFactorColor}`}>
              {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${stats.totalPnl.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Win/Loss Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-green-500">{stats.winningTrades} Wins</span>
            <span className="text-red-500">{stats.losingTrades} Losses</span>
          </div>
          <Progress value={stats.winRate} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Avg Win: ${stats.avgProfit.toFixed(2)}</span>
            <span>Avg Loss: ${stats.avgLoss.toFixed(2)}</span>
          </div>
        </div>

        {/* Symbol Breakdown */}
        {Object.keys(stats.symbolBreakdown).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Symbol Performance</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(stats.symbolBreakdown).map(([symbol, data]) => (
                <div key={symbol} className="p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{symbol}</span>
                    <Badge variant={data.winRate >= 50 ? "default" : "destructive"} className="text-xs">
                      {data.winRate.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{data.trades} trades</span>
                    <span className={data.avgPnl >= 0 ? "text-green-500" : "text-red-500"}>
                      ${data.avgPnl.toFixed(2)}/trade
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Trades */}
        {stats.recentTrades.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Trades</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentTrades.slice(0, 5).map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-mono">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={trade.side === "buy" ? "default" : "secondary"}>
                        {trade.side === "buy" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {trade.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right ${trade.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      ${trade.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right ${trade.pnlPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {trade.pnlPercent.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Warning Alert */}
        {showWarning && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Win rate below 40%</p>
                <p className="text-muted-foreground">
                  Consider reviewing Late Grind parameters or temporarily disabling this entry type.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
