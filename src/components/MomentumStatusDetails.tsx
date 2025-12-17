import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useMomentumStatus } from "@/hooks/useMomentumStatus";
import { useState } from "react";

export const MomentumStatusDetails = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { momentumData, loading } = useMomentumStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          Momentum Status Details
        </CardTitle>
        <CardDescription>
          <strong>Confirmed:</strong> Full conditions met. <strong>Building:</strong> Aligned 4h+1h trends (allows signals). <strong>Mixed/None:</strong> Insufficient.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-4 h-auto hover:bg-accent">
              <span className="text-sm font-medium">
                {isOpen ? "Hide Details" : "Show Details"}
              </span>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            {isOpen && (
              <>
                {loading ? (
                  <p className="text-muted-foreground text-sm">Loading momentum data...</p>
                ) : (
                  <div className="space-y-4">
                    {momentumData.map((data) => {
                      if (data.error) {
                        return (
                          <div key={data.symbol} className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{data.symbol}</span>
                              <Badge variant="destructive">Error</Badge>
                            </div>
                            <p className="text-sm text-destructive mt-2">{data.error}</p>
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
                      const adxOK = (momentum?.adx ?? 0) >= 20;
                      const volumeConfirms = momentum?.volumeConfirms ?? false;

                      return (
                        <div
                          key={data.symbol}
                          className={`p-4 rounded-lg border ${
                            confirms
                              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                              : "bg-muted border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className={`font-semibold text-lg ${confirms ? "text-gray-900 dark:text-gray-100" : ""}`}>
                                {data.symbol}
                              </span>
                            {momentumState === "confirmed" ? (
                              <Badge className="bg-green-500 hover:bg-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Confirmed
                              </Badge>
                            ) : momentumState === "building" ? (
                              <Badge className="bg-blue-500 hover:bg-blue-600">
                                <Activity className="h-3 w-3 mr-1" />
                                Building
                              </Badge>
                            ) : momentumState === "mixed" ? (
                              <Badge className="bg-yellow-500 hover:bg-yellow-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Mixed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                None
                              </Badge>
                            )}
                            </div>
                            <Badge
                              variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "outline"}
                            >
                              {trend === "bullish" ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : trend === "bearish" ? (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              ) : null}
                              {trend ?? "unknown"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="text-xs">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                4h/1h:
                              </span>
                              <span className={`ml-2 font-medium ${confirms ? "text-gray-900 dark:text-gray-100" : ""}`}>
                                {higherTimeframeFilter?.trend4h ?? "N/A"} / {higherTimeframeFilter?.trend1h ?? "N/A"}
                              </span>
                              {higherTimeframeFilter?.aligned ? (
                                <CheckCircle className="inline h-3 w-3 ml-1 text-green-600 dark:text-green-400" />
                              ) : (
                                <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-600 dark:text-yellow-400" />
                              )}
                            </div>
                            <div className="text-xs">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                30m/15m:
                              </span>
                              <span className={`ml-2 font-medium ${confirms ? "text-gray-900 dark:text-gray-100" : ""}`}>
                                {multiTimeframe?.trend30m ?? "N/A"} / {multiTimeframe?.trend15m ?? "N/A"}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                Last Close Alignment:
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    lastCloseAligns
                                      ? "text-green-700 dark:text-green-300 font-medium"
                                      : confirms
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {lastCloseAligns ? "Aligned" : "Not Aligned"}
                                </span>
                                {lastCloseAligns ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                  <XCircle
                                    className={`h-4 w-4 ${confirms ? "text-gray-600 dark:text-gray-400" : "text-muted-foreground"}`}
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                Divergence Check:
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    noDivergence
                                      ? "text-green-700 dark:text-green-300 font-medium"
                                      : confirms
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {noDivergence ? "None" : "Detected"}
                                </span>
                                {noDivergence ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                  <XCircle
                                    className={`h-4 w-4 ${confirms ? "text-gray-600 dark:text-gray-400" : "text-muted-foreground"}`}
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                MACD Histogram:
                              </span>
                              <div className="flex items-center gap-2">
                                {momentum?.macdHistogram !== undefined && (
                                  <>
                                    {trend === "bullish" && momentum.macdHistogram > 0 && macdDirectionOK ? (
                                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-950">
                                        <ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                                        <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                                          Bullish
                                        </span>
                                      </div>
                                    ) : trend === "bearish" && momentum.macdHistogram < 0 && macdDirectionOK ? (
                                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 dark:bg-red-950">
                                        <ArrowDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                                        <span className="text-xs text-red-700 dark:text-red-300 font-medium">Bearish</span>
                                      </div>
                                    ) : !macdDirectionOK ? (
                                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950">
                                        <Minus className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                                        <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">
                                          Misaligned
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                                        <Minus className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                        <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Neutral</span>
                                      </div>
                                    )}
                                  </>
                                )}
                                <span
                                  className={
                                    macdOK
                                      ? "text-green-700 dark:text-green-300 font-medium"
                                      : "text-red-700 dark:text-red-300 font-medium"
                                  }
                                >
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
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                ADX (Trend Strength):
                              </span>
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
                                <span
                                  className={
                                    adxOK
                                      ? "text-green-700 dark:text-green-300 font-medium"
                                      : confirms
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {momentum?.adx?.toFixed(1) ?? "N/A"}
                                </span>
                                {adxOK ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                  <XCircle
                                    className={`h-4 w-4 ${confirms ? "text-gray-600 dark:text-gray-400" : "text-muted-foreground"}`}
                                  />
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

                            <div className="flex items-center justify-between text-sm">
                              <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                                Volume (Optional Boost):
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    volumeConfirms
                                      ? "text-green-700 dark:text-green-300 font-medium"
                                      : confirms
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {volumeConfirms ? `+${((momentum?.volumeBoost ?? 1) - 1) * 100}% Boost` : "No Boost"}
                                </span>
                                {volumeConfirms ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Minus
                                    className={`h-4 w-4 ${confirms ? "text-gray-600 dark:text-gray-400" : "text-muted-foreground"}`}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          {!confirms && (
                            <div className="mt-3 pt-3 border-t border-border">
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
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
