import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { useToast } from "@/hooks/use-toast";
import { useLiveTrend } from "@/hooks/useLiveTrend";
import { useSymbols } from "@/hooks/useSymbols";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const BotStatus = () => {
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const { toast } = useToast();
  const { activeSymbols, symbols } = useSymbols();
  const [selectedCrypto, setSelectedCrypto] = useState("");
  
  // Set default to first active symbol when available
  useEffect(() => {
    if (activeSymbols.length > 0 && !selectedCrypto) {
      setSelectedCrypto(activeSymbols[0]);
    }
  }, [activeSymbols]);
  
  const { trendData, loading: trendLoading } = useLiveTrend(selectedCrypto || activeSymbols[0] || "", 60000);

  const cryptoOptions = symbols
    .filter(s => s.is_active)
    .map(s => ({
      value: s.symbol,
      label: s.display_name
    }));

  const active = riskParams?.is_trading_enabled ?? false;

  const handleToggle = async () => {
    try {
      const newState = !active;
      await updateRiskParameters({ is_trading_enabled: newState });
      toast({
        title: newState ? "Bot Started" : "Bot Stopped",
        description: newState ? "Trading bot is now active and monitoring for signals" : "Trading bot has been stopped",
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
        current_open_trades: 0,
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
          <div className={cn("h-3 w-3 rounded-full", active ? "bg-success animate-pulse" : "bg-muted")} />
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

          <TooltipProvider>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Market Trend:</span>
                <Tooltip>
                  <TooltipTrigger>
                    <Activity className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold">Technical Indicators (1m candles):</p>
                      {trendData && (
                        <>
                          <div>
                            <span className="font-medium">EMA:</span> 12={trendData.indicators.ema12}, 26=
                            {trendData.indicators.ema26} ({trendData.indicators.emaSignal})
                          </div>
                          <div>
                            <span className="font-medium">RSI:</span> {trendData.indicators.rsi} (
                            {trendData.indicators.rsiSignal})
                          </div>
                          <div>
                            <span className="font-medium">MACD:</span> {trendData.indicators.macd.toFixed(2)} / Signal:{" "}
                            {trendData.indicators.macdSignal.toFixed(2)} ({trendData.indicators.macdTrend})
                          </div>
                        </>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              {trendLoading ? (
                <Badge variant="secondary" className="animate-pulse">
                  Loading...
                </Badge>
              ) : trendData ? (
                <Badge
                  variant={
                    trendData.trend === "bullish"
                      ? "default"
                      : trendData.trend === "bearish"
                        ? "destructive"
                        : "secondary"
                  }
                  className="font-medium"
                >
                  {trendData.trend === "bullish" && <TrendingUp className="h-3 w-3 mr-1" />}
                  {trendData.trend === "bearish" && <TrendingDown className="h-3 w-3 mr-1" />}
                  {trendData.trend === "neutral" && <Minus className="h-3 w-3 mr-1" />}
                  {trendData.trend.charAt(0).toUpperCase() + trendData.trend.slice(1)} ({trendData.confidence}%)
                </Badge>
              ) : (
                <Badge variant="secondary">No Data</Badge>
              )}
            </div>
          </TooltipProvider>
        </div>

        <div className="py-4 text-center border-y border-border">
          <div className={cn("text-3xl font-bold mb-2", active ? "text-success" : "text-muted-foreground")}>
            {active ? "ACTIVE" : "STOPPED"}
          </div>
          <p className="text-sm text-muted-foreground">{active ? "Bot is trading" : "Bot is paused"}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            onClick={handleToggle}
            className={cn(
              "w-full transition-all",
              active ? "bg-danger hover:bg-danger/90" : "bg-success hover:bg-success/90",
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
          <Button variant="outline" className="w-full border-border hover:bg-secondary" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
};
