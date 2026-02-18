import { AppHeader } from "@/components/AppHeader";
import { Activity, AlertTriangle, Clock, Radio, CheckCircle2, XCircle, Timer, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WebSocketHealthDashboard } from "@/components/WebSocketHealthDashboard";
import { useBotHeartbeats, useBotHealthStates } from "@/hooks/useBotHealth";
import { format, formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const Health = () => {
  const { data: heartbeats, isLoading: hbLoading } = useBotHeartbeats(30);
  const { data: healthStates, isLoading: hsLoading } = useBotHealthStates(30);

  const latestHeartbeat = heartbeats?.[0];

  const getStateBadgeVariant = (state: string) => {
    if (state.includes("HEALTHY") || state.includes("NORMAL")) return "default";
    if (state.includes("CONCERN") || state.includes("WARNING")) return "secondary";
    return "destructive";
  };

  const getExecTime = (hb: typeof latestHeartbeat) => {
    const details = hb?.details as Record<string, unknown> | null;
    return (details?.executionTimeMs as number) ?? null;
  };

  const execTimeStats = useMemo(() => {
    if (!heartbeats?.length) return null;
    const times = heartbeats
      .map(getExecTime)
      .filter((t): t is number => t !== null);
    if (times.length === 0) return null;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = Math.max(...times);
    const min = Math.min(...times);
    const latest = times[0];
    return { avg, max, min, latest, count: times.length };
  }, [heartbeats]);

  const execTimeChartData = useMemo(() => {
    if (!heartbeats?.length) return [];
    return [...heartbeats]
      .reverse()
      .map((hb) => ({
        time: format(new Date(hb.recorded_at), "HH:mm"),
        ms: getExecTime(hb),
      }))
      .filter((d) => d.ms !== null);
  }, [heartbeats]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* System Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Status
            </CardTitle>
            <CardDescription>Latest bot heartbeat and operational state</CardDescription>
          </CardHeader>
          <CardContent>
            {hbLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : latestHeartbeat ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Last Heartbeat</div>
                  <div className="text-sm font-medium">
                    {formatDistanceToNow(new Date(latestHeartbeat.recorded_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Symbols Scanned</div>
                  <div className="text-xl font-bold">{latestHeartbeat.symbols_scanned}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Signals / Rejections</div>
                  <div className="text-xl font-bold">
                    {latestHeartbeat.signals_generated} / {latestHeartbeat.rejections_logged}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">No-Trade State</div>
                  {latestHeartbeat.no_trade_state ? (
                    <Badge variant="secondary" className="text-xs">
                      {latestHeartbeat.no_trade_state}
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs">ACTIVE</Badge>
                  )}
                  {latestHeartbeat.no_trade_reason && (
                    <div className="text-xs text-muted-foreground mt-1">{latestHeartbeat.no_trade_reason}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">No heartbeat data available</div>
            )}
          </CardContent>
        </Card>

        {/* Execution Time Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Cycle Execution Time
            </CardTitle>
            <CardDescription>Strategy analyzer performance over recent cycles</CardDescription>
          </CardHeader>
          <CardContent>
            {hbLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : execTimeStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Latest</div>
                    <div className="text-xl font-bold">
                      {(execTimeStats.latest / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Average</div>
                    <div className="text-xl font-bold text-muted-foreground">
                      {(execTimeStats.avg / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Min</div>
                    <div className="text-xl font-bold text-green-500">
                      {(execTimeStats.min / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Max</div>
                    <div className="text-xl font-bold text-orange-500">
                      {(execTimeStats.max / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>
                {execTimeChartData.length > 1 && (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={execTimeChartData}>
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${(value / 1000).toFixed(2)}s`, "Exec Time"]}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                        />
                        <ReferenceLine
                          y={execTimeStats.avg}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="3 3"
                          label={{ value: "avg", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ms"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Based on {execTimeStats.count} heartbeat{execTimeStats.count !== 1 ? "s" : ""} with execution data
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                No execution time data yet — will appear after the next strategy cycle
              </div>
            )}
          </CardContent>
        </Card>

        <WebSocketHealthDashboard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Heartbeat Timeline
            </CardTitle>
            <CardDescription>Recent scanner activity and no-trade state transitions</CardDescription>
          </CardHeader>
          <CardContent>
            {hbLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : heartbeats && heartbeats.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {heartbeats.map((hb) => {
                  const execMs = getExecTime(hb);
                  return (
                    <div key={hb.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card text-sm">
                      <div className="flex-shrink-0">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-xs">
                            {format(new Date(hb.recorded_at), "MMM dd HH:mm:ss")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {hb.symbols_scanned} symbols · {hb.signals_generated} signals · {hb.rejections_logged} rejected
                          </span>
                          {execMs !== null && (
                            <Badge variant={execMs > 10000 ? "destructive" : execMs > 7000 ? "secondary" : "default"} className="text-xs">
                              {(execMs / 1000).toFixed(1)}s
                            </Badge>
                          )}
                        </div>
                        {hb.no_trade_state && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-xs">{hb.no_trade_state}</Badge>
                            {hb.no_trade_reason && (
                              <span className="text-xs text-muted-foreground ml-2">{hb.no_trade_reason}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">No heartbeat data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Health Alerts History
            </CardTitle>
            <CardDescription>Past health state entries, alerts triggered and resolved</CardDescription>
          </CardHeader>
          <CardContent>
            {hsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : healthStates && healthStates.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {healthStates.map((hs) => (
                  <div key={hs.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm">
                    <div className="flex-shrink-0 mt-0.5">
                      {hs.resolved_at ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={getStateBadgeVariant(hs.state)} className="text-xs">{hs.state}</Badge>
                        <span className="text-xs text-muted-foreground">{hs.state_type}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Started: {format(new Date(hs.started_at), "MMM dd HH:mm:ss")}
                        {hs.resolved_at && (
                          <> · Resolved: {format(new Date(hs.resolved_at), "MMM dd HH:mm:ss")}
                          {" "}({formatDistanceToNow(new Date(hs.started_at), { addSuffix: false })} duration)</>
                        )}
                      </div>
                      {hs.alert_sent && (
                        <div className="text-xs text-warning">
                          Alert sent {hs.alert_sent_at ? format(new Date(hs.alert_sent_at), "MMM dd HH:mm") : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">No health alerts recorded</div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Health;
