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
        if (user) {
          const { error: insertError } = await supabase
            .from('risk_parameters')
            .insert({ user_id: user.id });
          if (insertError) {
            console.error('Error inserting default risk parameters:', insertError);
          } else {
            // Re-fetch after creating
            const { data: created } = await supabase
              .from('risk_parameters')
              .select('*')
              .maybeSingle();
            setRiskParams(created || null);
            return;
          }
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
    const interval = setInterval(fetchRiskParameters, 10000);
    return () => clearInterval(interval);
  }, []);

  return { riskParams, loading, error, updateRiskParameters };
};