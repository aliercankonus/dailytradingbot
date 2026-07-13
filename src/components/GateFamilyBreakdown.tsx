import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Filter, TrendingDown } from "lucide-react";

interface RejectionRow {
  rejection_reason: string;
  gate_family: string | null;
}

const FAMILY_COLOR: Record<string, string> = {
  QUALITY: "bg-red-500/15 text-red-400 border-red-500/30",
  DIRECTION: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ADX: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  STOCH: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  MOMENTUM: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  REGIME: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  STRATEGY: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  PORTFOLIO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  EXECUTION: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  ERROR: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  OTHER: "bg-muted text-muted-foreground border-border",
};

export function GateFamilyBreakdown() {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30>(7);
  const [rows, setRows] = useState<RejectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("signal_rejection_log")
      .select("rejection_reason, gate_family")
      .eq("user_id", user.id)
      .gte("checked_at", since)
      .limit(10000)
      .then(({ data, error }) => {
        if (!error && data) setRows(data as RejectionRow[]);
        setLoading(false);
      });
  }, [user, days]);

  const { familyCounts, reasonByFamily, total } = useMemo(() => {
    const familyCounts: Record<string, number> = {};
    const reasonByFamily: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const fam = r.gate_family || "OTHER";
      familyCounts[fam] = (familyCounts[fam] || 0) + 1;
      if (!reasonByFamily[fam]) reasonByFamily[fam] = {};
      reasonByFamily[fam][r.rejection_reason] = (reasonByFamily[fam][r.rejection_reason] || 0) + 1;
    }
    return { familyCounts, reasonByFamily, total: rows.length };
  }, [rows]);

  const sortedFamilies = useMemo(
    () => Object.entries(familyCounts).sort((a, b) => b[1] - a[1]),
    [familyCounts]
  );
  const maxCount = sortedFamilies[0]?.[1] || 1;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Gate Family Breakdown</h3>
          <Badge variant="outline" className="text-xs">
            {total.toLocaleString()} reject
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={days === 7 ? "default" : "outline"}
            onClick={() => setDays(7)}
          >
            7g
          </Button>
          <Button
            size="sm"
            variant={days === 30 ? "default" : "outline"}
            onClick={() => setDays(30)}
          >
            30g
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Bu pencerede kayıt yok.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFamilies.map(([fam, count]) => {
            const pct = (count / total) * 100;
            const barPct = (count / maxCount) * 100;
            const isOpen = expanded === fam;
            const topReasons = Object.entries(reasonByFamily[fam])
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5);
            return (
              <div key={fam} className="space-y-1">
                <button
                  className="w-full text-left"
                  onClick={() => setExpanded(isOpen ? null : fam)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <Badge className={`${FAMILY_COLOR[fam] || FAMILY_COLOR.OTHER} border`}>
                      {fam}
                    </Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/70 transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="pl-2 pt-2 space-y-1 text-xs">
                    {topReasons.map(([reason, c]) => (
                      <div
                        key={reason}
                        className="flex justify-between items-center py-1 px-2 rounded bg-muted/40"
                      >
                        <span className="font-mono truncate mr-2" title={reason}>
                          {reason}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 border-t border-border/60 flex items-start gap-2 text-xs text-muted-foreground">
        <TrendingDown className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          En büyük aileler asıl bottleneck'i gösterir. Yeşil filtre değil, kırmızı
          filtre eklendiğinde bu grafik dengelenmelidir. Bir aile toplamın %50+'sına ulaşıyorsa,
          o kategoride kural sadeleştirme veya soft-sizing'e dönüşüm önceliklidir.
        </span>
      </div>
    </Card>
  );
}
