import { useRiskParametersContext } from "@/contexts/RiskParametersContext";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const BotStatusBanner = () => {
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const { toast } = useToast();

  const isActive = riskParams?.is_trading_enabled ?? false;
  const isPaperTrading = riskParams?.paper_trading_mode ?? true;

  const handleToggle = async (checked: boolean) => {
    try {
      await updateRiskParameters({ is_trading_enabled: checked });
      toast({
        title: checked ? "Bot Activated" : "Bot Deactivated",
        description: checked 
          ? "Trading bot is now monitoring markets and executing signals" 
          : "Trading bot has been stopped and will not execute new trades",
        variant: checked ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update bot status",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg border transition-all duration-300",
      isActive 
        ? "bg-gradient-to-r from-success/10 via-success/5 to-background border-success/20" 
        : "bg-gradient-to-r from-muted/50 to-background border-border"
    )}>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Status Info */}
          <div className="flex items-center gap-4">
            <div className={cn(
              "relative flex h-12 w-12 items-center justify-center rounded-full",
              isActive ? "bg-success/20" : "bg-muted"
            )}>
              <Activity className={cn(
                "h-6 w-6 transition-all",
                isActive ? "text-success animate-pulse" : "text-muted-foreground"
              )} />
              {isActive && (
                <span className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Trading Bot
                </h3>
                <Badge 
                  variant={isActive ? "default" : "secondary"}
                  className={cn(
                    "font-medium",
                    isActive && "bg-success text-success-foreground"
                  )}
                >
                  {isActive ? "ACTIVE" : "STOPPED"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {isActive 
                  ? `Bot is monitoring markets and executing ${isPaperTrading ? "paper" : "live"} trades`
                  : "Bot is paused - enable to start trading"
                }
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-3 ml-auto">
            {!isActive && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Bot is disabled</span>
              </div>
            )}
            <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-full border border-border">
              <span className={cn(
                "text-sm font-medium transition-colors",
                !isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                Off
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={handleToggle}
                className="data-[state=checked]:bg-success"
              />
              <span className={cn(
                "text-sm font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                On
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
