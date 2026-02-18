import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClosedPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  opened_at: string;
  closed_at: string | null;
  updated_at?: string;
  strategy_name: string | null;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
  close_reason?: string | null;
  is_hedge?: boolean;
  parent_position_id?: string | null;
  confidence_score?: number | null;
  trend_consistency?: number | null;
  peak_pnl_percent?: number | null;
  trading_fee_amount?: number | null;
  trading_fee_percent?: number | null;
  current_price?: number | null;
}

export const useClosedPositions = (includeArchived: boolean = false) => {
  return useQuery({
    queryKey: ["closed-positions", includeArchived],
    queryFn: async () => {
      if (includeArchived) {
        const { data, error } = await supabase
          .from("positions_with_archive")
          .select('*')
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(200);

        if (error) throw error;
        return data as ClosedPosition[];
      } else {
        const { data, error } = await supabase
          .from("positions")
          .select('*')
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(200);

        if (error) throw error;
        return data as ClosedPosition[];
      }
    },
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    placeholderData: (prev) => prev,
  });
};
