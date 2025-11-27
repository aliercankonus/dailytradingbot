import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useRealtimePrices, RealtimePrice } from '@/hooks/useRealtimePrices';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface RealtimePricesContextType {
  prices: Map<string, RealtimePrice>;
  priceVersion: number;
  connected: boolean;
  error: string | null;
  getPrice: (symbol: string) => RealtimePrice;
}

const RealtimePricesContext = createContext<RealtimePricesContextType | undefined>(undefined);

export const RealtimePricesProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [symbols, setSymbols] = useState<string[]>([]);

  // Fetch all symbols that need price updates
  useEffect(() => {
    if (!user) return;

    const fetchSymbols = async () => {
      const allSymbols: string[] = [];

      // Fetch active trading symbols
      const { data: tradingSymbols } = await supabase
        .from('trading_symbols_config')
        .select('symbol')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (tradingSymbols) {
        allSymbols.push(...tradingSymbols.map(s => s.symbol));
      }

      // Fetch symbols from open positions
      const { data: positions } = await supabase
        .from('positions')
        .select('symbol')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (positions) {
        allSymbols.push(...positions.map(p => p.symbol));
      }

      // Deduplicate and set
      const uniqueSymbols = Array.from(new Set(allSymbols));
      console.log('[RealtimePricesContext] Subscribing to symbols:', uniqueSymbols);
      setSymbols(uniqueSymbols);
    };

    fetchSymbols();

    // Re-fetch when positions change
    const channel = supabase
      .channel('positions-symbols-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[RealtimePricesContext] Positions changed, refreshing symbols');
          fetchSymbols();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const realtimePrices = useRealtimePrices(symbols.length > 0 ? symbols : undefined);

  return (
    <RealtimePricesContext.Provider value={realtimePrices}>
      {children}
    </RealtimePricesContext.Provider>
  );
};

export const useRealtimePricesContext = () => {
  const context = useContext(RealtimePricesContext);
  if (context === undefined) {
    throw new Error('useRealtimePricesContext must be used within a RealtimePricesProvider');
  }
  return context;
};
