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
      ai_signal_analysis: {
        Row: {
          confidence_adjustment: number | null
          created_at: string
          entry_price: number | null
          id: string
          key_factors: Json | null
          position_size_multiplier: number | null
          recommendation: string
          risk_level: string | null
          signal_type: string
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          trend_data: Json | null
          user_id: string
        }
        Insert: {
          confidence_adjustment?: number | null
          created_at?: string
          entry_price?: number | null
          id?: string
          key_factors?: Json | null
          position_size_multiplier?: number | null
          recommendation: string
          risk_level?: string | null
          signal_type: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          trend_data?: Json | null
          user_id: string
        }
        Update: {
          confidence_adjustment?: number | null
          created_at?: string
          entry_price?: number | null
          id?: string
          key_factors?: Json | null
          position_size_multiplier?: number | null
          recommendation?: string
          risk_level?: string | null
          signal_type?: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          trend_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          config: Json
          created_at: string | null
          duration_ms: number | null
          equity_curve: Json | null
          error_message: string | null
          gate_stats: Json | null
          id: string
          signals_log: Json | null
          status: string | null
          summary: Json | null
          trades: Json | null
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          duration_ms?: number | null
          equity_curve?: Json | null
          error_message?: string | null
          gate_stats?: Json | null
          id?: string
          signals_log?: Json | null
          status?: string | null
          summary?: Json | null
          trades?: Json | null
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          duration_ms?: number | null
          equity_curve?: Json | null
          error_message?: string | null
          gate_stats?: Json | null
          id?: string
          signals_log?: Json | null
          status?: string | null
          summary?: Json | null
          trades?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      bot_health_state: {
        Row: {
          alert_sent: boolean
          alert_sent_at: string | null
          details: Json | null
          id: string
          last_seen_at: string
          resolved_at: string | null
          started_at: string
          state: string
          state_type: string
          user_id: string
        }
        Insert: {
          alert_sent?: boolean
          alert_sent_at?: string | null
          details?: Json | null
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          started_at?: string
          state: string
          state_type: string
          user_id: string
        }
        Update: {
          alert_sent?: boolean
          alert_sent_at?: string | null
          details?: Json | null
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          started_at?: string
          state?: string
          state_type?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_heartbeat: {
        Row: {
          details: Json | null
          id: string
          no_trade_reason: string | null
          no_trade_state: string | null
          recorded_at: string
          rejections_logged: number
          signals_generated: number
          symbols_scanned: number
          user_id: string
        }
        Insert: {
          details?: Json | null
          id?: string
          no_trade_reason?: string | null
          no_trade_state?: string | null
          recorded_at?: string
          rejections_logged?: number
          signals_generated?: number
          symbols_scanned?: number
          user_id: string
        }
        Update: {
          details?: Json | null
          id?: string
          no_trade_reason?: string | null
          no_trade_state?: string | null
          recorded_at?: string
          rejections_logged?: number
          signals_generated?: number
          symbols_scanned?: number
          user_id?: string
        }
        Relationships: []
      }
      function_metrics: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          function_name: string
          id: string
          phase_timings: Json | null
          success: boolean
          symbols_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_message?: string | null
          function_name: string
          id?: string
          phase_timings?: Json | null
          success?: boolean
          symbols_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          function_name?: string
          id?: string
          phase_timings?: Json | null
          success?: boolean
          symbols_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      kline_cache: {
        Row: {
          candle_count: number
          candles: Json
          id: string
          interval: string
          source: string
          symbol: string
          updated_at: string
        }
        Insert: {
          candle_count?: number
          candles?: Json
          id?: string
          interval?: string
          source?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          candle_count?: number
          candles?: Json
          id?: string
          interval?: string
          source?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_regime_history: {
        Row: {
          adx: number | null
          adx_slope: number | null
          bb_squeeze: boolean | null
          bb_width: number | null
          effective_regime: string | null
          id: string
          recorded_at: string | null
          regime: string
          symbol: string
          trend_direction: string | null
          trend_strength: number | null
          user_id: string
        }
        Insert: {
          adx?: number | null
          adx_slope?: number | null
          bb_squeeze?: boolean | null
          bb_width?: number | null
          effective_regime?: string | null
          id?: string
          recorded_at?: string | null
          regime: string
          symbol: string
          trend_direction?: string | null
          trend_strength?: number | null
          user_id: string
        }
        Update: {
          adx?: number | null
          adx_slope?: number | null
          bb_squeeze?: boolean | null
          bb_width?: number | null
          effective_regime?: string | null
          id?: string
          recorded_at?: string | null
          regime?: string
          symbol?: string
          trend_direction?: string | null
          trend_strength?: number | null
          user_id?: string
        }
        Relationships: []
      }
      momentum_analysis: {
        Row: {
          ema_spread_roc: number | null
          id: string
          is_accelerating: boolean | null
          is_exhausted: boolean | null
          macd_slope: number | null
          momentum_score: number
          overextension_atr: number | null
          pullback_depth: number | null
          recorded_at: string | null
          rsi_momentum: number | null
          symbol: string
          timeframe_alignment: Json | null
          trend_direction: string
          user_id: string
        }
        Insert: {
          ema_spread_roc?: number | null
          id?: string
          is_accelerating?: boolean | null
          is_exhausted?: boolean | null
          macd_slope?: number | null
          momentum_score: number
          overextension_atr?: number | null
          pullback_depth?: number | null
          recorded_at?: string | null
          rsi_momentum?: number | null
          symbol: string
          timeframe_alignment?: Json | null
          trend_direction: string
          user_id: string
        }
        Update: {
          ema_spread_roc?: number | null
          id?: string
          is_accelerating?: boolean | null
          is_exhausted?: boolean | null
          macd_slope?: number | null
          momentum_score?: number
          overextension_atr?: number | null
          pullback_depth?: number | null
          recorded_at?: string | null
          rsi_momentum?: number | null
          symbol?: string
          timeframe_alignment?: Json | null
          trend_direction?: string
          user_id?: string
        }
        Relationships: []
      }
      oversold_event_study: {
        Row: {
          adx: number | null
          adx_slope: number | null
          created_at: string | null
          evaluated: boolean | null
          evaluated_at: string | null
          event_time: string
          gate_name: string | null
          id: string
          mae: number | null
          mfe: number | null
          momentum_score: number | null
          price: number
          primary_trend: string | null
          regime: string | null
          ret_12h: number | null
          ret_24h: number | null
          ret_6h: number | null
          shadow_entry_price: number | null
          shadow_exit_reason: string | null
          shadow_pnl_percent: number | null
          shadow_sl: number | null
          shadow_tp: number | null
          stoch_k: number | null
          symbol: string
          user_id: string
        }
        Insert: {
          adx?: number | null
          adx_slope?: number | null
          created_at?: string | null
          evaluated?: boolean | null
          evaluated_at?: string | null
          event_time?: string
          gate_name?: string | null
          id?: string
          mae?: number | null
          mfe?: number | null
          momentum_score?: number | null
          price: number
          primary_trend?: string | null
          regime?: string | null
          ret_12h?: number | null
          ret_24h?: number | null
          ret_6h?: number | null
          shadow_entry_price?: number | null
          shadow_exit_reason?: string | null
          shadow_pnl_percent?: number | null
          shadow_sl?: number | null
          shadow_tp?: number | null
          stoch_k?: number | null
          symbol: string
          user_id: string
        }
        Update: {
          adx?: number | null
          adx_slope?: number | null
          created_at?: string | null
          evaluated?: boolean | null
          evaluated_at?: string | null
          event_time?: string
          gate_name?: string | null
          id?: string
          mae?: number | null
          mfe?: number | null
          momentum_score?: number | null
          price?: number
          primary_trend?: string | null
          regime?: string | null
          ret_12h?: number | null
          ret_24h?: number | null
          ret_6h?: number | null
          shadow_entry_price?: number | null
          shadow_exit_reason?: string | null
          shadow_pnl_percent?: number | null
          shadow_sl?: number | null
          shadow_tp?: number | null
          stoch_k?: number | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
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
          binance_order_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_rebalancer: boolean | null
          confidence_score: number | null
          current_price: number | null
          entry_atr: number | null
          entry_atr_percent: number | null
          entry_exception_type: string | null
          entry_price: number
          entry_snapshot: Json | null
          executed_at: string | null
          execution_slippage_percent: number | null
          exit_price: number | null
          hedge_position_id: string | null
          id: string
          initial_risk_amount: number | null
          is_hedge: boolean | null
          max_adverse_excursion_atr: number | null
          opened_at: string | null
          opened_by_rebalancer: boolean | null
          order_type: string | null
          original_quantity: number | null
          parent_position_id: string | null
          partial_loss_level: number | null
          partial_tp_level: number | null
          peak_pnl_percent: number | null
          peak_reached_at: string | null
          quantity: number
          realized_pnl: number | null
          realized_pnl_percent: number | null
          reversal_decision: string | null
          reversal_details: Json | null
          reversal_persisted_bars: number | null
          reversal_score: number | null
          side: string
          signal_id: string | null
          status: string
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          tp1_price: number | null
          tp2_price: number | null
          tp3_price: number | null
          trading_fee_amount: number | null
          trading_fee_percent: number | null
          trend: string | null
          trend_consistency: number | null
          updated_at: string | null
          user_id: string
          volume_relaxation_applied: boolean | null
        }
        Insert: {
          binance_order_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_atr?: number | null
          entry_atr_percent?: number | null
          entry_exception_type?: string | null
          entry_price: number
          entry_snapshot?: Json | null
          executed_at?: string | null
          execution_slippage_percent?: number | null
          exit_price?: number | null
          hedge_position_id?: string | null
          id?: string
          initial_risk_amount?: number | null
          is_hedge?: boolean | null
          max_adverse_excursion_atr?: number | null
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          order_type?: string | null
          original_quantity?: number | null
          parent_position_id?: string | null
          partial_loss_level?: number | null
          partial_tp_level?: number | null
          peak_pnl_percent?: number | null
          peak_reached_at?: string | null
          quantity: number
          realized_pnl?: number | null
          realized_pnl_percent?: number | null
          reversal_decision?: string | null
          reversal_details?: Json | null
          reversal_persisted_bars?: number | null
          reversal_score?: number | null
          side: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          tp1_price?: number | null
          tp2_price?: number | null
          tp3_price?: number | null
          trading_fee_amount?: number | null
          trading_fee_percent?: number | null
          trend?: string | null
          trend_consistency?: number | null
          updated_at?: string | null
          user_id: string
          volume_relaxation_applied?: boolean | null
        }
        Update: {
          binance_order_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_atr?: number | null
          entry_atr_percent?: number | null
          entry_exception_type?: string | null
          entry_price?: number
          entry_snapshot?: Json | null
          executed_at?: string | null
          execution_slippage_percent?: number | null
          exit_price?: number | null
          hedge_position_id?: string | null
          id?: string
          initial_risk_amount?: number | null
          is_hedge?: boolean | null
          max_adverse_excursion_atr?: number | null
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          order_type?: string | null
          original_quantity?: number | null
          parent_position_id?: string | null
          partial_loss_level?: number | null
          partial_tp_level?: number | null
          peak_pnl_percent?: number | null
          peak_reached_at?: string | null
          quantity?: number
          realized_pnl?: number | null
          realized_pnl_percent?: number | null
          reversal_decision?: string | null
          reversal_details?: Json | null
          reversal_persisted_bars?: number | null
          reversal_score?: number | null
          side?: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          tp1_price?: number | null
          tp2_price?: number | null
          tp3_price?: number | null
          trading_fee_amount?: number | null
          trading_fee_percent?: number | null
          trend?: string | null
          trend_consistency?: number | null
          updated_at?: string | null
          user_id?: string
          volume_relaxation_applied?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_hedge_position_id_fkey"
            columns: ["hedge_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_parent_position_id_fkey"
            columns: ["parent_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trading_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      positions_archive: {
        Row: {
          archived_at: string | null
          binance_order_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_rebalancer: boolean | null
          confidence_score: number | null
          current_price: number | null
          entry_atr: number | null
          entry_atr_percent: number | null
          entry_exception_type: string | null
          entry_price: number
          entry_snapshot: Json | null
          executed_at: string | null
          execution_slippage_percent: number | null
          exit_price: number | null
          id: string
          initial_risk_amount: number | null
          max_adverse_excursion_atr: number | null
          opened_at: string | null
          opened_by_rebalancer: boolean | null
          order_type: string | null
          original_quantity: number | null
          partial_loss_level: number | null
          partial_tp_level: number | null
          peak_pnl_percent: number | null
          quantity: number
          realized_pnl: number | null
          realized_pnl_percent: number | null
          reversal_decision: string | null
          reversal_details: Json | null
          reversal_persisted_bars: number | null
          reversal_score: number | null
          side: string
          signal_id: string | null
          status: string
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          tp1_price: number | null
          tp2_price: number | null
          tp3_price: number | null
          trading_fee_amount: number | null
          trading_fee_percent: number | null
          trend: string | null
          trend_consistency: number | null
          updated_at: string | null
          user_id: string
          volume_relaxation_applied: boolean | null
        }
        Insert: {
          archived_at?: string | null
          binance_order_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_atr?: number | null
          entry_atr_percent?: number | null
          entry_exception_type?: string | null
          entry_price: number
          entry_snapshot?: Json | null
          executed_at?: string | null
          execution_slippage_percent?: number | null
          exit_price?: number | null
          id: string
          initial_risk_amount?: number | null
          max_adverse_excursion_atr?: number | null
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          order_type?: string | null
          original_quantity?: number | null
          partial_loss_level?: number | null
          partial_tp_level?: number | null
          peak_pnl_percent?: number | null
          quantity: number
          realized_pnl?: number | null
          realized_pnl_percent?: number | null
          reversal_decision?: string | null
          reversal_details?: Json | null
          reversal_persisted_bars?: number | null
          reversal_score?: number | null
          side: string
          signal_id?: string | null
          status: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          tp1_price?: number | null
          tp2_price?: number | null
          tp3_price?: number | null
          trading_fee_amount?: number | null
          trading_fee_percent?: number | null
          trend?: string | null
          trend_consistency?: number | null
          updated_at?: string | null
          user_id: string
          volume_relaxation_applied?: boolean | null
        }
        Update: {
          archived_at?: string | null
          binance_order_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_rebalancer?: boolean | null
          confidence_score?: number | null
          current_price?: number | null
          entry_atr?: number | null
          entry_atr_percent?: number | null
          entry_exception_type?: string | null
          entry_price?: number
          entry_snapshot?: Json | null
          executed_at?: string | null
          execution_slippage_percent?: number | null
          exit_price?: number | null
          id?: string
          initial_risk_amount?: number | null
          max_adverse_excursion_atr?: number | null
          opened_at?: string | null
          opened_by_rebalancer?: boolean | null
          order_type?: string | null
          original_quantity?: number | null
          partial_loss_level?: number | null
          partial_tp_level?: number | null
          peak_pnl_percent?: number | null
          quantity?: number
          realized_pnl?: number | null
          realized_pnl_percent?: number | null
          reversal_decision?: string | null
          reversal_details?: Json | null
          reversal_persisted_bars?: number | null
          reversal_score?: number | null
          side?: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          tp1_price?: number | null
          tp2_price?: number | null
          tp3_price?: number | null
          trading_fee_amount?: number | null
          trading_fee_percent?: number | null
          trend?: string | null
          trend_consistency?: number | null
          updated_at?: string | null
          user_id?: string
          volume_relaxation_applied?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_archive_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trading_signals"
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
          ai_analysis_enabled: boolean | null
          auto_execute_signals: boolean | null
          auto_rebalance_enabled: boolean | null
          base_position_size_percent: number | null
          base_stop_loss_percent: number | null
          base_take_profit_multiplier: number | null
          break_even_activation_percent: number | null
          break_even_enabled: boolean | null
          circuit_breaker_triggered: boolean | null
          circuit_breaker_triggered_at: string | null
          compression_module_enabled: boolean | null
          consecutive_loss_threshold: number
          consecutive_losses: number | null
          consecutive_wins: number | null
          current_open_trades: number | null
          daily_loss_limit_percent: number
          daily_peak_pnl: number | null
          daily_realized_loss: number | null
          decay_velocity_exit_enabled: boolean | null
          divergence_sl_multiplier: number | null
          divergence_tp_multiplier: number | null
          drawdown_circuit_breaker_enabled: boolean | null
          drawdown_circuit_breaker_percent: number | null
          dynamic_max_trades_enabled: boolean | null
          dynamic_stop_tightening_enabled: boolean | null
          dynamic_stop_tightening_hours: number | null
          dynamic_stop_tightening_percent: number | null
          early_profit_lock_enabled: boolean | null
          early_profit_lock_threshold: number | null
          early_reversal_position_size_percent: number | null
          email_notifications_enabled: boolean | null
          enable_adx_position_scaling: boolean | null
          enable_atr_based_stops: boolean | null
          enable_early_reversal_signals: boolean | null
          enable_pullback_signals: boolean | null
          enable_quality_based_sizing: boolean | null
          exhaustion_block_enabled: boolean | null
          hedge_position_size_percent: number | null
          hedge_reversal_risk_max: number | null
          hedge_reversal_risk_min: number | null
          hedging_enabled: boolean | null
          id: string
          is_trading_enabled: boolean | null
          kelly_criterion_enabled: boolean | null
          kelly_max_risk_cap: number | null
          last_loss_reset_date: string | null
          last_recovery_trade_loss: boolean | null
          last_trade_quality: number | null
          loss_recovery_confidence_boost: number | null
          loss_recovery_mode_enabled: boolean | null
          loss_recovery_position_size_percent: number | null
          low_quality_cooldown_until: string | null
          max_open_trades: number
          max_overextension_atr: number | null
          max_positions_to_close_per_cycle: number | null
          max_recovery_trades_per_day: number | null
          max_risk_per_trade_percent: number
          max_trades_per_symbol: number
          median_trade_quality: number | null
          min_confidence_threshold: number
          min_entry_quality_score: number | null
          min_hold_time_minutes: number | null
          min_momentum_score: number | null
          min_pullback_depth: number | null
          min_trades_for_kelly: number | null
          min_trend_consistency: number
          momentum_exit_guard_enabled: boolean | null
          notification_email: string | null
          notification_phone: string | null
          paper_trading_mode: boolean | null
          partial_loss_close_percent: number | null
          partial_loss_taking_enabled: boolean | null
          partial_loss_trigger_percent: number | null
          portfolio_peak_value: number | null
          portfolio_value: number
          position_size_reduction_percent: number
          progressive_lock_enabled: boolean | null
          pullback_position_size_percent: number | null
          ranging_regime_max_adx: number | null
          rebalance_loss_threshold_percent: number | null
          recovery_cooldown_until: string | null
          recovery_exit_drawdown_percent: number | null
          recovery_trades_today: number | null
          regime_aware_trading: boolean | null
          require_volume_confirmation: boolean | null
          risk_profile: string | null
          shadow_mode_enabled: boolean | null
          shadow_mode_started_at: string | null
          sms_notifications_enabled: boolean | null
          stale_peak_protection_enabled: boolean | null
          standard_tp_multiplier: number | null
          time_based_stop_enabled: boolean | null
          time_based_stop_hours: number | null
          trading_fee_rate_percent: number | null
          trailing_aggressiveness: number | null
          trailing_daily_limit_enabled: boolean | null
          trailing_stop_activation_percent: number | null
          trailing_stop_distance_multiplier: number | null
          trailing_stop_enabled: boolean | null
          trailing_stop_profit_lock_percent: number | null
          trending_regime_min_adx: number | null
          updated_at: string | null
          user_id: string
          volatility_max_trades_reduction: number | null
        }
        Insert: {
          ai_analysis_enabled?: boolean | null
          auto_execute_signals?: boolean | null
          auto_rebalance_enabled?: boolean | null
          base_position_size_percent?: number | null
          base_stop_loss_percent?: number | null
          base_take_profit_multiplier?: number | null
          break_even_activation_percent?: number | null
          break_even_enabled?: boolean | null
          circuit_breaker_triggered?: boolean | null
          circuit_breaker_triggered_at?: string | null
          compression_module_enabled?: boolean | null
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          consecutive_wins?: number | null
          current_open_trades?: number | null
          daily_loss_limit_percent?: number
          daily_peak_pnl?: number | null
          daily_realized_loss?: number | null
          decay_velocity_exit_enabled?: boolean | null
          divergence_sl_multiplier?: number | null
          divergence_tp_multiplier?: number | null
          drawdown_circuit_breaker_enabled?: boolean | null
          drawdown_circuit_breaker_percent?: number | null
          dynamic_max_trades_enabled?: boolean | null
          dynamic_stop_tightening_enabled?: boolean | null
          dynamic_stop_tightening_hours?: number | null
          dynamic_stop_tightening_percent?: number | null
          early_profit_lock_enabled?: boolean | null
          early_profit_lock_threshold?: number | null
          early_reversal_position_size_percent?: number | null
          email_notifications_enabled?: boolean | null
          enable_adx_position_scaling?: boolean | null
          enable_atr_based_stops?: boolean | null
          enable_early_reversal_signals?: boolean | null
          enable_pullback_signals?: boolean | null
          enable_quality_based_sizing?: boolean | null
          exhaustion_block_enabled?: boolean | null
          hedge_position_size_percent?: number | null
          hedge_reversal_risk_max?: number | null
          hedge_reversal_risk_min?: number | null
          hedging_enabled?: boolean | null
          id?: string
          is_trading_enabled?: boolean | null
          kelly_criterion_enabled?: boolean | null
          kelly_max_risk_cap?: number | null
          last_loss_reset_date?: string | null
          last_recovery_trade_loss?: boolean | null
          last_trade_quality?: number | null
          loss_recovery_confidence_boost?: number | null
          loss_recovery_mode_enabled?: boolean | null
          loss_recovery_position_size_percent?: number | null
          low_quality_cooldown_until?: string | null
          max_open_trades?: number
          max_overextension_atr?: number | null
          max_positions_to_close_per_cycle?: number | null
          max_recovery_trades_per_day?: number | null
          max_risk_per_trade_percent?: number
          max_trades_per_symbol?: number
          median_trade_quality?: number | null
          min_confidence_threshold?: number
          min_entry_quality_score?: number | null
          min_hold_time_minutes?: number | null
          min_momentum_score?: number | null
          min_pullback_depth?: number | null
          min_trades_for_kelly?: number | null
          min_trend_consistency?: number
          momentum_exit_guard_enabled?: boolean | null
          notification_email?: string | null
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          partial_loss_close_percent?: number | null
          partial_loss_taking_enabled?: boolean | null
          partial_loss_trigger_percent?: number | null
          portfolio_peak_value?: number | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          progressive_lock_enabled?: boolean | null
          pullback_position_size_percent?: number | null
          ranging_regime_max_adx?: number | null
          rebalance_loss_threshold_percent?: number | null
          recovery_cooldown_until?: string | null
          recovery_exit_drawdown_percent?: number | null
          recovery_trades_today?: number | null
          regime_aware_trading?: boolean | null
          require_volume_confirmation?: boolean | null
          risk_profile?: string | null
          shadow_mode_enabled?: boolean | null
          shadow_mode_started_at?: string | null
          sms_notifications_enabled?: boolean | null
          stale_peak_protection_enabled?: boolean | null
          standard_tp_multiplier?: number | null
          time_based_stop_enabled?: boolean | null
          time_based_stop_hours?: number | null
          trading_fee_rate_percent?: number | null
          trailing_aggressiveness?: number | null
          trailing_daily_limit_enabled?: boolean | null
          trailing_stop_activation_percent?: number | null
          trailing_stop_distance_multiplier?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_profit_lock_percent?: number | null
          trending_regime_min_adx?: number | null
          updated_at?: string | null
          user_id: string
          volatility_max_trades_reduction?: number | null
        }
        Update: {
          ai_analysis_enabled?: boolean | null
          auto_execute_signals?: boolean | null
          auto_rebalance_enabled?: boolean | null
          base_position_size_percent?: number | null
          base_stop_loss_percent?: number | null
          base_take_profit_multiplier?: number | null
          break_even_activation_percent?: number | null
          break_even_enabled?: boolean | null
          circuit_breaker_triggered?: boolean | null
          circuit_breaker_triggered_at?: string | null
          compression_module_enabled?: boolean | null
          consecutive_loss_threshold?: number
          consecutive_losses?: number | null
          consecutive_wins?: number | null
          current_open_trades?: number | null
          daily_loss_limit_percent?: number
          daily_peak_pnl?: number | null
          daily_realized_loss?: number | null
          decay_velocity_exit_enabled?: boolean | null
          divergence_sl_multiplier?: number | null
          divergence_tp_multiplier?: number | null
          drawdown_circuit_breaker_enabled?: boolean | null
          drawdown_circuit_breaker_percent?: number | null
          dynamic_max_trades_enabled?: boolean | null
          dynamic_stop_tightening_enabled?: boolean | null
          dynamic_stop_tightening_hours?: number | null
          dynamic_stop_tightening_percent?: number | null
          early_profit_lock_enabled?: boolean | null
          early_profit_lock_threshold?: number | null
          early_reversal_position_size_percent?: number | null
          email_notifications_enabled?: boolean | null
          enable_adx_position_scaling?: boolean | null
          enable_atr_based_stops?: boolean | null
          enable_early_reversal_signals?: boolean | null
          enable_pullback_signals?: boolean | null
          enable_quality_based_sizing?: boolean | null
          exhaustion_block_enabled?: boolean | null
          hedge_position_size_percent?: number | null
          hedge_reversal_risk_max?: number | null
          hedge_reversal_risk_min?: number | null
          hedging_enabled?: boolean | null
          id?: string
          is_trading_enabled?: boolean | null
          kelly_criterion_enabled?: boolean | null
          kelly_max_risk_cap?: number | null
          last_loss_reset_date?: string | null
          last_recovery_trade_loss?: boolean | null
          last_trade_quality?: number | null
          loss_recovery_confidence_boost?: number | null
          loss_recovery_mode_enabled?: boolean | null
          loss_recovery_position_size_percent?: number | null
          low_quality_cooldown_until?: string | null
          max_open_trades?: number
          max_overextension_atr?: number | null
          max_positions_to_close_per_cycle?: number | null
          max_recovery_trades_per_day?: number | null
          max_risk_per_trade_percent?: number
          max_trades_per_symbol?: number
          median_trade_quality?: number | null
          min_confidence_threshold?: number
          min_entry_quality_score?: number | null
          min_hold_time_minutes?: number | null
          min_momentum_score?: number | null
          min_pullback_depth?: number | null
          min_trades_for_kelly?: number | null
          min_trend_consistency?: number
          momentum_exit_guard_enabled?: boolean | null
          notification_email?: string | null
          notification_phone?: string | null
          paper_trading_mode?: boolean | null
          partial_loss_close_percent?: number | null
          partial_loss_taking_enabled?: boolean | null
          partial_loss_trigger_percent?: number | null
          portfolio_peak_value?: number | null
          portfolio_value?: number
          position_size_reduction_percent?: number
          progressive_lock_enabled?: boolean | null
          pullback_position_size_percent?: number | null
          ranging_regime_max_adx?: number | null
          rebalance_loss_threshold_percent?: number | null
          recovery_cooldown_until?: string | null
          recovery_exit_drawdown_percent?: number | null
          recovery_trades_today?: number | null
          regime_aware_trading?: boolean | null
          require_volume_confirmation?: boolean | null
          risk_profile?: string | null
          shadow_mode_enabled?: boolean | null
          shadow_mode_started_at?: string | null
          sms_notifications_enabled?: boolean | null
          stale_peak_protection_enabled?: boolean | null
          standard_tp_multiplier?: number | null
          time_based_stop_enabled?: boolean | null
          time_based_stop_hours?: number | null
          trading_fee_rate_percent?: number | null
          trailing_aggressiveness?: number | null
          trailing_daily_limit_enabled?: boolean | null
          trailing_stop_activation_percent?: number | null
          trailing_stop_distance_multiplier?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_profit_lock_percent?: number | null
          trending_regime_min_adx?: number | null
          updated_at?: string | null
          user_id?: string
          volatility_max_trades_reduction?: number | null
        }
        Relationships: []
      }
      shadow_mode_signals: {
        Row: {
          confidence_score: number | null
          created_at: string
          entry_price: number | null
          expires_at: string
          gate_blocked_by: string
          gate_details: Json | null
          id: string
          indicators: Json | null
          new_gate_result: string
          new_position_multiplier: number | null
          old_gate_result: string
          old_position_multiplier: number | null
          outcome_notes: string | null
          outcome_tracked: boolean | null
          signal_type: string
          simulated_pnl_percent: number | null
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          trend: string | null
          user_id: string
          would_have_won: boolean | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          entry_price?: number | null
          expires_at?: string
          gate_blocked_by: string
          gate_details?: Json | null
          id?: string
          indicators?: Json | null
          new_gate_result: string
          new_position_multiplier?: number | null
          old_gate_result: string
          old_position_multiplier?: number | null
          outcome_notes?: string | null
          outcome_tracked?: boolean | null
          signal_type: string
          simulated_pnl_percent?: number | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          trend?: string | null
          user_id: string
          would_have_won?: boolean | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          entry_price?: number | null
          expires_at?: string
          gate_blocked_by?: string
          gate_details?: Json | null
          id?: string
          indicators?: Json | null
          new_gate_result?: string
          new_position_multiplier?: number | null
          old_gate_result?: string
          old_position_multiplier?: number | null
          outcome_notes?: string | null
          outcome_tracked?: boolean | null
          signal_type?: string
          simulated_pnl_percent?: number | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          trend?: string | null
          user_id?: string
          would_have_won?: boolean | null
        }
        Relationships: []
      }
      signal_rejection_log: {
        Row: {
          ai_analysis: Json | null
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
          ai_analysis?: Json | null
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
          ai_analysis?: Json | null
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
      trading_signals: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          created_by_rebalancer: boolean | null
          entry_price: number | null
          executed_at: string | null
          expires_at: string | null
          id: string
          indicators: Json | null
          position_id: string | null
          reason: string | null
          risk_reward_ratio: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          status: string | null
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          trend: Database["public"]["Enums"]["market_trend"]
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_rebalancer?: boolean | null
          entry_price?: number | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          position_id?: string | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type: Database["public"]["Enums"]["signal_type"]
          status?: string | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          trend: Database["public"]["Enums"]["market_trend"]
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_rebalancer?: boolean | null
          entry_price?: number | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          indicators?: Json | null
          position_id?: string | null
          reason?: string | null
          risk_reward_ratio?: number | null
          signal_type?: Database["public"]["Enums"]["signal_type"]
          status?: string | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          trend?: Database["public"]["Enums"]["market_trend"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_signals_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
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
      trend_snapshots: {
        Row: {
          adx: number | null
          block_reason: string | null
          id: string
          is_aligned: boolean | null
          macd_histogram: number | null
          momentum_state: string | null
          primary_trend: string | null
          recorded_at: string
          regime: string | null
          snapshot_data: Json
          symbol: string
          user_id: string
        }
        Insert: {
          adx?: number | null
          block_reason?: string | null
          id?: string
          is_aligned?: boolean | null
          macd_histogram?: number | null
          momentum_state?: string | null
          primary_trend?: string | null
          recorded_at?: string
          regime?: string | null
          snapshot_data: Json
          symbol: string
          user_id: string
        }
        Update: {
          adx?: number | null
          block_reason?: string | null
          id?: string
          is_aligned?: boolean | null
          macd_histogram?: number | null
          momentum_state?: string | null
          primary_trend?: string | null
          recorded_at?: string
          regime?: string | null
          snapshot_data?: Json
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          binance_api_key: string | null
          binance_api_key_vault_id: string | null
          binance_api_secret: string | null
          binance_api_secret_vault_id: string | null
          created_at: string | null
          id: string
          keys_encrypted: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          binance_api_key?: string | null
          binance_api_key_vault_id?: string | null
          binance_api_secret?: string | null
          binance_api_secret_vault_id?: string | null
          created_at?: string | null
          id?: string
          keys_encrypted?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          binance_api_key?: string | null
          binance_api_key_vault_id?: string | null
          binance_api_secret?: string | null
          binance_api_secret_vault_id?: string | null
          created_at?: string | null
          id?: string
          keys_encrypted?: boolean | null
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
          breakeven_trades: number | null
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
      positions_with_archive: {
        Row: {
          binance_order_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_rebalancer: boolean | null
          confidence_score: number | null
          current_price: number | null
          entry_price: number | null
          executed_at: string | null
          exit_price: number | null
          id: string | null
          is_archived: boolean | null
          opened_at: string | null
          opened_by_rebalancer: boolean | null
          order_type: string | null
          original_quantity: number | null
          partial_tp_level: number | null
          quantity: number | null
          realized_pnl: number | null
          realized_pnl_percent: number | null
          side: string | null
          signal_id: string | null
          status: string | null
          stop_loss: number | null
          strategy_name: string | null
          symbol: string | null
          take_profit: number | null
          tp1_price: number | null
          tp2_price: number | null
          tp3_price: number | null
          trend: string | null
          trend_consistency: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_old_positions: {
        Args: never
        Returns: {
          archived_count: number
        }[]
      }
      delete_encrypted_api_key: {
        Args: { p_key_type: string; p_user_id: string }
        Returns: boolean
      }
      get_encrypted_api_key: {
        Args: { p_key_type: string; p_user_id: string }
        Returns: string
      }
      get_ignition_tier_audit: {
        Args: { p_hours_back?: number; p_user_id: string }
        Returns: Json
      }
      get_market_opportunity_density: {
        Args: { p_since: string; p_user_id: string }
        Returns: Json
      }
      get_user_binance_credentials: {
        Args: { p_user_id: string }
        Returns: {
          api_key: string
          api_secret: string
        }[]
      }
      jsonb_set_snapshot_field: {
        Args: {
          p_field: string
          p_symbol: string
          p_user_id: string
          p_value: Json
        }
        Returns: undefined
      }
      store_encrypted_api_key: {
        Args: { p_key_type: string; p_key_value: string; p_user_id: string }
        Returns: string
      }
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
