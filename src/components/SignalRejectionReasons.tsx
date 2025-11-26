import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Activity,
  Minimize2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { useMomentumStatus } from "@/hooks/useMomentumStatus";
import { formatDistanceToNow } from "date-fns";
import { Separator } from "@/components/ui/separator";
interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}
export const SignalRejectionReasons = () => {
  const { rejections, loading } = useSignalRejections();
  const { momentumData, loading: momentumLoading } = useMomentumStatus();
  const getReasonIcon = (reason: string) => {
    if (reason.includes("timeframe")) return <TrendingDown className="h-4 w-4" />;
    if (reason.includes("momentum")) return <Activity className="h-4 w-4" />;
    if (reason.includes("ranging")) return <Minimize2 className="h-4 w-4" />;
    if (reason.includes("pullback")) return <TrendingUp className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };
  const getFilterDetails = (filtersStatus: any) => {
    const details = [];

    if (filtersStatus?.aligned === false) {
      details.push(`4h: ${filtersStatus.trend4h}, 1h: ${filtersStatus.trend1h}`);
    }

    if (filtersStatus?.momentumConfirms === false) {
      details.push(
        `15m: ${filtersStatus.consecutive15mBullish || 0}bull/${filtersStatus.consecutive15mBearish || 0}bear`,
        `30m: ${filtersStatus.consecutive30mBullish || 0}bull/${filtersStatus.consecutive30mBearish || 0}bear`,
      );
    }

    if (filtersStatus?.inPullback === false && filtersStatus.pullbackPercent !== undefined) {
      details.push(`Pullback: ${filtersStatus.pullbackPercent.toFixed(1)}%`);
    }

    return details.length > 0 ? details.join(" | ") : filtersStatus?.required || "Check filters";
  };
  const getRejectionDetails = (rejection: SignalRejection) => {
    const details = [];
    const fs = rejection.filters_status;
    const td = rejection.trend_data;

    if (!fs) return "No data";

    // Confidence or trend consistency below threshold
    if (rejection.rejection_reason?.includes("confidence or trend consistency below threshold")) {
      const confidence = fs.confidence ?? td?.confidence;
      const trendConsistency = fs.trendConsistency ?? td?.trendConsistency;

      // Always show the values and whether they meet the threshold
      if (confidence !== undefined) {
        const meetsConfidence = fs.meetsThreshold === true;
        details.push(`Confidence: ${confidence}%${!meetsConfidence ? " ❌" : " ✓"}`);
      }

      if (trendConsistency !== undefined) {
        const meetsConsistency = fs.meetsThreshold === true;
        details.push(`Consistency: ${trendConsistency}%${!meetsConsistency ? " ❌" : " ✓"}`);
      }

      // If meetsThreshold is explicitly false but values seem to pass defaults,
      // it means user has custom thresholds - indicate this
      if (
        fs.meetsThreshold === false &&
        confidence !== undefined &&
        trendConsistency !== undefined &&
        confidence >= 60 &&
        trendConsistency >= 50
      ) {
        details.push("(Custom thresholds set higher than defaults)");
      }

      // Show timeframe conflicts if confidence is the issue
      if (confidence !== undefined && !fs.meetsThreshold) {
        if (td?.multiTimeframe) {
          const mt = td.multiTimeframe;
          const conflicts = [];

          if (mt.trend4h && mt.trend1h && mt.trend4h !== mt.trend1h) {
            conflicts.push(`4h ${mt.trend4h} vs 1h ${mt.trend1h}`);
          }
          if (mt.trend1h && mt.trend30m && mt.trend1h !== mt.trend30m) {
            conflicts.push(`1h ${mt.trend1h} vs 30m ${mt.trend30m}`);
          }
          if (mt.trend30m && mt.trend15m && mt.trend30m !== mt.trend15m) {
            conflicts.push(`30m ${mt.trend30m} vs 15m ${mt.trend15m}`);
          }

          if (conflicts.length > 0) {
            details.push(`Conflicts: ${conflicts.join(", ")}`);
          }

          // Show individual timeframe confidences
          const tfConfidences = [];
          if (mt.confidence4h) tfConfidences.push(`4h: ${mt.confidence4h}%`);
          if (mt.confidence1h) tfConfidences.push(`1h: ${mt.confidence1h}%`);
          if (mt.confidence30m) tfConfidences.push(`30m: ${mt.confidence30m}%`);
          if (mt.confidence15m) tfConfidences.push(`15m: ${mt.confidence15m}%`);

          if (tfConfidences.length > 0) {
            details.push(`TF confidence: ${tfConfidences.join(", ")}`);
          }
        }
      }
    }

    // Timeframes not aligned with no divergence opportunity
    if (rejection.rejection_reason?.includes("timeframes not aligned, no divergence opportunity")) {
      // Show all timeframe trends
      if (td?.multiTimeframe) {
        const mt = td.multiTimeframe;
        const trends = [];
        if (mt.trend4h) trends.push(`4h: ${mt.trend4h}`);
        if (mt.trend1h) trends.push(`1h: ${mt.trend1h}`);
        if (mt.trend30m) trends.push(`30m: ${mt.trend30m}`);
        if (mt.trend15m) trends.push(`15m: ${mt.trend15m}`);
        if (trends.length > 0) {
          details.push(trends.join(", "));
        }

        // Show confidence levels for each timeframe
        const confidences = [];
        if (mt.confidence4h) confidences.push(`4h: ${mt.confidence4h}%`);
        if (mt.confidence1h) confidences.push(`1h: ${mt.confidence1h}%`);
        if (mt.confidence30m) confidences.push(`30m: ${mt.confidence30m}%`);
        if (mt.confidence15m) confidences.push(`15m: ${mt.confidence15m}%`);
        if (confidences.length > 0) {
          details.push(`Confidence: ${confidences.join(", ")}`);
        }
      } else if (fs.trend4h || fs.trend1h) {
        details.push(`4h: ${fs.trend4h || "unknown"}, 1h: ${fs.trend1h || "unknown"}`);
      }

      // Show overall confidence and consistency if available
      const overallConfidence = td?.confidence ?? fs.confidence;
      const trendConsistency = td?.trendConsistency ?? fs.trendConsistency;

      if (overallConfidence !== undefined || trendConsistency !== undefined) {
        const thresholdDetails = [];
        if (overallConfidence !== undefined) {
          const meetsConfidence = overallConfidence >= 60;
          thresholdDetails.push(`Overall: ${overallConfidence}%${!meetsConfidence ? " < 60% ❌" : " ✓"}`);
        }
        if (trendConsistency !== undefined) {
          const meetsConsistency = trendConsistency >= 50;
          thresholdDetails.push(`Consistency: ${trendConsistency}%${!meetsConsistency ? " < 50% ❌" : " ✓"}`);
        }
        if (thresholdDetails.length > 0) {
          details.push(thresholdDetails.join(", "));
        }
      }

      // Show momentum status
      if (td?.momentum) {
        const m = td.momentum;
        const momentumDetails = [];

        momentumDetails.push(`15m: ${m.consecutive15mBullish || 0}🟢/${m.consecutive15mBearish || 0}🔴`);
        momentumDetails.push(`30m: ${m.consecutive30mBullish || 0}🟢/${m.consecutive30mBearish || 0}🔴`);

        if (m.macdHistogram !== undefined) {
          const macdOK = Math.abs(m.macdHistogram) > 0.01;
          momentumDetails.push(`MACD: ${m.macdHistogram.toFixed(3)}${!macdOK ? " < 0.01 ❌" : " ✓"}`);
        }

        const momentumConfirmed = m.confirms || false;
        momentumDetails.push(momentumConfirmed ? "Momentum ✓" : "No momentum ❌");

        details.push(momentumDetails.join(" | "));
      }

      // Show why no divergence
      if (td?.higherTimeframeFilter) {
        const htf = td.higherTimeframeFilter;

        if (htf.aligned) {
          details.push("Aligned (standard signal requires confidence/momentum)");
        } else {
          // Check if divergence signals are enabled
          const pullbackEnabled = fs.pullbackEnabled ?? true;
          const earlyReversalEnabled = fs.earlyReversalEnabled ?? true;

          if (!pullbackEnabled && !earlyReversalEnabled) {
            details.push("Divergence signals disabled");
          } else {
            // Show specific divergence conditions
            const divergenceChecks = [];

            // Pullback conditions
            if (pullbackEnabled && td.multiTimeframe) {
              const mt = td.multiTimeframe;
              const confidence4h = mt.confidence4h || 0;
              const strongHigherTF = confidence4h >= 60;

              if (!strongHigherTF) {
                divergenceChecks.push(`Pullback: 4h ${confidence4h}% < 60%`);
              }
            }

            // Early reversal conditions
            if (earlyReversalEnabled && td.multiTimeframe) {
              const mt = td.multiTimeframe;
              const confidence1h = mt.confidence1h || 0;
              const confidence4h = mt.confidence4h || 0;
              const strongReversal = confidence1h >= 70 && confidence4h < 60;

              if (!strongReversal) {
                divergenceChecks.push(`Reversal: 1h ${confidence1h}% (needs ≥70%) & 4h ${confidence4h}% (needs <60%)`);
              }
            }

            if (divergenceChecks.length > 0) {
              details.push(divergenceChecks.join(" | "));
            }
          }
        }
      }

      // Show ranging market if applicable
      if (td?.ranging?.isRanging === true) {
        const atrPercent = td.ranging.atrPercent || 0;
        const adx = td.volatility?.adx || 0;
        details.push(`Ranging: ATR ${atrPercent.toFixed(2)}%, ADX ${adx.toFixed(1)}`);
      }
    }
    // Other timeframe alignment issues
    else if (
      rejection.rejection_reason?.includes("timeframes NOT aligned") ||
      rejection.rejection_reason?.includes("timeframe")
    ) {
      if (fs.trend4h || fs.trend1h) {
        details.push(`4H: ${fs.trend4h || "unknown"} | 1H: ${fs.trend1h || "unknown"}`);
      }
    }

    // Pullback issues
    if (rejection.rejection_reason?.includes("pullback")) {
      if (fs.pullbackPercent !== undefined && fs.pullbackPercent !== null) {
        details.push(`Retracement: ${fs.pullbackPercent.toFixed(1)}%`);
      }
    }

    // Momentum issues - show specific failure point
    if (rejection.rejection_reason?.includes("momentum")) {
      const m15Bullish = fs.consecutive15mBullish || 0;
      const m15Bearish = fs.consecutive15mBearish || 0;
      const m30Bullish = fs.consecutive30mBullish || 0;
      const m30Bearish = fs.consecutive30mBearish || 0;

      // Determine the expected trend direction
      const expectedTrend = fs.trend4h || fs.trend1h || td?.trend;
      const isBullish = expectedTrend === "bullish";

      // Check if consecutive candles requirement is met (either 15m OR 30m)
      const candles15mOK = isBullish ? m15Bullish >= 2 : m15Bearish >= 2;
      const candles30mOK = isBullish ? m30Bullish >= 2 : m30Bearish >= 2;
      const consecutiveCandlesPass = candles15mOK || candles30mOK;

      // Check MACD histogram
      const macdHistogram = td?.momentum?.macdHistogram ?? fs.momentum?.macdHistogram;
      const macdOK = macdHistogram !== undefined && Math.abs(macdHistogram) > 0.01;

      if (!consecutiveCandlesPass) {
        // Consecutive candles failed - show candle counts
        details.push(`15m: ${m15Bullish}🟢/${m15Bearish}🔴, 30m: ${m30Bullish}🟢/${m30Bearish}🔴 (need ≥2 on either)`);
      } else if (!macdOK) {
        // Candles passed but MACD failed - show MACD value
        if (macdHistogram !== undefined) {
          details.push(`MACD histogram: ${macdHistogram.toFixed(4)} (need >0.01)`);
        } else {
          details.push(`MACD histogram: unavailable`);
        }
      } else {
        // Both checks somehow failed (shouldn't happen but handle it)
        details.push(`15m: ${m15Bullish}🟢/${m15Bearish}🔴 | 30m: ${m30Bullish}🟢/${m30Bearish}🔴`);
        if (macdHistogram !== undefined) {
          details.push(`MACD: ${macdHistogram.toFixed(4)}`);
        }
      }
    }

    // Ranging market
    if (rejection.rejection_reason?.includes("ranging") && fs.isRanging === true) {
      details.push(`Market: Ranging`);
    }

    return details.length > 0 ? details.join(" | ") : "No specific values";
  };
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>Loading rejection data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (rejections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>No signals rejected in the last 30 minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            All symbols are either generating signals or haven't been analyzed yet.
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          Signal Rejection Reasons (Last 30 Minutes)
        </CardTitle>
        <CardDescription>Why signals are not being generated for each symbol</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Filter Details</TableHead>
              <TableHead>Rejection Values</TableHead>
              <TableHead>Last Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rejections.map((rejection) => (
              <TableRow key={rejection.id}>
                <TableCell className="font-medium">{rejection.symbol}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getReasonIcon(rejection.rejection_reason ?? "")}
                    <span className="text-sm">{rejection.rejection_reason}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">{getFilterDetails(rejection.filters_status)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-medium text-destructive">{getRejectionDetails(rejection)}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {formatDistanceToNow(new Date(rejection.checked_at), { addSuffix: true })}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Separator className="my-6" />
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Momentum Status Details
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Current momentum confirmation status for each symbol</p>
          </div>
          {momentumLoading ? (
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
                const { momentum, higherTimeframeFilter, trend } = data;
                const confirms = momentum?.confirms ?? false;

                const candles15mOK =
                  (trend === "bullish" && momentum?.consecutive15mBullish >= 2) ||
                  (trend === "bearish" && momentum?.consecutive15mBearish >= 2);

                const candles30mOK =
                  (trend === "bullish" && momentum?.consecutive30mBullish >= 2) ||
                  (trend === "bearish" && momentum?.consecutive30mBearish >= 2);

                const macdOK = Math.abs(momentum?.macdHistogram ?? 0) > 0.01;
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
                        {confirms ? (
                          <Badge className="bg-green-500 hover:bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Momentum Confirmed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            No Momentum
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "outline"}
                      >
                        {trend === "bullish" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {trend}
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
                          N/A / N/A
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className={confirms ? "text-gray-700 dark:text-gray-300" : "text-muted-foreground"}>
                          15m OR 30m Candles:
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              candles15mOK || candles30mOK
                                ? "text-green-700 dark:text-green-300 font-medium"
                                : confirms
                                  ? "text-gray-900 dark:text-gray-100"
                                  : "text-muted-foreground"
                            }
                          >
                            15m: {momentum?.consecutive15mBullish ?? 0}🟢/{momentum?.consecutive15mBearish ?? 0}🔴, 30m:{" "}
                            {momentum?.consecutive30mBullish ?? 0}🟢/{momentum?.consecutive30mBearish ?? 0}🔴
                          </span>
                          {candles15mOK || candles30mOK ? (
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
                          <span
                            className={
                              macdOK
                                ? "text-green-700 dark:text-green-300 font-medium"
                                : confirms
                                  ? "text-gray-900 dark:text-gray-100"
                                  : "text-muted-foreground"
                            }
                          >
                            {momentum?.macdHistogram?.toFixed(3) ?? "N/A"}
                          </span>
                          {macdOK ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle
                              className={`h-4 w-4 ${confirms ? "text-gray-600 dark:text-gray-400" : "text-muted-foreground"}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    {!confirms && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          <strong>Missing:</strong>{" "}
                          {!candles15mOK && !candles30mOK && "Either 15m OR 30m needs ≥2 consecutive candles"}
                          {!candles15mOK && !candles30mOK && !macdOK && ", "}
                          {!macdOK && "MACD histogram needs >0.01"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
