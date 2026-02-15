import { useRiskParameters } from "@/hooks/useRiskParameters";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { cn } from "@/lib/utils";

export const SystemStatusStrip = () => {
  const { riskParams } = useRiskParameters();
  const { connected } = useRealtimePricesContext();

  const isPaper = riskParams?.paper_trading_mode ?? true;
  const isActive = riskParams?.is_trading_enabled ?? false;

  return (
    <div className="border-b border-border bg-background/80 px-4 sm:px-6">
      <div className="container mx-auto flex items-center justify-between h-7 text-[11px] font-mono text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Exchange: <span className="text-foreground">Binance</span></span>
          <span className="hidden sm:inline">
            Env: <span className={cn(
              "font-semibold uppercase",
              isPaper ? "text-warning" : "text-loss"
            )}>{isPaper ? "PAPER" : "LIVE"}</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">
            Bot: <span className={cn(
              "font-semibold uppercase",
              isActive ? "text-profit" : "text-muted-foreground"
            )}>{isActive ? "RUNNING" : "STOPPED"}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-profit" : "bg-loss"
            )} />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
