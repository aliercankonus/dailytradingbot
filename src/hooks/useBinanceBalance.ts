import { useQuery } from '@tanstack/react-query';
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

const fetchBinanceBalance = async (): Promise<BinanceBalance> => {
  const { data, error } = await supabase.functions.invoke('binance-account-balance');
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
};

export const useBinanceBalance = () => {
  const { data: balance, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['binance-balance'],
    queryFn: fetchBinanceBalance,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  return { 
    balance: balance ?? null, 
    loading, 
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch balance') : null, 
    refetch 
  };
};
