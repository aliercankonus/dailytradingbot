import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Filter, Loader2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Layers } from "lucide-react";
import { useOpenTrades } from "@/hooks/useOpenTrades";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { formatPrice, formatQuantity } from "@/lib/utils";

type SortColumn = 'symbol' | 'strategy_name' | 'profit_loss' | 'status' | 'side' | 'executed_at';
type SortDirection = 'asc' | 'desc';

export const TradeHistory = () => {
  const { trades, loading } = useOpenTrades();
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn>('executed_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const tradesPerPage = 10;

  const strategies = useMemo<string[]>(() => {
    const uniqueStrategies = new Set<string>(trades.map(t => t.strategy_name || 'Unknown'));
    return Array.from(uniqueStrategies);
  }, [trades]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const filteredTrades = useMemo(() => {
    // Start from open trades (already filtered in hook)
    let result = trades;
    if (selectedStrategy !== "all") {
      result = result.filter(t => (t.strategy_name || 'Unknown') === selectedStrategy);
    }
    
    // Sort the trades
    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'strategy_name':
          aVal = a.strategy_name || 'Unknown';
          bVal = b.strategy_name || 'Unknown';
          break;
        case 'profit_loss':
          aVal = a.realized_pnl ?? -Infinity;
          bVal = b.realized_pnl ?? -Infinity;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'side':
          aVal = a.side;
          bVal = b.side;
          break;
        case 'executed_at':
          aVal = new Date(a.executed_at).getTime();
          bVal = new Date(b.executed_at).getTime();
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc' 
        ? aVal - bVal
        : bVal - aVal;
    });

    return result;
  }, [trades, selectedStrategy, sortColumn, sortDirection]);

  // Pagination logic
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage);
  const startIndex = (currentPage - 1) * tradesPerPage;
  const endIndex = startIndex + tradesPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

  // Reset to page 1 when filter changes
  useMemo(() => {
    setCurrentPage(1);
  }, [selectedStrategy]);

  return (
    <Card className="p-4 sm:p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Recent Trades</h3>
          {loading && (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Strategies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strategies</SelectItem>
                {strategies.map(strategy => (
                  <SelectItem key={strategy} value={strategy}>
                    {strategy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary" className="text-xs">
            {filteredTrades.length} Trades
          </Badge>
        </div>
      </div>
      
      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Loading trade data...</p>
        ) : paginatedTrades.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No trades found</p>
        ) : (
          paginatedTrades.map((trade) => (
            <div key={trade.id} className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${trade.side === "BUY" ? "bg-success" : "bg-danger"}`} />
                  <span className="font-semibold text-foreground text-sm">{trade.symbol.replace('USDT', '/USDT')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={trade.side === "BUY" ? "default" : "secondary"} className={`text-xs ${trade.side === "BUY" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
                    {trade.side}
                  </Badge>
                  <Badge variant={trade.status === 'open' ? 'default' : trade.status === 'closed' ? 'secondary' : 'outline'} className="text-xs">
                    {trade.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry:</span>
                  <span className="font-mono text-foreground">{formatPrice(trade.entry_price, 4, '$')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exit:</span>
                  <span className="font-mono text-foreground">{trade.exit_price ? formatPrice(trade.exit_price, 4, '$') : '-'}</span>
                </div>
              </div>
              {trade.realized_pnl !== null && (
                <div className={`flex items-center gap-1 text-sm font-semibold font-mono ${trade.realized_pnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {trade.realized_pnl >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {trade.realized_pnl >= 0 ? '+' : ''}{formatPrice(trade.realized_pnl, 2, '$')}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-sm text-muted-foreground border-b border-border">
              <th className="text-left py-2 px-2">
                <button onClick={() => handleSort('symbol')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Pair <SortIcon column="symbol" />
                </button>
              </th>
              <th className="text-left py-2 px-2">
                <button onClick={() => handleSort('strategy_name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Strategy <SortIcon column="strategy_name" />
                </button>
              </th>
              <th className="text-left py-2 px-2">
                <button onClick={() => handleSort('side')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Type <SortIcon column="side" />
                </button>
              </th>
              <th className="text-right py-2 px-2">Entry</th>
              <th className="text-right py-2 px-2">Exit</th>
              <th className="text-right py-2 px-2">Stop Loss</th>
              <th className="text-right py-2 px-2">Take Profit</th>
              <th className="text-right py-2 px-2">Quantity</th>
              <th className="text-right py-2 px-2">
                <button onClick={() => handleSort('profit_loss')} className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto">
                  P&L <SortIcon column="profit_loss" />
                </button>
              </th>
              <th className="text-left py-2 px-2">
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Status <SortIcon column="status" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-muted-foreground">Loading trade data...</td>
              </tr>
            ) : paginatedTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-muted-foreground">No trades found</td>
              </tr>
            ) : (
              paginatedTrades.map((trade) => (
                <tr key={trade.id} className="text-sm border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${trade.side === "BUY" ? "bg-success" : "bg-danger"}`} />
                      <span className="font-semibold text-foreground">{trade.symbol.replace('USDT', '/USDT')}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    {trade.is_hedge || trade.strategy_name?.startsWith('Hedge:') ? (
                      <Badge variant="outline" className="gap-1 text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                        <Layers className="h-3 w-3" />
                        {trade.strategy_name || 'Hedge'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">{trade.strategy_name || 'Unknown'}</Badge>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant={trade.side === "BUY" ? "default" : "secondary"} className={`text-xs ${trade.side === "BUY" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-foreground">{formatPrice(trade.entry_price, 4, '$')}</td>
                  <td className="py-3 px-2 text-right font-mono text-foreground">{trade.exit_price ? formatPrice(trade.exit_price, 4, '$') : '-'}</td>
                  <td className="py-3 px-2 text-right font-mono text-red-500">{trade.stop_loss ? formatPrice(trade.stop_loss, 4, '$') : '-'}</td>
                  <td className="py-3 px-2 text-right font-mono text-green-500">{trade.take_profit ? formatPrice(trade.take_profit, 4, '$') : '-'}</td>
                  <td className="py-3 px-2 text-right font-mono text-muted-foreground">{formatQuantity(trade.quantity, 4)}</td>
                  <td className="py-3 px-2 text-right">
                    {trade.realized_pnl !== null ? (
                      <div className={`flex items-center justify-end gap-1 font-semibold font-mono ${trade.realized_pnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {trade.realized_pnl >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {trade.realized_pnl >= 0 ? '+' : ''}{formatPrice(trade.realized_pnl, 2, '$')}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant={trade.status === 'open' ? 'default' : trade.status === 'closed' ? 'secondary' : 'outline'} className="text-xs">
                      {trade.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredTrades.length)} of {filteredTrades.length} trades
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
