import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RiskParameters {
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
  auto_rebalance_enabled: boolean;
  rebalance_loss_threshold_percent: number;
  max_positions_to_close_per_cycle: number;
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
  updated_at: string;
}

export const useRiskParameters = () => {
  const [riskParams, setRiskParams] = useState<RiskParameters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRiskParameters = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('risk_parameters')
        .select('*')
        .maybeSingle();

      if (queryError) throw queryError;

      if (!data) {
        // Create defaults for this user if missing
        const { data: { user } } = await supabase.auth.getUser();
        console.log('No risk parameters found. Current user:', user?.id);
        if (user) {
          console.log('Attempting to insert default risk parameters for user:', user.id);
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
        } else {
          console.error('No authenticated user found');
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