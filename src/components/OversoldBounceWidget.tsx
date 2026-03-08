import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, BarChart3, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface GateStats {
  gate_name: string;
  total: number;
  evaluated: number;
  pending: number;
  avg_k: number | null;
  avg_adx: number | null;
  avg_ret_6h: number | null;
  avg_ret_12h: number | null;
  avg_ret_24h: number | null;
  avg_mae: number | null;
  avg_mfe: number | null;
  bounce_rate: number | null;
}

const useOversoldBounceStats = () => {
  return useQuery({
    queryKey: ["oversold-bounce-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("oversold_event_study")
        .select("*")
        .eq("user_id", user.id)
        .order("event_time", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Group by gate_name
      const grouped = new Map<string, typeof data>();
      for (const row of data) {
        const gate = row.gate_name || "UNKNOWN";
        if (!grouped.has(gate)) grouped.set(gate, []);
        grouped.get(gate)!.push(row);
      }

      const stats: GateStats[] = [];
      for (const [gate, rows] of grouped) {
        const evaluated = rows.filter(r => r.evaluated);
        const pending = rows.filter(r => !r.evaluated);
        const bounced = evaluated.filter(r => (r.ret_6h ?? 0) > 0);

        stats.push({
          gate_name: gate,
          total: rows.length,
          evaluated: evaluated.length,
          pending: pending.length,
          avg_k: rows.length > 0 ? rows.reduce((s, r) => s + (r.stoch_k ?? 0), 0) / rows.length : null,
          avg_adx: rows.length > 0 ? rows.reduce((s, r) => s + (r.adx ?? 0), 0) / rows.length : null,
          avg_ret_6h: evaluated.length > 0 ? evaluated.reduce((s, r) => s + (r.ret_6h ?? 0), 0) / evaluated.length : null,
          avg_ret_12h: evaluated.length > 0 ? evaluated.reduce((s, r) => s + (r.ret_12h ?? 0), 0) / evaluated.length : null,
          avg_ret_24h: evaluated.length > 0 ? evaluated.reduce((s, r) => s + (r.ret_24h ?? 0), 0) / evaluated.length : null,
          avg_mae: evaluated.length > 0 ? evaluated.reduce((s, r) => s + (r.mae ?? 0), 0) / evaluated.length : null,
          avg_mfe: evaluated.length > 0 ? evaluated.reduce((s, r) => s + (r.mfe ?? 0), 0) / evaluated.length : null,
          bounce_rate: evaluated.length > 0 ? (bounced.length / evaluated.length) * 100 : null,
        });
      }

      return stats.sort((a, b) => b.total - a.total);
    },
    refetchInterval: 60_000,
  });
};

const formatPct = (v: number | null) => {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`;
};

const OversoldBounceWidget = () => {
  const { data: stats, isLoading } = useOversoldBounceStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Oversold Bounce Study</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const totalEvents = stats?.reduce((s, g) => s + g.total, 0) ?? 0;
  const totalEvaluated = stats?.reduce((s, g) => s + g.evaluated, 0) ?? 0;
  const totalPending = stats?.reduce((s, g) => s + g.pending, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-blue-500" />
            Oversold Bounce Study
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {totalEvents} events
            </Badge>
            {totalPending > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {totalPending} pending
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!stats || stats.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No oversold events captured yet. Events are logged when gates block entries in deep oversold zones.
          </p>
        ) : (
          <div className="space-y-3">
            {stats.map((g) => (
              <div key={g.gate_name} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-foreground">{g.gate_name}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">{g.total} captured</Badge>
                    {g.evaluated > 0 && (
                      <Badge variant="default" className="text-xs">{g.evaluated} evaluated</Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Avg K:</span>
                    <span className="ml-1 font-mono">{g.avg_k?.toFixed(1) ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg ADX:</span>
                    <span className="ml-1 font-mono">{g.avg_adx?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>

                {g.evaluated > 0 ? (
                  <div className="space-y-1">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">6h Ret:</span>
                        <span className={`ml-1 font-mono ${(g.avg_ret_6h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatPct(g.avg_ret_6h)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">12h:</span>
                        <span className={`ml-1 font-mono ${(g.avg_ret_12h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatPct(g.avg_ret_12h)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">24h:</span>
                        <span className={`ml-1 font-mono ${(g.avg_ret_24h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatPct(g.avg_ret_24h)}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">MAE:</span>
                        <span className="ml-1 font-mono text-red-500">{formatPct(g.avg_mae)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">MFE:</span>
                        <span className="ml-1 font-mono text-green-500">{formatPct(g.avg_mfe)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bounce:</span>
                        <span className="ml-1 font-mono">{g.bounce_rate?.toFixed(0) ?? "—"}%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    ⏳ Awaiting 24h window for forward returns evaluation
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OversoldBounceWidget;
