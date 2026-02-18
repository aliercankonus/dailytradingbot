import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FunctionMetric {
  id: string;
  function_name: string;
  user_id: string | null;
  duration_ms: number;
  phase_timings: Record<string, number> | null;
  success: boolean;
  error_message: string | null;
  symbols_count: number | null;
  created_at: string;
}

export interface FunctionMetricStats {
  avg: number;
  p95: number;
  max: number;
  min: number;
  latest: number;
  count: number;
  errorRate: number;
  latestTimestamp: string;
}

const calculateP95 = (sorted: number[]): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
};

export const computeStats = (metrics: FunctionMetric[]): FunctionMetricStats | null => {
  if (!metrics.length) return null;
  const durations = metrics.map((m) => m.duration_ms);
  const sorted = [...durations].sort((a, b) => a - b);
  const errors = metrics.filter((m) => !m.success).length;
  return {
    avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    p95: calculateP95(sorted),
    max: Math.max(...durations),
    min: Math.min(...durations),
    latest: durations[0],
    count: durations.length,
    errorRate: Math.round((errors / metrics.length) * 100),
    latestTimestamp: metrics[0].created_at,
  };
};

export const useFunctionMetrics = (functionName: string, limit = 100) => {
  return useQuery({
    queryKey: ["function-metrics", functionName, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("function_metrics")
        .select("id, function_name, user_id, duration_ms, phase_timings, success, error_message, symbols_count, created_at")
        .eq("function_name", functionName)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as FunctionMetric[];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
