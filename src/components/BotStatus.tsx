import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, RotateCcw, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRiskParametersContext } from "@/contexts/RiskParametersContext";
import { useToast } from "@/hooks/use-toast";
import { useLiveTrend } from "@/hooks/useLiveTrend";
import { useSymbolsContext } from "@/contexts/SymbolsContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const StatusRow = ({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) => (
  <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
    <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    <span className={cn("text-xs font-semibold font-mono text-right", valueClass)}>{value}</span>
  </div>
);

export const BotStatus = () => {
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const { toast } = useToast();
  const { activeSymbols, symbols } = useSymbolsContext();
  const { user } = useAuth();
  const [selectedCrypto, setSelectedCrypto] = useState("");
  
  useEffect(() => {
    if (activeSymbols.length > 0 && !selectedCrypto) {
      setSelectedCrypto(activeSymbols[0]);
    }
  }, [activeSymbols]);

  const currentSymbol = selectedCrypto || activeSymbols[0] || "";
  const { trendData, loading: trendLoading } = useLiveTrend(currentSymbol, 60000);

  const { data: currentRegime } = useQuery({
    queryKey: ['current-regime', user?.id, currentSymbol],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_regime_history')
        .select('regime, effective_regime, adx, adx_slope, trend_direction, recorded_at')
        .eq('symbol', currentSymbol)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!currentSymbol,
    refetchInterval: 60000,
    staleTime: 55000,
  });

  const cryptoOptions = symbols
    .filter(s => s.is_active)
    .map(s => ({ value: s.symbol, label: s.display_name }));

  const active = riskParams?.is_trading_enabled ?? false;

  const handleToggle = async () => {
    try {
      const newState = !active;
      await updateRiskParameters({ is_trading_enabled: newState });
      toast({
        title: newState ? "Bot Started" : "Bot Stopped",
        description: newState ? "Trading bot is now active" : "Trading bot has been stopped",
        variant: newState ? "default" : "destructive",
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update bot status", variant: "destructive" });
    }
  };

  const handleReset = async () => {
    try {
      await updateRiskParameters({ consecutive_losses: 0, current_open_trades: 0 });
      toast({ title: "Bot Reset", description: "Bot counters have been reset" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset bot", variant: "destructive" });
    }
  };

  const regimeLabel = currentRegime
    ? (currentRegime.effective_regime || currentRegime.regime).replace(/_/g, " ")
    : "No Data";

  const trendLabel = trendData
    ? `${trendData.trend.charAt(0).toUpperCase() + trendData.trend.slice(1)} (${trendData.confidence}%)`
    : "No Data";

  return (
    <Card className="h-full p-4 border-border">
      <div className="space-y-3">
        {/* Header with status dot */}
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-foreground">Bot Status</h3>
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", active ? "bg-profit" : "bg-muted-foreground")} />
            <span className={cn("text-xs font-semibold uppercase tracking-wider", active ? "text-foreground" : "text-muted-foreground")}>
              {active ? "RUNNING" : "STOPPED"}
            </span>
          </div>
        </div>

        {/* Symbol selector */}
        <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cryptoOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status rows — clean, dense */}
        <div className="px-1">
          <StatusRow label="Exchange" value="Binance" />
          <StatusRow
            label="Mode"
            value={riskParams?.paper_trading_mode ? "Paper" : "Live"}
            valueClass={riskParams?.paper_trading_mode ? "text-warning" : "text-loss"}
          />
          <StatusRow
            label="Regime"
            value={
              <div className="flex items-center gap-1">
                <span>{regimeLabel}</span>
                {currentRegime?.effective_regime && currentRegime.regime !== currentRegime.effective_regime && (
                  <span className="text-warning" title={`Raw: ${currentRegime.regime}`}>⚠</span>
                )}
              </div>
            }
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <StatusRow
                    label="Market Bias"
                    value={
                      trendLoading ? "Loading..." : (
                        <span className={cn(
                          trendData?.trend === "bullish" ? "text-profit" :
                          trendData?.trend === "bearish" ? "text-loss" : "text-muted-foreground"
                        )}>
                          {trendLabel}
                        </span>
                      )
                    }
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-1.5 text-[10px]">
                  <p className="font-semibold text-xs">Technical Indicators (1m):</p>
                  {trendData?.indicators ? (
                    <>
                      <div>EMA: 12={trendData.indicators.ema12 ?? 'N/A'}, 26={trendData.indicators.ema26 ?? 'N/A'} ({trendData.indicators.emaSignal ?? 'N/A'})</div>
                      <div>RSI: {trendData.indicators.rsi ?? 'N/A'} ({trendData.indicators.rsiSignal ?? 'N/A'})</div>
                      <div>MACD: {trendData.indicators.macd?.toFixed(2) ?? 'N/A'} / Signal: {trendData.indicators.macdSignal?.toFixed(2) ?? 'N/A'}</div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No indicator data</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Action buttons — Stop=red outline, Reset=ghost */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            onClick={handleToggle}
            size="sm"
            variant={active ? "outline" : "default"}
            className={cn(
              "w-full text-xs h-8",
              active ? "border-loss text-loss hover:bg-loss/10" : "bg-profit hover:bg-profit/90 text-primary-foreground"
            )}
          >
            {active ? <><Pause className="h-3 w-3 mr-1.5" />Stop</> : <><Play className="h-3 w-3 mr-1.5" />Start</>}
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-xs h-8 text-muted-foreground" onClick={handleReset}>
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
};
