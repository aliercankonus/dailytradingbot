import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSignalRefresh } from "@/contexts/SignalRefreshContext";

// Zone analytics types for MOVE_EXHAUSTION gate
export type MoveZone = 'FRESH' | 'SOFT' | 'HARD' | 'EXCEPTION' | 'RELAXED_SOFT' | 'RELAXED_HARD';
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
  relaxationApplied?: boolean;
  relaxationCondition?: string;
}

export interface BlockedSignal {
  id: string;
  symbol: string;
  rejection_reason: string;
  checked_at: string;
  filters_status: {
    adx?: number;
    adxPhase?: string;
    // NEW: ADX slope tracking for mean reversion diagnostics
    adxSlope?: number;
    adxRising?: boolean;
    adx15m?: number;
    adx30m?: number;
    adx4h?: number;
    stochRsiK?: number;
    stochRsiD?: number;           // NEW: 4h D value for reversal quality
    stochRsiK4h?: number;
    stochRsiD4h?: number;         // NEW: Explicit 4h D
    stochRsiK1h?: number;         // NEW: 1h K for LTF alignment
    stochRsiD1h?: number;         // NEW: 1h D for LTF alignment
    stochRsiK30m?: number;        // 30m K
    stochRsiD30m?: number;        // 30m D
    stochRsiK15m?: number;        // 15m K
    stochRsiD15m?: number;        // 15m D
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
    // NEW: Momentum weight in direction derivation
    momentumImpact?: 'aligned' | 'weak_opposing' | 'strong_opposing' | 'neutral';
    momentumScore?: number;
    momentumConfidenceReduction?: number;
    // NEW: Triple-stack reduction tracking (BE prevention gates)
    adxSlopeMultiplier?: number;
    highAdx1hMultiplier?: number;
    stochRsiRunwayMultiplier?: number;
    ltfConfirmationMultiplier?: number;
    moveExhaustionMultiplier?: number;
    momentumMultiplier?: number;
    combinedMultiplier?: number;
    activeGateCount?: number;
    // NEW: Bollinger Breakdown Override tracking
    percentB?: string | number;
    bollingerBreakdownChecked?: boolean;
    // NEW: Near-Extreme Protection relaxation tracking
    nearExtremeRelaxationApplied?: boolean;
    nearExtremeRelaxationTrigger?: string;
    softZoneThreshold?: number;
    hardZoneThreshold?: number;
    // NEW: Momentum context for ADX gate cognitive completeness
    momentumDirection?: string;
    momentumState?: string;
    // NEW: Mean reversion context
    meanReversionChecked?: boolean;
    meanReversionDetected?: boolean;
    meanReversionDirection?: string | null;
    meanReversionScore?: number;
    meanReversionAllowed?: boolean;
    // NEW: Bypass eligibility checks
    squeezeCheck?: { wouldPass?: boolean; failReasons?: string[] };
    earlyIgnitionCheck?: { wouldPass?: boolean; failReasons?: string[] };
    overrideReason?: string;
    // NEW: Position multiplier for size reduction tracking
    positionMultiplier?: number;
    // Direction derivation
    derivedDirection?: string;
    direction?: string;
    // NEW: Flash Crash Bounce Probe metadata
    flashCrashProbeChecked?: boolean;
    flashCrashProbeActive?: boolean;
    flashCrashDropPercent?: number;
    flashCrashDropHours?: number;
    flashCrashDropRatePerHour?: number;
    flashCrashReversalCandle?: boolean;
    // NEW: Flash Crash Bounce Probe Phase 2 (temporal) diagnostics
    flashCrashPhase1Triggered?: boolean;
    flashCrashPhase2Triggered?: boolean;
    flashCrashPhase2Diagnostics?: {
      recentMinK?: number;
      currentK?: number;
      kRise?: number;
      risingSteps?: number;
      minRisingSteps?: number;
      wasAtFloor?: boolean;
      currentKRecovering?: boolean;
      hasMinRise?: boolean;
      momentumStabilizing?: boolean;
      momentumScore?: number;
      phase2MomentumMax?: number;
      historySource?: '4h' | '1h' | 'none';
      recentKValuesCount?: number;
    } | null;
    // NEW: Capitulation Bounce Probe metadata
    capitulationProbeChecked?: boolean;
    capitulationProbeActive?: boolean;
    // Allow additional dynamic properties
    [key: string]: unknown;
  } | null;
  trend_data: {
    direction?: string;
    confidence4h?: number;
    confidence1h?: number;
    microTrendDirection?: string;
    // Additional trend data properties
    volatility?: { adx?: number; adxSlope?: number };
    momentum?: { direction?: string };
    stochasticRsi?: Record<string, { k?: number }>;
    // Allow additional dynamic properties
    [key: string]: unknown;
  } | null;
}

export function useBlockedSignals(limit: number = 20) {
  const { user } = useAuth();
  const { lastRefreshTime } = useSignalRefresh();

  return useQuery({
    // Include lastRefreshTime in queryKey to trigger refetch when central refresh happens
    queryKey: ["blocked-signals", user?.id, limit, lastRefreshTime],
    queryFn: async (): Promise<BlockedSignal[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("signal_rejection_log")
        .select("id, symbol, rejection_reason, checked_at, filters_status, trend_data")
        .eq("user_id", user.id)
        .order("checked_at", { ascending: false })
        .limit(Math.min(limit, 200));

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
    staleTime: 55000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    structuralSharing: true,
  });
}
