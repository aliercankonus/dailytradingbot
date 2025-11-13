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
      if (!riskParams) return;
      
      const { error: updateError } = await supabase
        .from('risk_parameters')
        .update(updates)
        .eq('id', riskParams.id);

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