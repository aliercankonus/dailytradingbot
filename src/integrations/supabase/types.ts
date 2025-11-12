export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      backtesting_results: {
        Row: {
          avg_loss: number | null
          avg_win: number | null
          created_at: string | null
          end_date: string
          final_capital: number | null
          id: string
          initial_capital: number
          largest_loss: number | null
          largest_win: number | null
          losing_trades: number | null
          max_drawdown: number | null
          net_profit: number | null
          profit_factor: number | null
          results_data: Json | null
          sharpe_ratio: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_loss: number | null
          total_profit: number | null
          total_trades: number | null
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string | null
          end_date: string
          final_capital?: number | null
          id?: string
          initial_capital?: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number | null
          max_drawdown?: number | null
          net_profit?: number | null
          profit_factor?: number | null
          results_data?: Json | null
          sharpe_ratio?: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_loss?: number | null
          total_profit?: number | null
          total_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string | null
          end_date?: string
          final_capital?: number | null
          id?: string
          initial_capital?: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number | null
          max_drawdown?: number | null
          net_profit?: number | null
          profit_factor?: number | null
          results_data?: Json | null
          sharpe_ratio?: number | null
          start_date?: string
          strategy_name?: string
          symbol?: string
          total_loss?: number | null
          total_profit?: number | null
          total_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          message: string
          sent_at: string | null
          trade_id: string | null
          type: string
        }
        Insert: {
          id?: string
          message: string
          sent_at?: string | null
          trade_id?: string | null
          type: string
        }
        Update: {
          id?: string
          message?: string
          sent_at?: string | null
          trade_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          current_price: number | null
          entry_price: number
          id: string
          opened_at: string | null
          quantity: number
          side: string
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          trade_id: string | null
          unrealized_pnl: number | null
          unrealized_pnl_percent: number | null
          updated_at: string | null
        }
        Insert: {
          current_price?: number | null
          entry_price: number
          id?: string
          opened_at?: string | null
          quantity: number
          side: string
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          trade_id?: string | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          current_price?: number | null
          entry_price?: number
          id?: string
          opened_at?: string | null
          quantity?: number
          side?: string
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          trade_id?: string | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_parameters: {
        Row: {
          consecutive_loss_threshold: number
          consecutive_losses: number | null
          current_open_trades: number | null
          id: string
          is_trading_enabled: boolean | null
          max_open_trades: number
          max_risk_per_trade_percent: number
          notification_phone: string | null
          paper_trading_mode: boolean | null
          portfolio_value: number
          position_size_reduction_percent: number
          sms_notifications_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          current_open_trades?: number | null
          id?: string
          is_trading_enabled?: boolean | null
          max_open_trades?: number
          max_risk_per_trade_percent?: number
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          sms_notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          current_open_trades?: number | null
          id?: string
          is_trading_enabled?: boolean | null
          max_open_trades?: number
          max_risk_per_trade_percent?: number
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          sms_notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      strategy_performance: {
        Row: {
          id: string
          last_updated: string | null
          max_drawdown: number | null
          status: string
          strategy_name: string
          total_profit: number | null
          total_trades: number | null
          winning_trades: number | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          max_drawdown?: number | null
          status?: string
          strategy_name: string
          total_profit?: number | null
          total_trades?: number | null
          winning_trades?: number | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          max_drawdown?: number | null
          status?: string
          strategy_name?: string
          total_profit?: number | null
          total_trades?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          binance_order_id: string | null
          closed_at: string | null
          created_at: string | null
          entry_price: number
          executed_at: string | null
          exit_price: number | null
          id: string
          order_type: string
          profit_loss: number | null
          profit_loss_percent: number | null
          quantity: number
          side: string
          signal_id: string | null
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
        }
        Insert: {
          binance_order_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          executed_at?: string | null
          exit_price?: number | null
          id?: string
          order_type: string
          profit_loss?: number | null
          profit_loss_percent?: number | null
          quantity: number
          side: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
        }
        Update: {
          binance_order_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          executed_at?: string | null
          exit_price?: number | null
          id?: string
          order_type?: string
          profit_loss?: number | null
          profit_loss_percent?: number | null
          quantity?: number
          side?: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trading_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_signals: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          entry_price: number | null
          expires_at: string | null
          id: string
          indicators: Json | null
          reason: string | null
          risk_reward_ratio: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          trend: Database["public"]["Enums"]["market_trend"]
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          trend: Database["public"]["Enums"]["market_trend"]
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type?: Database["public"]["Enums"]["signal_type"]
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          trend?: Database["public"]["Enums"]["market_trend"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      market_trend: "bullish" | "bearish" | "ranging"
      signal_type: "long" | "short" | "hold" | "exit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      market_trend: ["bullish", "bearish", "ranging"],
      signal_type: ["long", "short", "hold", "exit"],
    },
  },
} as const
