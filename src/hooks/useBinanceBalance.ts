import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BinanceBalance {
  balance: number;
  currency: string;
  isPaperTrading: boolean;
  accountData?: {
    canTrade: boolean;
    canWithdraw: boolean;
    canDeposit: boolean;
  };
}

export const useBinanceBalance = () => {
  const [balance, setBalance] = useState<BinanceBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke('binance-account-balance');

      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error);

      setBalance(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching Binance balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  return { balance, loading, error, refetch: fetchBalance };
};