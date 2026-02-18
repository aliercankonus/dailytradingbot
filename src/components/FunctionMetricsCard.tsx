import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, AlertCircle } from "lucide-react";
import { useFunctionMetrics, computeStats } from "@/hooks/useFunctionMetrics";
import { useMemo } from "react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface FunctionMetricsCardProps {
  functionName: string;
  displayName: string;
  warningThresholdMs?: number;
  dangerThresholdMs?: number;
}

export const FunctionMetricsCard = ({
  functionName,
  displayName,
  warningThresholdMs = 7000,
  dangerThresholdMs = 15000,
}: FunctionMetricsCardProps) => {
  const { data: metrics, isLoading } = useFunctionMetrics(functionName, 100);

  const stats = useMemo(() => computeStats(metrics ?? []), [metrics]);

  const chartData = useMemo(() => {
    if (!metrics?.length) return [];
    return [...metrics]
      .reverse()
      .slice(-50) // Last 50 data points
      .map((m) => ({
        time: format(new Date(m.created_at), "HH:mm"),
        ms: m.duration_ms,
        success: m.success,
      }));
  }, [metrics]);

  const getVariant = (ms: number): "default" | "secondary" | "destructive" => {
    if (ms > dangerThresholdMs) return "destructive";
    if (ms > warningThresholdMs) return "secondary";
    return "default";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          {displayName}
        </CardTitle>
        <CardDescription>
          {stats ? `${stats.count} executions tracked` : "No data yet"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Latest</div>
                <Badge variant={getVariant(stats.latest)} className="text-xs font-mono">
                  {(stats.latest / 1000).toFixed(1)}s
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Avg</div>
                <div className="text-sm font-bold font-mono">{(stats.avg / 1000).toFixed(1)}s</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">P95</div>
                <Badge variant={getVariant(stats.p95)} className="text-xs font-mono">
                  {(stats.p95 / 1000).toFixed(1)}s
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Max</div>
                <div className="text-sm font-mono text-orange-500">{(stats.max / 1000).toFixed(1)}s</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Min</div>
                <div className="text-sm font-mono text-green-500">{(stats.min / 1000).toFixed(1)}s</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Error Rate</div>
                <div className="flex items-center gap-1">
                  {stats.errorRate > 0 && <AlertCircle className="h-3 w-3 text-destructive" />}
                  <span className={`text-sm font-mono ${stats.errorRate > 0 ? "text-destructive" : "text-green-500"}`}>
                    {stats.errorRate}%
                  </span>
                </div>
              </div>
            </div>

            {chartData.length > 2 && (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${(value / 1000).toFixed(2)}s`, "Duration"]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    />
                    <ReferenceLine
                      y={stats.avg}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                    />
                    <ReferenceLine
                      y={dangerThresholdMs}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="5 5"
                      label={{ value: "danger", position: "right", fontSize: 9, fill: "hsl(var(--destructive))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ms"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No metrics data yet — will appear after the next execution cycle
          </div>
        )}
      </CardContent>
    </Card>
  );
};
