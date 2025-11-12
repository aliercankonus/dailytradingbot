import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTrades } from "@/hooks/useTrades";

export const TradeHistory = () => {
  const { trades, loading } = useTrades();

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Trades</h3>
        <Badge variant="secondary" className="text-xs">Live</Badge>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-sm text-muted-foreground border-b border-border">
              <th className="text-left py-2 px-2">Pair</th>
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
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading trade data...
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No trades executed yet
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
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
