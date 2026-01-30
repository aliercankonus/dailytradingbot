import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Zone analytics types for MOVE_EXHAUSTION gate
export type MoveZone = 'FRESH' | 'SOFT' | 'HARD' | 'EXCEPTION';
export type MoveZoneOutcome = 'ALLOWED' | 'REDUCED' | 'BLOCKED' | 'EXCEPTION_ALLOWED';

export interface MoveZoneDetails {
  zone: MoveZone;
  distancePercent: number;
  direction: 'short' | 'long' | null;
  stochRsiK: number;
  adx: number;
  adxSlope: number;
  outcome: MoveZoneOutcome;
  positionMultiplier: number;
  overrideReason?: string;
}

export interface BlockedSignal {
  id: string;
  symbol: string;
  rejection_reason: string;
  checked_at: string;
  filters_status: {
    adx?: number;
    adxPhase?: string;
    stochRsiK?: number;
    stochRsiK4h?: number;
    trend4h?: string;
    trend1h?: string;
    squeeze?: boolean;
    quietTrendCheck?: string;
    priceMove?: number;
    // Symbol performance filter fields
    filterType?: string;
    winRate?: number;
    wins?: number;
    losses?: number;
    totalTrades?: number;
    strategiesCount?: number;
    threshold?: number;
    // NEW: Break-even and partial win tracking for fairer win rate
    breakEvenCount?: number;
    partialWinCount?: number;
    // NEW: Zone analytics for MOVE_EXHAUSTION gate
    moveZone?: MoveZone;
    moveZoneDetails?: MoveZoneDetails;
  } | null;
  trend_data: {
    direction?: string;
    confidence4h?: number;
    confidence1h?: number;
    microTrendDirection?: string;
  } | null;
}

export function useBlockedSignals(limit: number = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["blocked-signals", user?.id, limit],
    queryFn: async (): Promise<BlockedSignal[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("signal_rejection_log")
        .select("id, symbol, rejection_reason, checked_at, filters_status, trend_data")
        .eq("user_id", user.id)
        .order("checked_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching blocked signals:", error);
        throw error;
      }

      return (data || []).map((row) => ({
        id: row.id,
        symbol: row.symbol,
        rejection_reason: row.rejection_reason,
        checked_at: row.checked_at,
        filters_status: row.filters_status as BlockedSignal["filters_status"],
        trend_data: row.trend_data as BlockedSignal["trend_data"],
      }));
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
