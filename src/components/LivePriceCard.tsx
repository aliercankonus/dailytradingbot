import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";
import { useSymbols } from "@/hooks/useSymbols";
import { useEffect, useState } from "react";

export const LivePriceCard = () => {
  const { prices, connected } = useRealtimePrices();
  const { activeSymbols, loading: symbolsLoading } = useSymbols();
  const [displayPrices, setDisplayPrices] = useState<any[]>([]);

  useEffect(() => {
    // Filter prices to only show active symbols
    const priceArray = Array.from(prices.values())
      .filter(price => activeSymbols.includes(price.symbol))
      .slice(0, 10);
    setDisplayPrices(priceArray);
  }, [prices, activeSymbols]);

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Live Market Prices</h3>
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-muted'}`} />
      </div>

      <div className="space-y-3">
        {symbolsLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading symbols...
          </div>
        ) : activeSymbols.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No active trading symbols. Go to Symbols page to activate trading pairs.
          </div>
        ) : displayPrices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {connected ? 'Waiting for price updates...' : 'Connecting to market...'}
          </div>
        ) : (
          displayPrices.map((price) => {
            const isPositive = parseFloat(price.priceChangePercent) >= 0;
            return (
              <div
                key={price.symbol}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${isPositive ? 'bg-profit' : 'bg-loss'}`} />
                  <span className="font-semibold text-foreground">
                    {price.symbol.replace('USDT', '/USDT')}
                  </span>
                </div>

                <div className="text-right">
                  <div className="font-mono font-semibold text-foreground">
                    ${parseFloat(price.price).toFixed(4)}
                  </div>
                  <div className={`text-sm flex items-center justify-end gap-1 ${
                    isPositive ? 'text-profit' : 'text-loss'
                  }`}>
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {parseFloat(price.priceChangePercent).toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};
