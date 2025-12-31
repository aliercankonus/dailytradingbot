import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RiskParameters {
  id: string;
  max_risk_per_trade_percent: number;
  max_open_trades: number;
  consecutive_loss_threshold: number;
  position_size_reduction_percent: number;
  portfolio_value: number;
  current_open_trades: number;
  consecutive_losses: number;
  is_trading_enabled: boolean;
  paper_trading_mode: boolean;
  notification_phone: string | null;
  sms_notifications_enabled: boolean;
  min_confidence_threshold: number;
  min_trend_consistency: number;
  max_trades_per_symbol: number;
  daily_loss_limit_percent: number;
  daily_realized_loss: number;
  last_loss_reset_date: string | null;
  auto_execute_signals: boolean;
  standard_tp_multiplier: number;
  divergence_tp_multiplier: number;
  divergence_sl_multiplier: number;
  trailing_stop_profit_lock_percent: number;
  // Loss Management Settings
  drawdown_circuit_breaker_enabled: boolean;
  drawdown_circuit_breaker_percent: number;
  portfolio_peak_value: number;
  circuit_breaker_triggered: boolean;
  circuit_breaker_triggered_at: string | null;
  time_based_stop_enabled: boolean;
  time_based_stop_hours: number;
  dynamic_stop_tightening_enabled: boolean;
  dynamic_stop_tightening_hours: number;
  dynamic_stop_tightening_percent: number;
  // Partial Loss Taking
  partial_loss_taking_enabled: boolean;
  partial_loss_trigger_percent: number;
  partial_loss_close_percent: number;
  // Loss Recovery Mode
  loss_recovery_mode_enabled: boolean;
  loss_recovery_position_size_percent: number;
  loss_recovery_confidence_boost: number;
  // Hedging Settings
  hedging_enabled: boolean;
  hedge_reversal_risk_min: number;
  hedge_reversal_risk_max: number;
  hedge_position_size_percent: number;
  // Minimum Hold Time
  min_hold_time_minutes: number;
  // AI Analysis Toggle
  ai_analysis_enabled: boolean;
  updated_at: string;
  // Smart Trading Settings (Phase 1-7)
  regime_aware_trading: boolean;
  min_momentum_score: number;
  max_overextension_atr: number;
  min_pullback_depth: number;
  require_volume_confirmation: boolean;
  exhaustion_block_enabled: boolean;
  min_entry_quality_score: number;
  trending_regime_min_adx: number;
  ranging_regime_max_adx: number;
}

export const useRiskParameters = () => {
  const [riskParams, setRiskParams] = useState<RiskParameters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRiskParameters = async () => {
    try {
      setLoading(true);
      
      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Query with proper user filter
      const { data, error: queryError } = await supabase
        .from('risk_parameters')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (queryError) throw queryError;

      if (!data) {
        // Create defaults for this user if missing
        console.log('No risk parameters found. Creating defaults for user:', user.id);
        const { data: inserted, error: insertError } = await supabase
          .from('risk_parameters')
          .insert({ user_id: user.id })
          .select()
          .single();
          
        if (insertError) {
          console.error('Error inserting default risk parameters:', insertError);
          console.error('Insert error details:', JSON.stringify(insertError, null, 2));
        } else {
          console.log('Successfully created risk parameters:', inserted);
          setRiskParams(inserted);
          return;
        }
      }

      setRiskParams(data || null);
    } catch (err) {
      console.error('Error fetching risk parameters:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch risk parameters');
    } finally {
      setLoading(false);
    }
  };

  const updateRiskParameters = async (updates: Partial<RiskParameters>) => {
    try {
      // Ensure a row exists before updating
      if (!riskParams) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const { error: insertError } = await supabase
          .from('risk_parameters')
          .insert({ user_id: user.id });
        if (insertError) throw insertError;
        await fetchRiskParameters();
      }

      const id = riskParams?.id;
      if (!id) throw new Error('Risk parameters not initialized');

      const { error: updateError } = await supabase
        .from('risk_parameters')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
      await fetchRiskParameters();
    } catch (err) {
      console.error('Error updating risk parameters:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchRiskParameters();

    // Set up realtime subscription for immediate updates
    const channel = supabase
      .channel('risk_parameters_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'risk_parameters'
        },
        (payload) => {
          console.log('Risk parameters changed:', payload);
          fetchRiskParameters();
        }
      )
      .subscribe();

    // Keep polling as backup
    const interval = setInterval(fetchRiskParameters, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return { riskParams, loading, error, updateRiskParameters };
};