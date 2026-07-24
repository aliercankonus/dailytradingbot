import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface AccuracyRow {
  id: string;
  symbol: string;
  series: string;
  horizon_hours: number;
  n_samples: number;
  mape: number | null;
  dir_hit_rate: number | null;
  rank_ic: number | null;
  mean_predicted_gap_rel: number | null;
  mean_realized_gap_rel: number | null;
  period_start: string;
  period_end: string;
  computed_at: string;
}

interface CoverageRow {
  total: number;
  mature: number;
  earliest_target: string | null;
  latest_target: string | null;
}

const HOUR_MS = 3_600_000;

function metricColor(value: number | null, kind: "ic" | "hit" | "mape") {
  if (value == null) return "secondary";
  if (kind === "ic") return value > 0.1 ? "default" : value > 0.03 ? "secondary" : "destructive";
  if (kind === "hit") return value > 0.55 ? "default" : value > 0.5 ? "secondary" : "destructive";
  if (kind === "mape") return value < 0.02 ? "default" : value < 0.05 ? "secondary" : "destructive";
  return "secondary";
}

export function PredictionAccuracyCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AccuracyRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: accRows }, { data: features }] = await Promise.all([
        supabase
          .from("future_state_accuracy")
          .select("*")
          .order("computed_at", { ascending: false })
          .limit(20),
        supabase
          .from("future_state_features")
          .select("anchor_ts,horizon_hours"),
      ]);
      setRows((accRows ?? []) as AccuracyRow[]);

      const feats = features ?? [];
      const nowMs = Date.now();
      const targets = feats.map((f: any) => f.anchor_ts + f.horizon_hours * HOUR_MS);
      const matureCount = targets.filter((t) => t <= nowMs).length;
      setCoverage({
        total: feats.length,
        mature: matureCount,
        earliest_target: targets.length ? new Date(Math.min(...targets)).toISOString() : null,
        latest_target: targets.length ? new Date(Math.max(...targets)).toISOString() : null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-future-state");
      if (error) throw error;
      toast({
        title: "Validator ran",
        description: `mature=${data?.mature_rows ?? 0}, inserted=${data?.inserted?.length ?? 0}, errors=${data?.errors?.length ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Validator failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const nextMatureIn = () => {
    if (!coverage?.earliest_target) return null;
    const nowMs = Date.now();
    const upcoming = coverage.mature < coverage.total
      ? new Date(coverage.earliest_target).getTime()
      : null;
    if (!upcoming || upcoming <= nowMs) return null;
    return formatDistanceToNow(upcoming, { addSuffix: true });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            TimesFM Prediction Accuracy
          </CardTitle>
          <CardDescription>
            Weekly validation of future-state OI forecasts vs realized Bybit data
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Activity className="h-3 w-3 mr-1" />}
            Run now
          </Button>
          <Button size="icon" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {coverage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Total forecasts</div>
              <div className="font-mono text-lg">{coverage.total}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Mature (target ≤ now)</div>
              <div className="font-mono text-lg">{coverage.mature}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Next matures</div>
              <div className="font-mono text-sm">{nextMatureIn() ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Latest target</div>
              <div className="font-mono text-sm">
                {coverage.latest_target ? new Date(coverage.latest_target).toISOString().slice(0, 16).replace("T", " ") : "—"}
              </div>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-4">
            No accuracy runs yet. Predictions mature 48h after each forecast, then the weekly validator (Sundays 03:15 UTC) computes metrics. Use <span className="font-mono">Run now</span> once any mature forecasts exist.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground px-2">
              <div>Symbol</div>
              <div>Horizon</div>
              <div>N</div>
              <div>MAPE</div>
              <div>Dir hit</div>
              <div>Rank IC</div>
              <div>Computed</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-7 gap-2 text-sm border rounded-md p-2 items-center">
                <div className="font-mono">{r.symbol}</div>
                <div className="font-mono text-xs">h={r.horizon_hours}</div>
                <div className="font-mono">{r.n_samples}</div>
                <div>
                  <Badge variant={metricColor(r.mape, "mape") as any} className="font-mono">
                    {r.mape != null ? `${(r.mape * 100).toFixed(2)}%` : "—"}
                  </Badge>
                </div>
                <div>
                  <Badge variant={metricColor(r.dir_hit_rate, "hit") as any} className="font-mono">
                    {r.dir_hit_rate != null ? `${(r.dir_hit_rate * 100).toFixed(0)}%` : "—"}
                  </Badge>
                </div>
                <div>
                  <Badge variant={metricColor(r.rank_ic, "ic") as any} className="font-mono">
                    {r.rank_ic != null ? r.rank_ic.toFixed(3) : "—"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.computed_at), { addSuffix: true })}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-1">
              Guidelines — Rank IC: &gt;0.10 strong · 0.03–0.10 weak-but-real · &lt;0.03 noise. Dir hit &gt;55% meaningful.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
