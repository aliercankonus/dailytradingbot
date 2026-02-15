import { useState, lazy, Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Ban,
  Brain,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useSignals } from "@/hooks/useSignals";
import { useBlockedSignals } from "@/hooks/useBlockedSignals";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TradingSignalsDashboard = lazy(() =>
  import("@/components/TradingSignalsDashboard").then((m) => ({
    default: m.TradingSignalsDashboard,
  }))
);
const SignalRejectionMonitor = lazy(() =>
  import("@/components/SignalRejectionMonitor").then((m) => ({
    default: m.SignalRejectionMonitor,
  }))
);
const AIAnalysisDashboard = lazy(() =>
  import("@/components/AIAnalysisDashboard").then((m) => ({
    default: m.AIAnalysisDashboard,
  }))
);

type Section = "signals" | "rejections" | "ai" | null;

export const SignalsOverview = () => {
  const [expanded, setExpanded] = useState<Section>(null);
  const { signals } = useSignals();
  const { data: blockedSignals } = useBlockedSignals(100);
  const { user } = useAuth();

  // Lightweight AI analysis count
  const { data: aiCount } = useQuery({
    queryKey: ["ai-analysis-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ai_signal_analysis")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // Count rejections from last 30 minutes
  const recentRejections = (() => {
    if (!blockedSignals) return 0;
    const cutoff = Date.now() - 30 * 60 * 1000;
    return blockedSignals.filter(
      (s) => new Date(s.checked_at).getTime() > cutoff
    ).length;
  })();

  const toggle = (section: Section) => {
    setExpanded((prev) => (prev === section ? null : section));
  };

  const activeCount = signals.length;
  const longCount = signals.filter((s) => s.signal_type === "long").length;
  const shortCount = signals.filter((s) => s.signal_type === "short").length;

  return (
    <div className="space-y-4">
      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Active Signals Card */}
        <Card
          className={`p-4 cursor-pointer transition-all hover:shadow-md ${
            expanded === "signals"
              ? "ring-2 ring-primary/50 bg-primary/5"
              : "hover:bg-accent/30"
          }`}
          onClick={() => toggle("signals")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Active Signals</span>
            </div>
            {expanded === "signals" ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{activeCount}</span>
            {activeCount > 0 && (
              <div className="flex gap-1.5">
                {longCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30"
                  >
                    {longCount} Long
                  </Badge>
                )}
                {shortCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-red-500/10 text-red-500 border-red-500/30"
                  >
                    {shortCount} Short
                  </Badge>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {activeCount === 0
              ? "No actionable signals right now"
              : "Click to view details & execute"}
          </p>
        </Card>

        {/* Rejections Card */}
        <Card
          className={`p-4 cursor-pointer transition-all hover:shadow-md ${
            expanded === "rejections"
              ? "ring-2 ring-orange-500/50 bg-orange-500/5"
              : "hover:bg-accent/30"
          }`}
          onClick={() => toggle("rejections")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Rejections</span>
            </div>
            {expanded === "rejections" ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{recentRejections}</span>
            <span className="text-xs text-muted-foreground">last 30m</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {recentRejections === 0
              ? "All clear — no blocks"
              : "Click to see why signals were blocked"}
          </p>
        </Card>

        {/* AI Analysis Card */}
        <Card
          className={`p-4 cursor-pointer transition-all hover:shadow-md ${
            expanded === "ai"
              ? "ring-2 ring-purple-500/50 bg-purple-500/5"
              : "hover:bg-accent/30"
          }`}
          onClick={() => toggle("ai")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">AI Analysis</span>
            </div>
            {expanded === "ai" ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{aiCount ?? 0}</span>
            <span className="text-xs text-muted-foreground">evaluations</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            AI-powered signal recommendations
          </p>
        </Card>
      </div>

      {/* Expanded Section */}
      {expanded && (
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          {expanded === "signals" && <TradingSignalsDashboard />}
          {expanded === "rejections" && <SignalRejectionMonitor />}
          {expanded === "ai" && <AIAnalysisDashboard />}
        </Suspense>
      )}
    </div>
  );
};
