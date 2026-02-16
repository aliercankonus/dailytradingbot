import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useMomentumStatus } from "@/hooks/useMomentumStatus";
import { useState } from "react";

const getMomentumBadge = (state: string) => {
  switch (state) {
    case "confirmed":
      return (
        <Badge className="bg-green-500 hover:bg-green-600 px-2 py-0.5">
          <CheckCircle className="h-3 w-3 mr-1" />
          Confirmed
        </Badge>
      );
    case "exhausted":
      return (
        <Badge className="bg-orange-600 hover:bg-orange-700 px-2 py-0.5">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Exhausted
        </Badge>
      );
    case "building":
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600 px-2 py-0.5">
          <Activity className="h-3 w-3 mr-1" />
          Building
        </Badge>
      );
    case "mixed":
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 px-2 py-0.5">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Mixed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="px-2 py-0.5">
          <XCircle className="h-3 w-3 mr-1" />
          None
        </Badge>
      );
  }
};

const getTrendIcon = (trend: string) => {
  if (trend === "bullish") return <TrendingUp className="h-3 w-3" />;
  if (trend === "bearish") return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
};

const getMomentumEmoji = (state: string) => {
  switch (state) {
    case "confirmed": return "🟢";
    case "building": return "🔵";
    case "exhausted": return "🟠";
    case "mixed": return "🟡";
    default: return "⚪";
  }
};

const getSummaryText = (data: any) => {
  const { momentum, higherTimeframeFilter, trend } = data;
  const state = momentum?.state ?? "none";
  const adx = momentum?.adx ?? 0;
  const aligned = higherTimeframeFilter?.aligned ?? false;

  if (state === "confirmed") return `Full momentum confirmed — ADX ${adx.toFixed(1)}, HTF aligned`;
  if (state === "building") return `Momentum building — ADX ${adx.toFixed(1)}${aligned ? ", HTF aligned" : ""}`;
  if (state === "exhausted") return `Trend exhaustion detected — ADX ${adx.toFixed(1)}`;
  if (state === "mixed") return `Mixed signals — ADX ${adx.toFixed(1)}, partial alignment`;
  return `No momentum — ADX ${adx.toFixed(1)}`;
};

export const MomentumStatusDetails = () => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const { momentumData, loading } = useMomentumStatus();

  const toggleItem = (symbol: string) => {
    setOpenItems(prev => ({ ...prev, [symbol]: !prev[symbol] }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          Momentum Status Details
        </CardTitle>
        <CardDescription>
          <strong>Confirmed:</strong> Full conditions met (ADX≥22). <strong>Building:</strong> Aligned 4h+1h (ADX≥15). <strong>Exhausted:</strong> Late-trend warning. <strong>Mixed/None:</strong> Insufficient.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading momentum data...</p>
        ) : (
          <div className="space-y-2">
            {momentumData.map((data) => {
              if (data.error) {
                return (
                  <div key={data.symbol} className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{data.symbol}</span>
                      <Badge variant="destructive" className="px-2 py-0.5">Error</Badge>
                      <span className="text-xs text-destructive">{data.error}</span>
                    </div>
                  </div>
                );
              }

              const { momentum, higherTimeframeFilter, multiTimeframe, trend } = data;
              const confirms = momentum?.confirms ?? false;
              const momentumState = momentum?.state ?? "none";
              const lastCloseAligns = momentum?.lastCloseAlignsWithTrend ?? false;
              const noDivergence = !(momentum?.hasDivergence ?? false);
              const macdDirectionOK = momentum?.macdDirectionAligned ?? false;
              const macdExpandingOK = momentum?.macdExpanding ?? false;
              const macdOK = macdDirectionOK && macdExpandingOK;
              const adxValue = momentum?.adx ?? 0;
              const adxConfirmed = adxValue >= 22;
              const adxBuilding = adxValue >= 15;
              const adxOK = momentumState === "confirmed" || momentumState === "exhausted"
                ? adxConfirmed
                : adxBuilding;
              const volumeConfirms = momentum?.volumeConfirms ?? false;
              const isOpen = openItems[data.symbol] ?? false;

              return (
                <Collapsible key={data.symbol} open={isOpen} onOpenChange={() => toggleItem(data.symbol)}>
                  <CollapsibleTrigger asChild>
                    <div
                      className={`rounded-lg border cursor-pointer transition-colors hover:bg-muted/30 ${
                        confirms
                          ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                          : "bg-muted/10 border-border"
                      }`}
                    >
                      {/* Desktop summary */}
                      <div className="hidden sm:flex items-center px-4 py-3 gap-4">
                        <div className="flex items-center gap-3 min-w-[140px] shrink-0">
                          <span className="text-base">{getMomentumEmoji(momentumState)}</span>
                          <span className="font-semibold text-sm">{data.symbol}</span>
                          {getMomentumBadge(momentumState)}
                        </div>

                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {getSummaryText(data)}
                        </span>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            ADX <span className={`font-medium ${adxOK ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                              {adxValue.toFixed(1)}
                            </span>
                          </span>
                          <Badge
                            variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "secondary"}
                            className={`text-[10px] px-1.5 py-0 ${trend === "ranging" ? "bg-slate-600 text-white dark:bg-slate-500" : ""}`}
                          >
                            {getTrendIcon(trend ?? "unknown")}
                            <span className="ml-1">{trend ?? "?"}</span>
                          </Badge>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {/* Mobile summary */}
                      <div className="flex sm:hidden flex-col px-3 py-2.5 gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{getMomentumEmoji(momentumState)}</span>
                            <span className="font-semibold text-sm">{data.symbol}</span>
                            {getMomentumBadge(momentumState)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "secondary"}
                              className={`text-[10px] px-1.5 py-0 ${trend === "ranging" ? "bg-slate-600 text-white dark:bg-slate-500" : ""}`}
                            >
                              {getTrendIcon(trend ?? "unknown")}
                              <span className="ml-1">{trend ?? "?"}</span>
                            </Badge>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{getSummaryText(data)}</span>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className={`mx-1 mb-2 p-4 rounded-b-lg border border-t-0 space-y-3 ${
                      confirms
                        ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                        : "bg-muted/5 border-border"
                    }`}>
                      {/* Timeframes */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-xs">
                          <span className="text-muted-foreground">4h/1h:</span>
                          <span className="ml-2 font-medium">
                            {higherTimeframeFilter?.trend4h ?? "N/A"} / {higherTimeframeFilter?.trend1h ?? "N/A"}
                          </span>
                          {higherTimeframeFilter?.aligned ? (
                            <CheckCircle className="inline h-3 w-3 ml-1 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-600 dark:text-yellow-400" />
                          )}
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">30m/15m:</span>
                          <span className="ml-2 font-medium">
                            {multiTimeframe?.trend30m ?? "N/A"} / {multiTimeframe?.trend15m ?? "N/A"}
                          </span>
                        </div>
                      </div>

                      {/* Detail rows */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Last Close Alignment:</span>
                          <div className="flex items-center gap-2">
                            <span className={lastCloseAligns ? "text-green-700 dark:text-green-300 font-medium" : "text-muted-foreground"}>
                              {lastCloseAligns ? "Aligned" : "Not Aligned"}
                            </span>
                            {lastCloseAligns ? (
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Divergence Check:</span>
                          <div className="flex items-center gap-2">
                            <span className={noDivergence ? "text-green-700 dark:text-green-300 font-medium" : "text-muted-foreground"}>
                              {noDivergence ? "None" : "Detected"}
                            </span>
                            {noDivergence ? (
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">MACD Histogram:</span>
                          <div className="flex items-center gap-2">
                            {momentum?.macdHistogram !== undefined && (
                              <>
                                {trend === "bullish" && momentum.macdHistogram > 0 && macdDirectionOK ? (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-950">
                                    <ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-700 dark:text-green-300 font-medium">Bullish</span>
                                  </div>
                                ) : trend === "bearish" && momentum.macdHistogram < 0 && macdDirectionOK ? (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 dark:bg-red-950">
                                    <ArrowDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                                    <span className="text-xs text-red-700 dark:text-red-300 font-medium">Bearish</span>
                                  </div>
                                ) : !macdDirectionOK ? (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950">
                                    <Minus className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                                    <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Misaligned</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-background border border-border shadow-sm">
                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-foreground font-semibold">Neutral</span>
                                  </div>
                                )}
                              </>
                            )}
                            <span className={macdOK ? "text-green-700 dark:text-green-300 font-medium" : "text-red-700 dark:text-red-300 font-medium"}>
                              {momentum?.macdHistogram?.toFixed(3) ?? "N/A"}
                            </span>
                            {macdOK ? (
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">ADX (Trend Strength):</span>
                          <div className="flex items-center gap-2">
                            {momentum?.adxRising !== undefined && (
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                                momentum.adxRising
                                  ? "bg-green-100 dark:bg-green-950"
                                  : "bg-orange-100 dark:bg-orange-950"
                              }`}>
                                {momentum.adxRising ? (
                                  <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                                )}
                                <span className={`text-xs font-medium ${
                                  momentum.adxRising
                                    ? "text-green-700 dark:text-green-300"
                                    : "text-orange-700 dark:text-orange-300"
                                }`}>
                                  {momentum.adxRising ? "Rising" : "Falling"}
                                </span>
                              </div>
                            )}
                            <span className={adxOK ? "text-green-700 dark:text-green-300 font-medium" : "text-muted-foreground"}>
                              {momentum?.adx?.toFixed(1) ?? "N/A"}
                            </span>
                            {adxOK ? (
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {momentum?.fakeBreakoutRisk && (
                          <div className="flex items-center gap-2 p-2 rounded bg-orange-100 dark:bg-orange-950 border border-orange-300 dark:border-orange-700">
                            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            <span className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                              Fake Breakout Risk: MACD expanding but ADX falling
                            </span>
                          </div>
                        )}

                        {momentum?.genuineMomentum && (
                          <div className="flex items-center gap-2 p-2 rounded bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-700">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                              Genuine Momentum: MACD expanding + ADX rising
                            </span>
                          </div>
                        )}

                        {momentumState === "exhausted" && (
                          <div className="flex items-center gap-2 p-2 rounded bg-orange-100 dark:bg-orange-950 border border-orange-300 dark:border-orange-700">
                            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            <span className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                              Trend Exhaustion: ADX≥45 falling + StochRSI extreme — mean-reversion candidate
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Volume (Optional Boost):</span>
                          <div className="flex items-center gap-2">
                            <span className={volumeConfirms ? "text-green-700 dark:text-green-300 font-medium" : "text-muted-foreground"}>
                              {volumeConfirms ? `+${((momentum?.volumeBoost ?? 1) - 1) * 100}% Boost` : "No Boost"}
                            </span>
                            {volumeConfirms ? (
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>

                      {!confirms && (
                        <div className="pt-3 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            <strong>Missing:</strong> {!lastCloseAligns && "Last close must align with trend"}
                            {!lastCloseAligns && (!noDivergence || !macdOK || !adxOK) && ", "}
                            {!noDivergence && "No divergence between price and MACD"}
                            {!noDivergence && (!macdOK || !adxOK) && ", "}
                            {!macdOK && !macdDirectionOK && "MACD histogram direction must align with trend"}
                            {!macdOK && macdDirectionOK && !macdExpandingOK && "MACD histogram needs >0.05 expansion"}
                            {!macdOK && !adxOK && ", "}
                            {!adxOK && "ADX ≥20 required"}
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
