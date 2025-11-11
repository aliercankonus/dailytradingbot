import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMarketData } from "@/hooks/useMarketData";
import { useEffect, useState } from "react";

interface Trade {
  pair: string;
  type: string;
  price: string;
  amount: string;
  profit: string;
  time: string;
  isProfit: boolean;
}

export const TradeHistory = () => {
  const { data: marketData } = useMarketData();
  const [trades, setTrades] = useState<Trade[]>([]);

  // Generate simulated trades based on real market data
  useEffect(() => {
    if (marketData && marketData.length > 0) {
      const simulatedTrades: Trade[] = marketData.slice(0, 5).map((ticker, idx) => {
        const price = parseFloat(ticker.lastPrice);
        const isProfit = Math.random() > 0.3; // 70% win rate
        const type = idx % 2 === 0 ? "BUY" : "SELL";
        
        const profit = (price * 0.001 * (isProfit ? 1 : -1) * (Math.random() * 2 + 1)).toFixed(2);
        const amount = (Math.random() * 5 + 0.1).toFixed(4);
        
        return {
          pair: ticker.symbol.replace('USDT', '/USDT'),
          type,
          price: `$${price.toFixed(2)}`,
          amount,
          profit: `${isProfit ? '+' : '-'}$${Math.abs(parseFloat(profit)).toFixed(2)}`,
          time: `${(idx + 1) * 3} min ago`,
          isProfit,
        };
      });
      
      setTrades(simulatedTrades);
    }
  }, [marketData]);

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
              <th className="text-right py-2 px-2">Price</th>
              <th className="text-right py-2 px-2">Amount</th>
              <th className="text-right py-2 px-2">P&L</th>
              <th className="text-right py-2 px-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading trade data...
                </td>
              </tr>
            ) : (
              trades.map((trade, idx) => (
                <tr
                  key={idx}
                  className="text-sm border-b border-border/50 hover:bg-secondary/30 transition-colors"
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        trade.type === "BUY" ? "bg-success" : "bg-danger"
                      }`} />
                      <span className="font-semibold text-foreground">{trade.pair}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <Badge
                      variant={trade.type === "BUY" ? "default" : "secondary"}
                      className={`text-xs ${
                        trade.type === "BUY" 
                          ? "bg-success/20 text-success" 
                          : "bg-danger/20 text-danger"
                      }`}
                    >
                      {trade.type}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-foreground">
                    {trade.price}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-muted-foreground">
                    {trade.amount}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className={`flex items-center justify-end gap-1 font-semibold font-mono ${
                      trade.isProfit ? "text-profit" : "text-loss"
                    }`}>
                      {trade.isProfit ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {trade.profit}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right text-muted-foreground text-xs">
                    {trade.time}
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
