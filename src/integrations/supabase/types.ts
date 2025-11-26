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
          strategy_id: string | null
          strategy_name: string
          symbol: string
          total_loss: number | null
          total_profit: number | null
          total_trades: number | null
          user_id: string | null
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
          strategy_id?: string | null
          strategy_name: string
          symbol: string
          total_loss?: number | null
          total_profit?: number | null
          total_trades?: number | null
          user_id?: string | null
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
          strategy_id?: string | null
          strategy_name?: string
          symbol?: string
          total_loss?: number | null
          total_profit?: number | null
          total_trades?: number | null
          user_id?: string | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtesting_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "custom_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_strategies: {
        Row: {
          created_at: string | null
          description: string | null
          entry_conditions: Json
          exit_conditions: Json
          id: string
          indicators: Json
          is_active: boolean | null
          name: string
          risk_settings: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          indicators?: Json
          is_active?: boolean | null
          name: string
          risk_settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          indicators?: Json
          is_active?: boolean | null
          name?: string
          risk_settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
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
          user_id: string | null
        }
        Insert: {
          id?: string
          message: string
          sent_at?: string | null
          trade_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          id?: string
          message?: string
          sent_at?: string | null
          trade_id?: string | null
          type?: string
          user_id?: string | null
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
      portfolio_performance_history: {
        Row: {
          avg_loss: number | null
          avg_win: number | null
          consecutive_losses: number | null
          created_at: string
          daily_loss: number | null
          id: string
          initial_portfolio_value: number
          largest_loss: number | null
          largest_win: number | null
          losing_trades: number
          max_drawdown: number | null
          max_open_positions: number
          open_positions: number
          paper_trading_mode: boolean
          portfolio_value: number
          profit_factor: number | null
          realized_pnl: number
          snapshot_date: string
          snapshot_time: string
          total_pnl: number
          total_return_percent: number
          total_trades: number
          unrealized_pnl: number
          user_id: string
          win_rate: number
          winning_trades: number
        }
        Insert: {
          avg_loss?: number | null
          avg_win?: number | null
          consecutive_losses?: number | null
          created_at?: string
          daily_loss?: number | null
          id?: string
          initial_portfolio_value: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number
          max_drawdown?: number | null
          max_open_positions?: number
          open_positions?: number
          paper_trading_mode?: boolean
          portfolio_value: number
          profit_factor?: number | null
          realized_pnl?: number
          snapshot_date: string
          snapshot_time?: string
          total_pnl?: number
          total_return_percent?: number
          total_trades?: number
          unrealized_pnl?: number
          user_id: string
          win_rate?: number
          winning_trades?: number
        }
        Update: {
          avg_loss?: number | null
          avg_win?: number | null
          consecutive_losses?: number | null
          created_at?: string
          daily_loss?: number | null
          id?: string
          initial_portfolio_value?: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number
          max_drawdown?: number | null
          max_open_positions?: number
          open_positions?: number
          paper_trading_mode?: boolean
          portfolio_value?: number
          profit_factor?: number | null
          realized_pnl?: number
          snapshot_date?: string
          snapshot_time?: string
          total_pnl?: number
          total_return_percent?: number
          total_trades?: number
          unrealized_pnl?: number
          user_id?: string
          win_rate?: number
          winning_trades?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          close_reason: string | null
          closed_by_rebalancer: boolean | null
          confidence_score: number | null
          current_price: number | null
          entry_price: number
          id: string
          opened_at: string | null
          opened_by_rebalancer: boolean | null
          quantity: number
          side: string
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          trade_id: string | null
          trend: string | null
          trend_consistency: number | null
          unrealized_pnl: number | null
          unrealized_pnl_percent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          close_reason?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_price: number
          id?: string
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          quantity: number
          side: string
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          trade_id?: string | null
          trend?: string | null
          trend_consistency?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          close_reason?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_price?: number
          id?: string
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          quantity?: number
          side?: string
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          trade_id?: string | null
          trend?: string | null
          trend_consistency?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string | null
          user_id?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      risk_parameters: {
        Row: {
          auto_execute_signals: boolean | null
          auto_rebalance_enabled: boolean | null
          consecutive_loss_threshold: number
          consecutive_losses: number | null
          current_open_trades: number | null
          daily_loss_limit_percent: number
          daily_realized_loss: number | null
          divergence_sl_multiplier: number | null
          divergence_tp_multiplier: number | null
          early_reversal_position_size_percent: number | null
          email_notifications_enabled: boolean | null
          enable_early_reversal_signals: boolean | null
          enable_pullback_signals: boolean | null
          id: string
          is_trading_enabled: boolean | null
          last_loss_reset_date: string | null
          max_open_trades: number
          max_positions_to_close_per_cycle: number | null
          max_risk_per_trade_percent: number
          max_trades_per_symbol: number
          min_confidence_threshold: number
          min_trend_consistency: number
          notification_email: string | null
          notification_phone: string | null
          paper_trading_mode: boolean | null
          portfolio_value: number
          position_size_reduction_percent: number
          pullback_position_size_percent: number | null
          rebalance_loss_threshold_percent: number | null
          sms_notifications_enabled: boolean | null
          standard_tp_multiplier: number | null
          trailing_stop_activation_percent: number | null
          trailing_stop_distance_multiplier: number | null
          trailing_stop_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_execute_signals?: boolean | null
          auto_rebalance_enabled?: boolean | null
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          current_open_trades?: number | null
          daily_loss_limit_percent?: number
          daily_realized_loss?: number | null
          divergence_sl_multiplier?: number | null
          divergence_tp_multiplier?: number | null
          early_reversal_position_size_percent?: number | null
          email_notifications_enabled?: boolean | null
          enable_early_reversal_signals?: boolean | null
          enable_pullback_signals?: boolean | null
          id?: string
          is_trading_enabled?: boolean | null
          last_loss_reset_date?: string | null
          max_open_trades?: number
          max_positions_to_close_per_cycle?: number | null
          max_risk_per_trade_percent?: number
          max_trades_per_symbol?: number
          min_confidence_threshold?: number
          min_trend_consistency?: number
          notification_email?: string | null
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          pullback_position_size_percent?: number | null
          rebalance_loss_threshold_percent?: number | null
          sms_notifications_enabled?: boolean | null
          standard_tp_multiplier?: number | null
          trailing_stop_activation_percent?: number | null
          trailing_stop_distance_multiplier?: number | null
          trailing_stop_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_execute_signals?: boolean | null
          auto_rebalance_enabled?: boolean | null
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          current_open_trades?: number | null
          daily_loss_limit_percent?: number
          daily_realized_loss?: number | null
          divergence_sl_multiplier?: number | null
          divergence_tp_multiplier?: number | null
          early_reversal_position_size_percent?: number | null
          email_notifications_enabled?: boolean | null
          enable_early_reversal_signals?: boolean | null
          enable_pullback_signals?: boolean | null
          id?: string
          is_trading_enabled?: boolean | null
          last_loss_reset_date?: string | null
          max_open_trades?: number
          max_positions_to_close_per_cycle?: number | null
          max_risk_per_trade_percent?: number
          max_trades_per_symbol?: number
          min_confidence_threshold?: number
          min_trend_consistency?: number
          notification_email?: string | null
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          pullback_position_size_percent?: number | null
          rebalance_loss_threshold_percent?: number | null
          sms_notifications_enabled?: boolean | null
          standard_tp_multiplier?: number | null
          trailing_stop_activation_percent?: number | null
          trailing_stop_distance_multiplier?: number | null
          trailing_stop_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      setup_performance: {
        Row: {
          avg_loss: number | null
          avg_profit: number | null
          created_at: string | null
          id: string
          losing_trades: number | null
          profit_factor: number | null
          setup_pattern: string
          strategy_name: string
          symbol: string
          total_trades: number | null
          updated_at: string | null
          user_id: string
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          avg_loss?: number | null
          avg_profit?: number | null
          created_at?: string | null
          id?: string
          losing_trades?: number | null
          profit_factor?: number | null
          setup_pattern: string
          strategy_name: string
          symbol: string
          total_trades?: number | null
          updated_at?: string | null
          user_id: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          avg_loss?: number | null
          avg_profit?: number | null
          created_at?: string | null
          id?: string
          losing_trades?: number | null
          profit_factor?: number | null
          setup_pattern?: string
          strategy_name?: string
          symbol?: string
          total_trades?: number | null
          updated_at?: string | null
          user_id?: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      signal_rejection_log: {
        Row: {
          checked_at: string
          created_at: string | null
          filters_status: Json | null
          id: string
          rejection_reason: string
          symbol: string
          trend_data: Json | null
          user_id: string
        }
        Insert: {
          checked_at?: string
          created_at?: string | null
          filters_status?: Json | null
          id?: string
          rejection_reason: string
          symbol: string
          trend_data?: Json | null
          user_id: string
        }
        Update: {
          checked_at?: string
          created_at?: string | null
          filters_status?: Json | null
          id?: string
          rejection_reason?: string
          symbol?: string
          trend_data?: Json | null
          user_id?: string
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      strategy_rotation_config: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          market_condition_weight: number | null
          min_trades_required: number | null
          performance_threshold_percent: number | null
          performance_weight: number | null
          rotation_interval_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          market_condition_weight?: number | null
          min_trades_required?: number | null
          performance_threshold_percent?: number | null
          performance_weight?: number | null
          rotation_interval_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          market_condition_weight?: number | null
          min_trades_required?: number | null
          performance_threshold_percent?: number | null
          performance_weight?: number | null
          rotation_interval_minutes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      strategy_rotation_history: {
        Row: {
          from_strategy_id: string | null
          from_strategy_name: string
          id: string
          market_condition: Json | null
          performance_metrics: Json | null
          reason: string
          rotated_at: string | null
          to_strategy_id: string | null
          to_strategy_name: string
          user_id: string | null
        }
        Insert: {
          from_strategy_id?: string | null
          from_strategy_name: string
          id?: string
          market_condition?: Json | null
          performance_metrics?: Json | null
          reason: string
          rotated_at?: string | null
          to_strategy_id?: string | null
          to_strategy_name: string
          user_id?: string | null
        }
        Update: {
          from_strategy_id?: string | null
          from_strategy_name?: string
          id?: string
          market_condition?: Json | null
          performance_metrics?: Json | null
          reason?: string
          rotated_at?: string | null
          to_strategy_id?: string | null
          to_strategy_name?: string
          user_id?: string | null
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
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          user_id: string | null
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
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          user_id?: string | null
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
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          user_id?: string | null
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
          created_by_rebalancer: boolean | null
          entry_price: number | null
          expires_at: string | null
          id: string
          indicators: Json | null
          reason: string | null
          risk_reward_ratio: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          stop_loss: number | null
          strategy_id: string | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          trend: Database["public"]["Enums"]["market_trend"]
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_rebalancer?: boolean | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          stop_loss?: number | null
          strategy_id?: string | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          trend: Database["public"]["Enums"]["market_trend"]
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_rebalancer?: boolean | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type?: Database["public"]["Enums"]["signal_type"]
          stop_loss?: number | null
          strategy_id?: string | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          trend?: Database["public"]["Enums"]["market_trend"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trading_signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "custom_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_symbols_config: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          binance_api_key: string | null
          binance_api_secret: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      portfolio_metrics_view: {
        Row: {
          avg_loss: number | null
          avg_win: number | null
          largest_loss: number | null
          largest_win: number | null
          losing_trades: number | null
          realized_pnl: number | null
          total_closed_trades: number | null
          user_id: string | null
          win_rate: number | null
          winning_trades: number | null
        }
        Relationships: []
      }
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
