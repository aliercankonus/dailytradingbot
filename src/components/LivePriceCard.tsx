import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { useSymbolsContext } from "@/contexts/SymbolsContext";
import { useEffect, useState } from "react";
import { WebSocketStatus } from "@/components/WebSocketStatus";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, formatPercent } from "@/lib/utils";

export const LivePriceCard = () => {
  const { activeSymbols, loading: symbolsLoading } = useSymbolsContext();
  const { prices, priceVersion, connected, error } = useRealtimePricesContext();
  const [displayPrices, setDisplayPrices] = useState<any[]>([]);
  const { toast } = useToast();

  // Convert Map to array whenever prices change - use priceVersion to force updates
  useEffect(() => {
    const allPrices = Array.from(prices.values());
    const priceArray = allPrices
      .filter((price) =>
        activeSymbols.length > 0 ? activeSymbols.includes(price.symbol) : true
      )
      .slice(0, 10);
    console.log('[LivePriceCard] Updating display prices, version:', priceVersion, 'total:', allPrices.length, 'shown:', priceArray.length);
    setDisplayPrices(priceArray);
  }, [prices, priceVersion, activeSymbols]);

  // Show toast when connection error occurs
  useEffect(() => {
    if (error && error.includes('Unable to connect')) {
      toast({
        title: "Connection Issue",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <Card className="p-4 border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-foreground">Live Market Prices</h3>
        <WebSocketStatus connected={connected} error={error} showText={true} />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
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
                className="flex items-center justify-between py-2 px-2.5 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${isPositive ? 'bg-profit' : 'bg-loss'}`} />
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {price.symbol.replace('USDT', '/USDT')}
                  </span>
                </div>

                <div className="text-right">
                  <div className="font-mono text-xs font-bold text-foreground">
                    {formatPrice(parseFloat(price.price), 4, '$')}
                  </div>
                  <div className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${
                    isPositive ? 'text-profit' : 'text-loss'
                  }`}>
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {formatPercent(parseFloat(price.priceChangePercent))}
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
