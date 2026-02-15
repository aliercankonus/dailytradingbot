import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BotHeartbeat {
  id: string;
  recorded_at: string;
  symbols_scanned: number;
  signals_generated: number;
  rejections_logged: number;
  no_trade_state: string | null;
  no_trade_reason: string | null;
  details: Record<string, unknown> | null;
}

export interface BotHealthState {
  id: string;
  state_type: string;
  state: string;
  started_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  alert_sent: boolean;
  alert_sent_at: string | null;
  details: Record<string, unknown> | null;
}

export const useBotHeartbeats = (limit = 50) => {
  return useQuery({
    queryKey: ["bot-heartbeats", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_heartbeat")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as BotHeartbeat[];
    },
    refetchInterval: 30000,
  });
};

export const useBotHealthStates = (limit = 50) => {
  return useQuery({
    queryKey: ["bot-health-states", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_health_state")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as BotHealthState[];
    },
    refetchInterval: 30000,
  });
};
