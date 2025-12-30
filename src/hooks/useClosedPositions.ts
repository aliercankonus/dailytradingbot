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
  strategy_name: string | null;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
  close_reason?: string | null;
  is_hedge?: boolean;
  parent_position_id?: string | null;
  confidence_score?: number | null;
  trend_consistency?: number | null;
  peak_pnl_percent?: number | null;
}

export const useClosedPositions = (includeArchived: boolean = false) => {
  return useQuery({
    queryKey: ["closed-positions", includeArchived],
    queryFn: async () => {
      if (includeArchived) {
        // Query the combined view that includes both active and archived
        const { data, error } = await supabase
          .from("positions_with_archive")
          .select('*')
          .eq("status", "closed")
          .order("closed_at", { ascending: false });

        if (error) throw error;
        return data as ClosedPosition[];
      } else {
        // Query only the main positions table
        const { data, error } = await supabase
          .from("positions")
          .select('*')
          .eq("status", "closed")
          .order("closed_at", { ascending: false });

        if (error) throw error;
        return data as ClosedPosition[];
      }
    },
  });
};
