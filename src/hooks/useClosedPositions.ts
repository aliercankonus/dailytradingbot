import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClosedPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  opened_at: string;
  updated_at: string;
  trade_id: string;
  opened_by_rebalancer?: boolean;
  closed_by_rebalancer?: boolean;
  trades?: {
    strategy_name: string;
    profit_loss: number;
    profit_loss_percent: number;
    closed_at: string;
  };
}

export const useClosedPositions = () => {
  return useQuery({
    queryKey: ["closed-positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select(`
          *,
          trades(
            strategy_name,
            profit_loss,
            profit_loss_percent,
            closed_at
          )
        `)
        .eq("status", "closed")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as ClosedPosition[];
    },
  });
};
