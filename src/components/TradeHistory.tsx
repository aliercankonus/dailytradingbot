import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Filter, Loader2 } from "lucide-react";
import { useTrades } from "@/hooks/useTrades";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";

export const TradeHistory = () => {
  const { trades, loading } = useTrades();
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");

  const strategies = useMemo(() => {
    const uniqueStrategies = new Set(trades.map(t => t.strategy_name || 'Unknown'));
    return Array.from(uniqueStrategies);
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (selectedStrategy === "all") return trades;
    return trades.filter(t => (t.strategy_name || 'Unknown') === selectedStrategy);
  }, [trades, selectedStrategy]);

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
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
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-sm text-muted-foreground border-b border-border">
              <th className="text-left py-2 px-2">Pair</th>
              <th className="text-left py-2 px-2">Strategy</th>
              <th className="text-left py-2 px-2">Type</th>
              <th className="text-right py-2 px-2">Entry</th>
              <th className="text-right py-2 px-2">Exit</th>
              <th className="text-right py-2 px-2">Quantity</th>
              <th className="text-right py-2 px-2">P&L</th>
              <th className="text-left py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading trade data...
                </td>
              </tr>
            ) : filteredTrades.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">
                  No trades executed yet
                </td>
              </tr>
            ) : (
              filteredTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className="text-sm border-b border-border/50 hover:bg-secondary/30 transition-colors"
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        trade.side === "BUY" ? "bg-success" : "bg-danger"
                      }`} />
                      <span className="font-semibold text-foreground">
                        {trade.symbol.replace('USDT', '/USDT')}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant="outline" className="text-xs">
                      {trade.strategy_name || 'Unknown'}
                    </Badge>
                  </td>
                  <td className="py-3 px-2">
                    <Badge
                      variant={trade.side === "BUY" ? "default" : "secondary"}
                      className={`text-xs ${
                        trade.side === "BUY" 
                          ? "bg-success/20 text-success" 
                          : "bg-danger/20 text-danger"
                      }`}
                    >
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-foreground">
                    ${trade.entry_price.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-foreground">
                    {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-muted-foreground">
                    {trade.quantity.toFixed(4)}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {trade.profit_loss !== null ? (
                      <div className={`flex items-center justify-end gap-1 font-semibold font-mono ${
                        trade.profit_loss >= 0 ? "text-profit" : "text-loss"
                      }`}>
                        {trade.profit_loss >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <Badge 
                      variant={trade.status === 'open' ? 'default' : trade.status === 'closed' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {trade.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
