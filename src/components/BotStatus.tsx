import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRiskParameters } from "@/hooks/useRiskParameters";

interface BotStatusProps {
  active: boolean;
  onToggle: () => void;
}

export const BotStatus = ({ active, onToggle }: BotStatusProps) => {
  const { riskParams } = useRiskParameters();
  const [selectedCrypto, setSelectedCrypto] = useState("BTCUSDT");

  const cryptoOptions = [
    { value: "BTCUSDT", label: "BTC/USDT" },
    { value: "ETHUSDT", label: "ETH/USDT" },
    { value: "BNBUSDT", label: "BNB/USDT" },
    { value: "ADAUSDT", label: "ADA/USDT" },
    { value: "SOLUSDT", label: "SOL/USDT" },
  ];

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-lg">
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
            onClick={onToggle}
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
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
};
