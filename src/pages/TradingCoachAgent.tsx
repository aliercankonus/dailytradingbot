import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, Sparkles, AlertTriangle, TrendingUp, Wrench, Copy, ClipboardList, CheckCircle2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { planActionApply, type ProposedAction } from "@/lib/coach-action-apply";

interface AgentReport {
  id: string;
  period_days: number;
  status: string;
  model: string | null;
  executive_summary: string | null;
  kpis: Record<string, any>;
  systemic_errors: Array<{ title: string; evidence: string; impact: string; confidence: string }>;
  strategy_verdict: Array<{ strategy: string; trades: number; verdict: string; reason: string }>;
  proposed_actions: ProposedAction[];
  raw_input_stats: Record<string, any>;
  error_message: string | null;
  tokens_used: number | null;
  created_at: string;
  completed_at: string | null;
}

const impactColor = (v: string) =>
  v === "high" ? "destructive" : v === "medium" ? "default" : "secondary";
const verdictColor = (v: string) =>
  v === "kill" ? "destructive" : v === "tune" ? "default" : v === "keep" ? "secondary" : "outline";

export default function TradingCoachAgent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState("30");
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadReports = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("agent_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      toast({ title: "Failed to load reports", description: error.message, variant: "destructive" });
    } else {
      setReports((data as unknown as AgentReport[]) ?? []);
      if ((data?.length ?? 0) > 0 && !activeId) setActiveId(data![0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("trading-coach-agent", {
        body: { period_days: Number(period) },
      });
      if (error) throw error;
      toast({ title: "Report generated", description: `Analyzed ${period} days of trading data.` });
      await loadReports();
      if (data?.report_id) setActiveId(data.report_id);
    } catch (e: any) {
      toast({ title: "Agent failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Apply-action state
  const [pendingApply, setPendingApply] = useState<{ reportId: string; index: number; action: ProposedAction } | null>(null);
  const [applying, setApplying] = useState(false);

  const applyAction = async () => {
    if (!pendingApply || !user) return;
    const plan = planActionApply(pendingApply.action);
    if (plan.applicable !== true) {
      toast({ title: "Uygulanamaz", description: plan.reason, variant: "destructive" });
      setPendingApply(null);
      return;
    }
    setApplying(true);
    try {
      // 1. Update the whitelisted column on risk_parameters (RLS scopes to user_id).
      const { error: rpErr } = await supabase
        .from("risk_parameters")
        .update({ [plan.column!]: plan.value as any })
        .eq("user_id", user.id);
      if (rpErr) throw rpErr;

      // 2. Mark this action as applied in the agent_reports row.
      const report = reports.find((r) => r.id === pendingApply.reportId);
      if (report) {
        const nextActions = report.proposed_actions.map((a, i) =>
          i === pendingApply.index
            ? { ...a, applied: true, applied_at: new Date().toISOString(), applied_value: plan.displayValue }
            : a,
        );
        const { error: updErr } = await supabase
          .from("agent_reports")
          .update({ proposed_actions: nextActions as any })
          .eq("id", pendingApply.reportId);
        if (updErr) throw updErr;
        setReports((prev) => prev.map((r) => (r.id === pendingApply.reportId ? { ...r, proposed_actions: nextActions } : r)));
      }

      toast({
        title: "Aksiyon uygulandı",
        description: `${plan.column} = ${plan.displayValue}`,
      });
      setPendingApply(null);
    } catch (e: any) {
      toast({ title: "Uygulama başarısız", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const active = reports.find((r) => r.id === activeId) ?? null;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            Trading Coach Agent
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered forensic audit of all trades, blocked signals, and gate rejections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={generate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Generate Report
              </>
            )}
          </Button>
          <Button variant="outline" size="icon" onClick={loadReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Reports list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {loading && (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            )}
            {!loading && reports.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No reports yet. Click <b>Generate Report</b>.
              </p>
            )}
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  activeId === r.id ? "bg-accent border-primary" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{r.period_days}d</span>
                  <Badge
                    variant={
                      r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"
                    }
                    className="text-xs"
                  >
                    {r.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Active report */}
        <div className="space-y-4">
          {!active && !loading && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Select or generate a report to view.
              </CardContent>
            </Card>
          )}

          {active && active.status === "failed" && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> Report failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{active.error_message}</p>
              </CardContent>
            </Card>
          )}

          {active && active.status === "completed" && (
            <>
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Executive Summary</CardTitle>
                  <CardDescription>
                    Period: {active.period_days} days · Model: {active.model} · Tokens:{" "}
                    {active.tokens_used ?? "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{active.executive_summary ?? "_No summary._"}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>

              {/* KPIs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> KPIs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(active.kpis ?? {}).map(([k, v]) => (
                      <div key={k} className="p-3 rounded-lg bg-muted/50">
                        <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                        <div className="text-lg font-semibold">
                          {typeof v === "number" ? v.toFixed(2) : String(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="errors">
                <TabsList>
                  <TabsTrigger value="errors">
                    Systemic Errors ({active.systemic_errors?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="strategies">
                    Strategies ({active.strategy_verdict?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="actions">
                    Actions ({active.proposed_actions?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="raw">Raw Input</TabsTrigger>
                </TabsList>

                <TabsContent value="errors" className="space-y-3 mt-4">
                  {(active.systemic_errors ?? []).map((e, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{e.title}</CardTitle>
                          <div className="flex gap-2">
                            <Badge variant={impactColor(e.impact) as any}>impact: {e.impact}</Badge>
                            <Badge variant="outline">conf: {e.confidence}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">{e.evidence}</CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="strategies" className="space-y-3 mt-4">
                  {(active.strategy_verdict ?? []).map((s, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{s.strategy}</CardTitle>
                          <div className="flex gap-2">
                            <Badge variant="outline">{s.trades} trades</Badge>
                            <Badge variant={verdictColor(s.verdict) as any}>{s.verdict}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">{s.reason}</CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="actions" className="space-y-3 mt-4">
                  {(active.proposed_actions ?? []).length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const all = (active.proposed_actions ?? [])
                            .map(
                              (a, i) =>
                                `${i + 1}. [${a.type}] ${a.target}\n   Current: ${a.current}\n   Proposed: ${a.proposed}\n   Rationale: ${a.rationale}`,
                            )
                            .join("\n\n");
                          const prompt = `Coach raporundaki şu önerileri uygula (dikkatlice, her birini ayrı ayrı değerlendirip mevcut mimariyi bozmadan):\n\n${all}`;
                          navigator.clipboard.writeText(prompt);
                          toast({ title: "Tüm aksiyonlar kopyalandı", description: "Lovable chat'e yapıştırıp gönder." });
                        }}
                      >
                        <ClipboardList className="h-4 w-4 mr-2" /> Tümünü prompt olarak kopyala
                      </Button>
                    </div>
                  )}
                  {(active.proposed_actions ?? []).map((a, i) => {
                    const plan = planActionApply(a);
                    const isApplied = !!a.applied;
                    return (
                      <Card key={i} className={isApplied ? "border-emerald-500/50" : ""}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Wrench className="h-4 w-4" /> {a.target}
                            {isApplied && (
                              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Uygulandı
                              </Badge>
                            )}
                            <Badge variant="outline" className="ml-auto">
                              {a.type}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded bg-muted/50">
                              <div className="text-xs text-muted-foreground">Current</div>
                              <code className="text-xs">{a.current}</code>
                            </div>
                            <div className="p-2 rounded bg-primary/10">
                              <div className="text-xs text-muted-foreground">Proposed</div>
                              <code className="text-xs">{a.proposed}</code>
                            </div>
                          </div>
                          <p className="text-muted-foreground">
                            <b>Rationale:</b> {a.rationale}
                          </p>
                          <p className="text-muted-foreground">
                            <b>Expected impact:</b> {a.expected_impact}
                          </p>
                          {isApplied && a.applied_at && (
                            <p className="text-xs text-emerald-500">
                              {formatDistanceToNow(new Date(a.applied_at), { addSuffix: true })} uygulandı
                              {a.applied_value ? ` → ${a.applied_value}` : ""}
                            </p>
                          )}
                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const prompt = `Coach agent şu öneriyi uygula:\n\nTip: ${a.type}\nHedef: ${a.target}\nMevcut: ${a.current}\nÖnerilen: ${a.proposed}\nGerekçe: ${a.rationale}\nBeklenen etki: ${a.expected_impact}\n\nMevcut mimariyi ve gate'leri bozmadan uygula, gerekli edge function'ları deploy et.`;
                                navigator.clipboard.writeText(prompt);
                                toast({ title: "Prompt kopyalandı", description: "Lovable chat'e yapıştırıp gönder." });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" /> Prompt olarak kopyala
                            </Button>
                            {plan.applicable && !isApplied && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => setPendingApply({ reportId: active.id, index: i, action: a })}
                              >
                                <PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Uygula
                              </Button>
                            )}
                            {!plan.applicable && !isApplied && (
                              <Button variant="outline" size="sm" disabled title={plan.reason}>
                                Otomatik uygulanamaz
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>



                <TabsContent value="raw" className="mt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <pre className="text-xs overflow-x-auto bg-muted/50 p-3 rounded">
                        {JSON.stringify(active.raw_input_stats, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}

          {active && active.status === "pending" && (
            <Card>
              <CardContent className="py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">Agent is analyzing…</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
