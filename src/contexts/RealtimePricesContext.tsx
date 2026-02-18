import { createContext, useContext, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
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
  const previousSymbolsRef = useRef<string>('');

  // Fetch all symbols that need price updates
  const fetchSymbols = useCallback(async () => {
    if (!user) return;
    
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

    // Deduplicate and sort for consistent comparison
    const uniqueSymbols = Array.from(new Set(allSymbols)).sort();
    const symbolsKey = JSON.stringify(uniqueSymbols);
    
    // Only update state if symbols actually changed
    if (symbolsKey !== previousSymbolsRef.current) {
      console.log('[RealtimePricesContext] Symbols changed:', previousSymbolsRef.current, '->', symbolsKey);
      previousSymbolsRef.current = symbolsKey;
      setSymbols(uniqueSymbols);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchSymbols();

    // Single channel for all position changes that affect symbol list
    const positionsChannel = supabase
      .channel('positions-symbols-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refresh symbols on INSERT, DELETE, or status change to 'closed'
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            console.log('[RealtimePricesContext] Position added/removed, refreshing symbols');
            fetchSymbols();
          } else if (
            payload.eventType === 'UPDATE' &&
            (payload.old as any)?.status === 'active' &&
            (payload.new as any)?.status === 'closed'
          ) {
            console.log('[RealtimePricesContext] Position closed, refreshing symbols');
            fetchSymbols();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(positionsChannel);
    };
  }, [user, fetchSymbols]);

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
