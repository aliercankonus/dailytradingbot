import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { Loader2, TrendingUp, TrendingDown, Target, ShieldAlert, RotateCw, Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export const ClosedPositionsDashboard = () => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: positions, isLoading } = useClosedPositions(includeArchived);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'all' | 'profitable' | 'losses'>('all');
  const positionsPerPage = 10;

  const getCloseReason = (position: any): string => {
    // Use stored close_reason if available
    if (position.close_reason) {
      switch (position.close_reason) {
        case 'take_profit': return 'Take Profit';
        case 'stop_loss': return 'Stop Loss';
        case 'trailing_stop_loss': return 'Trailing Stop';
        case 'trend_reversal_bullish': return 'Trend Exit (Bullish)';
        case 'trend_reversal_bearish': return 'Trend Exit (Bearish)';
        case 'trend_reversal_ranging': return 'Trend Exit (Ranging)';
        case 'manual': return 'Manual Close';
        default: return position.close_reason;
      }
    }
    
    // Fallback: infer from price data for old positions
    const exitPrice = position.current_price;
    if (position.side === 'BUY') {
      if (position.take_profit && exitPrice >= position.take_profit) return 'Take Profit';
      else if (position.stop_loss && exitPrice <= position.stop_loss) return 'Stop Loss';
    } else {
      if (position.take_profit && exitPrice <= position.take_profit) return 'Take Profit';
      else if (position.stop_loss && exitPrice >= position.stop_loss) return 'Stop Loss';
    }
    
    return 'Manual Close';
  };

  const stats = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { 
        total: 0, profitable: 0, losses: 0, totalPnL: 0, avgPnL: 0, 
        takeProfitCount: 0, stopLossCount: 0, trailingStopCount: 0, trendExitCount: 0, manualCount: 0 
      };
    }
    
    // Use actual realized_pnl from positions table
    const profitable = positions.filter(p => (p.realized_pnl || 0) > 0).length;
    const losses = positions.filter(p => (p.realized_pnl || 0) <= 0).length;
    const totalPnL = positions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    
    // Count closure reasons
    let takeProfitCount = 0;
    let stopLossCount = 0;
    let trailingStopCount = 0;
    let trendExitCount = 0;
    let manualCount = 0;
    
    positions.forEach(p => {
      const closeReason = getCloseReason(p);
      if (closeReason === 'Take Profit') takeProfitCount++;
      else if (closeReason === 'Stop Loss') stopLossCount++;
      else if (closeReason === 'Trailing Stop') trailingStopCount++;
      else if (closeReason.includes('Trend Exit')) trendExitCount++;
      else manualCount++;
    });
    
    return {
      total: positions.length,
      profitable,
      losses,
      totalPnL,
      avgPnL: positions.length > 0 ? totalPnL / positions.length : 0,
      takeProfitCount,
      stopLossCount,
      trailingStopCount,
      trendExitCount,
      manualCount,
    };
  }, [positions]);

  // Filter positions based on active tab
  const filteredPositions = useMemo(() => {
    if (!positions) return [];
    
    switch (activeTab) {
      case 'profitable':
        return positions.filter(p => (p.realized_pnl || 0) > 0);
      case 'losses':
        return positions.filter(p => (p.realized_pnl || 0) <= 0);
      default:
        return positions;
    }
  }, [positions, activeTab]);

  // Pagination logic
  const totalPages = Math.ceil(filteredPositions.length / positionsPerPage);
  const startIndex = (currentPage - 1) * positionsPerPage;
  const endIndex = startIndex + positionsPerPage;
  const paginatedPositions = filteredPositions.slice(startIndex, endIndex);

  // Reset to page 1 when tab changes
  useMemo(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const getCloseReasonBadge = (position: any) => {
    const reason = getCloseReason(position);
    
    // Check if closed by rebalancer
    if (position.closed_by_rebalancer) {
      return (
        <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
          <RotateCw className="h-3 w-3" />
          Auto-Rebalanced
        </Badge>
      );
    }
    
    if (reason === 'Take Profit') {
      return (
        <Badge variant="default" className="gap-1 bg-success/10 text-success border-success/20">
          <Target className="h-3 w-3" />
          Take Profit
        </Badge>
      );
    } else if (reason === 'Trailing Stop') {
      return (
        <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <TrendingUp className="h-3 w-3" />
          Trailing Stop
        </Badge>
      );
    } else if (reason.includes('Trend Exit')) {
      return (
        <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-500 border-purple-500/20">
          <TrendingDown className="h-3 w-3" />
          {reason}
        </Badge>
      );
    } else if (reason === 'Stop Loss') {
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldAlert className="h-3 w-3" />
          Stop Loss
        </Badge>
      );
    }
    return <Badge variant="secondary">Manual Close</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Closed</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total P&L</CardDescription>
            <CardTitle className={`text-3xl ${stats.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${stats.totalPnL.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win Rate</CardDescription>
            <CardTitle className="text-3xl">
              {stats.total > 0 ? ((stats.profitable / stats.total) * 100).toFixed(1) : 0}%
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg P&L</CardDescription>
            <CardTitle className={`text-3xl ${stats.avgPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${stats.avgPnL.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Closure Reasons Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Closure Distribution</CardTitle>
          <CardDescription>How positions were closed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 border rounded-lg bg-success/5">
              <div className="text-2xl font-bold text-success">{stats.takeProfitCount}</div>
              <div className="text-sm text-muted-foreground">Take Profit</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-yellow-500/5">
              <div className="text-2xl font-bold text-yellow-600">{stats.trailingStopCount}</div>
              <div className="text-sm text-muted-foreground">Trailing Stop</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-purple-500/5">
              <div className="text-2xl font-bold text-purple-500">{stats.trendExitCount}</div>
              <div className="text-sm text-muted-foreground">Trend Exit</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-destructive/5">
              <div className="text-2xl font-bold text-destructive">{stats.stopLossCount}</div>
              <div className="text-sm text-muted-foreground">Stop Loss</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-muted-foreground">{stats.manualCount}</div>
              <div className="text-sm text-muted-foreground">Manual</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Closed Positions History</CardTitle>
              <CardDescription>All closed trading positions with outcomes</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <Switch
                id="include-archived"
                checked={includeArchived}
                onCheckedChange={setIncludeArchived}
              />
              <Label htmlFor="include-archived" className="text-sm cursor-pointer">
                Show Archived
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'profitable' | 'losses')}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="profitable">Profitable ({stats.profitable})</TabsTrigger>
              <TabsTrigger value="losses">Losses ({stats.losses})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-4">
              <PositionsTable positions={paginatedPositions} getCloseReasonBadge={getCloseReasonBadge} />
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredPositions.length)} of {filteredPositions.length} positions
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

interface PositionsTableProps {
  positions: any[];
  getCloseReasonBadge: (position: any) => JSX.Element;
}

const PositionsTable = ({ positions, getCloseReasonBadge }: PositionsTableProps) => {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No positions found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Exit</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="text-right">P&L %</TableHead>
            <TableHead>Close Reason</TableHead>
            <TableHead>Closed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow key={position.id}>
              <TableCell className="font-medium">{position.symbol}</TableCell>
              <TableCell>
                <Badge variant={position.side === 'BUY' ? 'default' : 'secondary'}>
                  {position.side}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {position.trades?.strategy_name || 'N/A'}
                </span>
              </TableCell>
              <TableCell className="text-right">${position.entry_price?.toFixed(4)}</TableCell>
              <TableCell className="text-right">${position.current_price?.toFixed(4)}</TableCell>
              <TableCell className="text-right">{position.quantity?.toFixed(4)}</TableCell>
              <TableCell className="text-right">
                <span className={(position.trades?.profit_loss || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                  {(position.trades?.profit_loss || 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 inline mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 inline mr-1" />
                  )}
                  ${Math.abs(position.trades?.profit_loss || 0).toFixed(2)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={(position.trades?.profit_loss_percent || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                  {position.trades?.profit_loss_percent?.toFixed(2) || '0.00'}%
                </span>
              </TableCell>
              <TableCell>{getCloseReasonBadge(position)}</TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(position.updated_at), { addSuffix: true })}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
