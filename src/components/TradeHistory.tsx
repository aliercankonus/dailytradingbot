import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export const TradeHistory = () => {
  const trades = [
    {
      pair: "BTC/USDT",
      type: "BUY",
      price: "$43,521.30",
      amount: "0.0234",
      profit: "+$125.43",
      time: "2 min ago",
      isProfit: true,
    },
    {
      pair: "ETH/USDT",
      type: "SELL",
      price: "$2,284.50",
      amount: "0.5100",
      profit: "+$87.22",
      time: "5 min ago",
      isProfit: true,
    },
    {
      pair: "SOL/USDT",
      type: "BUY",
      price: "$98.45",
      amount: "12.400",
      profit: "-$23.10",
      time: "8 min ago",
      isProfit: false,
    },
    {
      pair: "BNB/USDT",
      type: "SELL",
      price: "$312.80",
      amount: "3.2100",
      profit: "+$54.60",
      time: "12 min ago",
      isProfit: true,
    },
    {
      pair: "ADA/USDT",
      type: "BUY",
      price: "$0.5234",
      amount: "1850.00",
      profit: "+$32.15",
      time: "15 min ago",
      isProfit: true,
    },
  ];

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
            {trades.map((trade, idx) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
