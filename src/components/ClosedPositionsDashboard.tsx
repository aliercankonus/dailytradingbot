import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { Loader2, TrendingUp, TrendingDown, Target, ShieldAlert, Archive, Filter, X, Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatPrice, formatPercent, formatQuantity } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const ClosedPositionsDashboard = () => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: positions, isLoading } = useClosedPositions(includeArchived);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'all' | 'profitable' | 'losses'>('all');
  const positionsPerPage = 10;
  
  // Filter states
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const [closeReasonFilter, setCloseReasonFilter] = useState<string>('all');

  const getCloseReason = (position: any): string => {
    // Use stored close_reason if available
    if (position.close_reason) {
      switch (position.close_reason) {
        case 'take_profit': return 'Take Profit';
        case 'stop_loss': return 'Stop Loss';
        case 'trailing_stop_loss': return 'Trailing Stop';
        case 'break_even': return 'Break-Even';
        // Trend exits - all grouped together
        case 'trend_reversal_bullish': return 'Trend Exit';
        case 'trend_reversal_bearish': return 'Trend Exit';
        case 'trend_reversal_ranging': return 'Trend Exit';
        case 'early_warning_1h_bullish': return 'Trend Exit';
        case 'early_warning_1h_bearish': return 'Trend Exit';
        case 'early_warning_exit': return 'Trend Exit';
        case 'time_based_stop': return 'Time Exit';
        // Partial closes
        case 'partial_loss': return 'Partial Loss';
        case 'partial_tp_close': return 'Partial TP';
        case 'partial_tp_1': return 'Partial TP 1';
        case 'partial_tp_2': return 'Partial TP 2';
        case 'partial_tp_3': return 'Partial TP 3';
        // Emergency exits
        case 'reversal_risk_high': return 'Emergency Exit';
        case 'divergence_volume_spike': return 'Emergency Exit';
        case 'flash_crash': return 'Emergency Exit';
        case 'volatility_spike': return 'Emergency Exit';
        case 'momentum_divergence_exit': return 'Momentum Divergence';
        case 'momentum_divergence_critical': return 'Momentum Divergence';
        case 'volatility_divergence': return 'Volatility Divergence';
        // Smart AITS exits
        case 'smart_aits_rapid_decay': return 'Smart AITS Decay';
        case 'smart_aits_profit_lock': return 'Smart AITS Lock';
        case 'decay_velocity_exit': return 'Decay Velocity Exit';
        // Hedge closes
        case 'parent_closed': return 'Hedge Closed';
        case 'hedge_take_profit': return 'Hedge TP';
        case 'hedge_stop_loss': return 'Hedge SL';
        case 'hedge_risk_dropped': return 'Hedge Exit';
        // Manual and system closes
        case 'manual': return 'Manual Close';
        case 'manual_close': return 'Manual Close';
        case 'rebalancer': return 'Rebalancer';
        case 'system': return 'System Close';
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
        takeProfitCount: 0, stopLossCount: 0, trailingStopCount: 0, trendExitCount: 0, 
        emergencyExitCount: 0, hedgeCount: 0, manualCount: 0 
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
    let emergencyExitCount = 0;
    let hedgeCount = 0;
    let manualCount = 0;
    
    const emergencyReasons = ['Emergency Exit'];
    const hedgeReasons = ['Hedge Closed', 'Hedge TP', 'Hedge SL', 'Hedge Exit'];
    const systemReasons = ['Rebalancer', 'System Close'];
    
    positions.forEach(p => {
      const closeReason = getCloseReason(p);
      if (closeReason === 'Take Profit' || closeReason.includes('Partial TP')) takeProfitCount++;
      else if (closeReason === 'Stop Loss' || closeReason === 'Partial Loss') stopLossCount++;
      else if (closeReason === 'Trailing Stop' || closeReason === 'Break-Even') trailingStopCount++;
      else if (closeReason === 'Trend Exit' || closeReason === 'Time Exit') trendExitCount++;
      else if (emergencyReasons.includes(closeReason)) emergencyExitCount++;
      else if (hedgeReasons.includes(closeReason)) hedgeCount++;
      else if (systemReasons.includes(closeReason)) stopLossCount++; // Group with stop loss
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
      emergencyExitCount,
      hedgeCount,
      manualCount,
    };
  }, [positions]);

  // Get unique filter options from positions
  const filterOptions = useMemo(() => {
    if (!positions) return { symbols: [], strategies: [], closeReasons: [] };
    
    const symbols = [...new Set(positions.map(p => p.symbol))].sort();
    const strategies = [...new Set(positions.map(p => p.strategy_name).filter(Boolean))].sort();
    const closeReasons = [...new Set(positions.map(p => getCloseReason(p)))].sort();
    
    return { symbols, strategies, closeReasons };
  }, [positions]);

  // Filter positions based on active tab and filters
  const filteredPositions = useMemo(() => {
    if (!positions) return [];
    
    let filtered = positions;
    
    // Tab filter
    switch (activeTab) {
      case 'profitable':
        filtered = filtered.filter(p => (p.realized_pnl || 0) > 0);
        break;
      case 'losses':
        filtered = filtered.filter(p => (p.realized_pnl || 0) <= 0);
        break;
    }
    
    // Symbol filter
    if (symbolFilter !== 'all') {
      filtered = filtered.filter(p => p.symbol === symbolFilter);
    }
    
    // Side filter
    if (sideFilter !== 'all') {
      filtered = filtered.filter(p => p.side === sideFilter);
    }
    
    // Strategy filter
    if (strategyFilter !== 'all') {
      filtered = filtered.filter(p => p.strategy_name === strategyFilter);
    }
    
    // Close reason filter
    if (closeReasonFilter !== 'all') {
      filtered = filtered.filter(p => getCloseReason(p) === closeReasonFilter);
    }
    
    return filtered;
  }, [positions, activeTab, symbolFilter, sideFilter, strategyFilter, closeReasonFilter]);

  // Check if any filter is active
  const hasActiveFilters = symbolFilter !== 'all' || sideFilter !== 'all' || strategyFilter !== 'all' || closeReasonFilter !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setSymbolFilter('all');
    setSideFilter('all');
    setStrategyFilter('all');
    setCloseReasonFilter('all');
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredPositions.length / positionsPerPage);
  const startIndex = (currentPage - 1) * positionsPerPage;
  const endIndex = startIndex + positionsPerPage;
  const paginatedPositions = filteredPositions.slice(startIndex, endIndex);

  // Reset to page 1 when tab or filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [activeTab, symbolFilter, sideFilter, strategyFilter, closeReasonFilter]);

  const getCloseReasonBadge = (position: any) => {
    const reason = getCloseReason(position);
    
    if (reason === 'Take Profit' || reason.includes('Partial TP')) {
      return (
        <Badge variant="default" className="gap-1 bg-success/10 text-success border-success/20">
          <Target className="h-3 w-3" />
          {reason}
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
    } else if (reason === 'Break-Even') {
      return (
        <Badge variant="outline" className="gap-1 bg-cyan-500/10 text-cyan-600 border-cyan-500/20">
          <ShieldAlert className="h-3 w-3" />
          Break-Even
        </Badge>
      );
    } else if (reason === 'Time Exit') {
      return (
        <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-500 border-orange-500/20">
          <ShieldAlert className="h-3 w-3" />
          Time Exit
        </Badge>
      );
    } else if (reason === 'Partial Loss') {
      return (
        <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
          <ShieldAlert className="h-3 w-3" />
          Partial Loss
        </Badge>
      );
    } else if (reason === 'Hedge Closed' || reason === 'Hedge TP' || reason === 'Hedge SL' || reason === 'Hedge Exit') {
      return (
        <Badge variant="outline" className="gap-1 bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
          <Layers className="h-3 w-3" />
          {reason}
        </Badge>
      );
    } else if (reason === 'Emergency Exit') {
      return (
        <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-500 border-red-500/20">
          <ShieldAlert className="h-3 w-3" />
          Emergency Exit
        </Badge>
      );
    } else if (reason === 'Momentum Divergence' || reason === 'Volatility Divergence') {
      return (
        <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
          <ShieldAlert className="h-3 w-3" />
          {reason}
        </Badge>
      );
    } else if (reason === 'Smart AITS Lock') {
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <TrendingUp className="h-3 w-3" />
          Smart AITS Lock
        </Badge>
      );
    } else if (reason === 'Smart AITS Decay' || reason === 'Decay Velocity Exit') {
      return (
        <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
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
    return <Badge variant="secondary">{reason}</Badge>;
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
              {formatPrice(stats.totalPnL, 2, '$')}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win Rate</CardDescription>
            <CardTitle className="text-3xl">
              {formatPercent(stats.total > 0 ? (stats.profitable / stats.total) * 100 : 0, 1)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg P&L</CardDescription>
            <CardTitle className={`text-3xl ${stats.avgPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatPrice(stats.avgPnL, 2, '$')}
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
            <div className="text-center p-4 border rounded-lg bg-indigo-500/5">
              <div className="text-2xl font-bold text-indigo-500">{stats.hedgeCount}</div>
              <div className="text-sm text-muted-foreground">Hedge</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-orange-500/5">
              <div className="text-2xl font-bold text-orange-500">{stats.emergencyExitCount}</div>
              <div className="text-sm text-muted-foreground">Emergency</div>
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
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
              <TabsList>
                <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="profitable">Profitable ({stats.profitable})</TabsTrigger>
                <TabsTrigger value="losses">Losses ({stats.losses})</TabsTrigger>
              </TabsList>
              
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                
                <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder="Symbol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Symbols</SelectItem>
                    {filterOptions.symbols.map(symbol => (
                      <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={sideFilter} onValueChange={setSideFilter}>
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue placeholder="Side" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sides</SelectItem>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue placeholder="Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    {filterOptions.strategies.map(strategy => (
                      <SelectItem key={strategy} value={strategy}>{strategy}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={closeReasonFilter} onValueChange={setCloseReasonFilter}>
                  <SelectTrigger className="w-[150px] h-8">
                    <SelectValue placeholder="Close Reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reasons</SelectItem>
                    {filterOptions.closeReasons.map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            
            {/* Active filter summary */}
            {hasActiveFilters && (
              <div className="text-sm text-muted-foreground mb-2">
                Showing {filteredPositions.length} of {positions?.length || 0} positions
              </div>
            )}

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
                <Badge className={`${position.side === 'BUY' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                  {position.side}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {position.strategy_name || 'N/A'}
                </span>
              </TableCell>
              <TableCell className="text-right">{formatPrice(position.entry_price, 4, '$')}</TableCell>
              <TableCell className="text-right">{formatPrice(position.exit_price, 4, '$')}</TableCell>
              <TableCell className="text-right">{formatQuantity(position.quantity, 4)}</TableCell>
              <TableCell className="text-right">
                <span className={(position.realized_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                  {(position.realized_pnl || 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 inline mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 inline mr-1" />
                  )}
                  {formatPrice(Math.abs(position.realized_pnl || 0), 2, '$')}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={(position.realized_pnl_percent || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                  {formatPercent(position.realized_pnl_percent || 0)}
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
