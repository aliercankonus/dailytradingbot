import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { useToast } from "@/hooks/use-toast";
import { useSignals } from "@/hooks/useSignals";

export const BotStatus = () => {
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const { toast } = useToast();
  const { signals } = useSignals();
  const [selectedCrypto, setSelectedCrypto] = useState("BTCUSDT");

  const currentTrend = useMemo(() => {
    // Filter signals for the selected trading pair
    const pairSignals = signals.filter(signal => signal.symbol === selectedCrypto);
    
    if (pairSignals.length === 0) return { trend: 'neutral', count: 0 };
    
    const trendCounts = pairSignals.reduce((acc, signal) => {
      const trend = signal.trend.toLowerCase();
      acc[trend] = (acc[trend] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantTrend = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0];
    return { trend: dominantTrend[0], count: dominantTrend[1] };
  }, [signals, selectedCrypto]);

  const cryptoOptions = [
    { value: "BTCUSDT", label: "BTC/USDT" },
    { value: "ETHUSDT", label: "ETH/USDT" },
    { value: "BNBUSDT", label: "BNB/USDT" },
    { value: "ADAUSDT", label: "ADA/USDT" },
    { value: "SOLUSDT", label: "SOL/USDT" },
  ];

  const active = riskParams?.is_trading_enabled ?? false;

  const handleToggle = async () => {
    try {
      const newState = !active;
      await updateRiskParameters({ is_trading_enabled: newState });
      toast({
        title: newState ? "Bot Started" : "Bot Stopped",
        description: newState 
          ? "Trading bot is now active and monitoring for signals" 
          : "Trading bot has been stopped",
        variant: newState ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update bot status",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    try {
      await updateRiskParameters({ 
        consecutive_losses: 0,
        current_open_trades: 0 
      });
      toast({
        title: "Bot Reset",
        description: "Bot counters have been reset",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset bot",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="h-full p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Bot Status</h3>
          <div className={cn(
            "h-3 w-3 rounded-full",
            active ? "bg-success animate-pulse" : "bg-muted"
          )} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Trading Pair</label>
            <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cryptoOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <span className="text-sm text-muted-foreground">Trading Mode:</span>
            <Badge variant={riskParams?.paper_trading_mode ? "secondary" : "destructive"}>
              {riskParams?.paper_trading_mode ? "Paper Trading" : "Live Trading"}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <span className="text-sm text-muted-foreground">Market Trend:</span>
            <Badge 
              variant={
                currentTrend.trend === 'bullish' ? 'default' : 
                currentTrend.trend === 'bearish' ? 'destructive' : 
                'secondary'
              }
              className="font-medium"
            >
              {currentTrend.trend === 'bullish' && <TrendingUp className="h-3 w-3 mr-1" />}
              {currentTrend.trend === 'bearish' && <TrendingDown className="h-3 w-3 mr-1" />}
              {currentTrend.trend === 'neutral' && <Minus className="h-3 w-3 mr-1" />}
              {currentTrend.trend.charAt(0).toUpperCase() + currentTrend.trend.slice(1)}
              {currentTrend.count > 0 && ` (${currentTrend.count})`}
            </Badge>
          </div>
        </div>

        <div className="py-4 text-center border-y border-border">
          <div className={cn(
            "text-3xl font-bold mb-2",
            active ? "text-success" : "text-muted-foreground"
          )}>
            {active ? "ACTIVE" : "STOPPED"}
          </div>
          <p className="text-sm text-muted-foreground">
            {active ? "Bot is trading" : "Bot is paused"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button 
            onClick={handleToggle}
            className={cn(
              "w-full transition-all",
              active 
                ? "bg-danger hover:bg-danger/90" 
                : "bg-success hover:bg-success/90"
            )}
          >
            {active ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            className="w-full border-border hover:bg-secondary"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
};
