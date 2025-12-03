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

    // Only re-fetch on INSERT/DELETE events (new positions or closed positions)
    // Not on UPDATE events (which happen frequently for price updates)
    const insertChannel = supabase
      .channel('positions-insert-sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[RealtimePricesContext] New position opened, refreshing symbols');
          fetchSymbols();
        }
      )
      .subscribe();

    const deleteChannel = supabase
      .channel('positions-delete-sync')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[RealtimePricesContext] Position deleted, refreshing symbols');
          fetchSymbols();
        }
      )
      .subscribe();

    // Also listen for status changes (position closed)
    const updateChannel = supabase
      .channel('positions-status-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Only refresh if status changed to 'closed' (position no longer active)
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          if (oldStatus === 'active' && newStatus === 'closed') {
            console.log('[RealtimePricesContext] Position closed, refreshing symbols');
            fetchSymbols();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(deleteChannel);
      supabase.removeChannel(updateChannel);
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
