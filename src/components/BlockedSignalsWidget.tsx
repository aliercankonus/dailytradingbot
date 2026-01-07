import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBlockedSignals } from "@/hooks/useBlockedSignals";
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Activity, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const getRejectionCategory = (reason: string): { label: string; color: string; icon: React.ReactNode } => {
  const lowerReason = reason.toLowerCase();
  
  if (lowerReason.includes("symbol disabled")) {
    return { label: "Symbol Filter", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <Ban className="h-3 w-3" /> };
  }
  if (lowerReason.includes("adx")) {
    return { label: "ADX", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <Activity className="h-3 w-3" /> };
  }
  if (lowerReason.includes("stoch") || lowerReason.includes("rsi")) {
    return { label: "StochRSI", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: <TrendingDown className="h-3 w-3" /> };
  }
  if (lowerReason.includes("regime") || lowerReason.includes("ranging")) {
    return { label: "Regime", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Ban className="h-3 w-3" /> };
  }
  if (lowerReason.includes("reversal")) {
    return { label: "Reversal", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <AlertTriangle className="h-3 w-3" /> };
  }
  if (lowerReason.includes("quality") || lowerReason.includes("confidence")) {
    return { label: "Quality", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: <TrendingUp className="h-3 w-3" /> };
  }
  if (lowerReason.includes("squeeze")) {
    return { label: "Squeeze", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: <Activity className="h-3 w-3" /> };
  }
  if (lowerReason.includes("quiet")) {
    return { label: "Quiet Trend", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <TrendingDown className="h-3 w-3" /> };
  }
  
  return { label: "Gate", color: "bg-muted text-muted-foreground border-border", icon: <Ban className="h-3 w-3" /> };
};

export function BlockedSignalsWidget() {
  const { data: blockedSignals, isLoading, error } = useBlockedSignals(15);

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            Blocked Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            Blocked Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">Error loading blocked signals</div>
        </CardContent>
      </Card>
    );
  }

  const signals = blockedSignals || [];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            Blocked Signals
          </span>
          <Badge variant="outline" className="text-xs">
            {signals.length} recent
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          {signals.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No blocked signals yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {signals.map((signal) => {
                const category = getRejectionCategory(signal.rejection_reason);
                const timeAgo = formatDistanceToNow(new Date(signal.checked_at), { addSuffix: true });
                const filters = signal.filters_status;
                
                return (
                  <div key={signal.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {signal.symbol.replace("USDT", "")}
                        </span>
                        <Badge variant="outline" className={`text-xs ${category.color} flex items-center gap-1`}>
                          {category.icon}
                          {category.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo}
                      </span>
                    </div>
                    
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                      {signal.rejection_reason}
                    </p>
                    
                    {filters && (
                      <div className="flex flex-wrap gap-1.5">
                        {/* Show win rate stats for symbol filter blocks */}
                        {filters.filterType === 'symbol_performance' ? (
                          <>
                            <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono">
                              WinRate:{typeof filters.winRate === 'number' ? filters.winRate.toFixed(1) : '?'}%
                            </span>
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                              {filters.wins ?? 0}W/{filters.losses ?? 0}L
                            </span>
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {filters.strategiesCount ?? 0} strategies
                            </span>
                          </>
                        ) : (
                          <>
                            {typeof filters.adx === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                ADX:{filters.adx.toFixed(1)}
                              </span>
                            )}
                            {typeof filters.stochRsiK4h === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                K4h:{filters.stochRsiK4h.toFixed(0)}
                              </span>
                            )}
                            {filters.trend4h && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                4h:{filters.trend4h}
                              </span>
                            )}
                            {typeof filters.priceMove === 'number' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                Move:{filters.priceMove.toFixed(1)}%
                              </span>
                            )}
                            {typeof filters.squeeze === 'boolean' && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                Squeeze:{filters.squeeze ? "Yes" : "No"}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
