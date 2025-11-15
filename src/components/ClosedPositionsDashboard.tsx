import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { Loader2, TrendingUp, TrendingDown, Target, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const ClosedPositionsDashboard = () => {
  const { data: positions, isLoading } = useClosedPositions();
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'all' | 'profitable' | 'losses'>('all');
  const positionsPerPage = 10;

  const getCloseReason = (position: any): string => {
    const exitPrice = position.current_price;
    
    if (position.side === 'BUY') {
      if (position.take_profit && exitPrice >= position.take_profit) {
        return 'Take Profit';
      } else if (position.stop_loss && exitPrice <= position.stop_loss) {
        return 'Stop Loss';
      }
    } else {
      if (position.take_profit && exitPrice <= position.take_profit) {
        return 'Take Profit';
      } else if (position.stop_loss && exitPrice >= position.stop_loss) {
        return 'Stop Loss';
      }
    }
    
    return 'Manual Close';
  };

  const stats = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { total: 0, profitable: 0, losses: 0, totalPnL: 0, avgPnL: 0, takeProfitCount: 0, stopLossCount: 0 };
    }
    
    const profitable = positions.filter(p => (p.unrealized_pnl || 0) > 0).length;
    const losses = positions.filter(p => (p.unrealized_pnl || 0) < 0).length;
    const totalPnL = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    
    // Estimate closure reason based on price and TP/SL
    let takeProfitCount = 0;
    let stopLossCount = 0;
    
    positions.forEach(p => {
      const closeReason = getCloseReason(p);
      if (closeReason === 'Take Profit') takeProfitCount++;
      if (closeReason === 'Stop Loss') stopLossCount++;
    });
    
    return {
      total: positions.length,
      profitable,
      losses,
      totalPnL,
      avgPnL: positions.length > 0 ? totalPnL / positions.length : 0,
      takeProfitCount,
      stopLossCount,
    };
  }, [positions]);

  // Filter positions based on active tab
  const filteredPositions = useMemo(() => {
    if (!positions) return [];
    
    switch (activeTab) {
      case 'profitable':
        return positions.filter(p => (p.unrealized_pnl || 0) > 0);
      case 'losses':
        return positions.filter(p => (p.unrealized_pnl || 0) < 0);
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
    
    if (reason === 'Take Profit') {
      return (
        <Badge variant="default" className="gap-1">
          <Target className="h-3 w-3" />
          Take Profit
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
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-success">{stats.takeProfitCount}</div>
              <div className="text-sm text-muted-foreground">Take Profit</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-destructive">{stats.stopLossCount}</div>
              <div className="text-sm text-muted-foreground">Stop Loss</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-muted-foreground">
                {stats.total - stats.takeProfitCount - stats.stopLossCount}
              </div>
              <div className="text-sm text-muted-foreground">Manual Close</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Closed Positions History</CardTitle>
          <CardDescription>All closed trading positions with outcomes</CardDescription>
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
                <span className={position.unrealized_pnl >= 0 ? 'text-success' : 'text-destructive'}>
                  {position.unrealized_pnl >= 0 ? (
                    <TrendingUp className="h-4 w-4 inline mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 inline mr-1" />
                  )}
                  ${Math.abs(position.unrealized_pnl).toFixed(2)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={position.unrealized_pnl_percent >= 0 ? 'text-success' : 'text-destructive'}>
                  {position.unrealized_pnl_percent?.toFixed(2)}%
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
