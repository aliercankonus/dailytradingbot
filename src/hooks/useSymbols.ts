import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TradingSymbol {
  id: string;
  symbol: string;
  display_name: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export const useSymbols = () => {
  const [symbols, setSymbols] = useState<TradingSymbol[]>([]);
  const [activeSymbols, setActiveSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSymbols = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setSymbols([]);
        setActiveSymbols([]);
        return;
      }

      const { data, error } = await supabase
        .from('trading_symbols_config')
        .select('*')
        .eq('user_id', user.id)
        .order('symbol', { ascending: true });

      if (error) throw error;

      // If no symbols exist, initialize defaults
      if (!data || data.length === 0) {
        await initializeDefaultSymbols(user.id);
        await fetchSymbols(); // Re-fetch after initialization
        return;
      }

      setSymbols(data);
      setActiveSymbols(data.filter(s => s.is_active).map(s => s.symbol));
    } catch (error) {
      console.error('Error fetching symbols:', error);
      toast({
        title: 'Error',
        description: 'Failed to load trading symbols',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultSymbols = async (userId: string) => {
    const defaultSymbols = [
      { symbol: 'BTCUSDT', display_name: 'Bitcoin (BTC/USDT)', is_active: true },
      { symbol: 'ETHUSDT', display_name: 'Ethereum (ETH/USDT)', is_active: true },
      { symbol: 'BNBUSDT', display_name: 'Binance Coin (BNB/USDT)', is_active: false },
      { symbol: 'SOLUSDT', display_name: 'Solana (SOL/USDT)', is_active: false },
      { symbol: 'ADAUSDT', display_name: 'Cardano (ADA/USDT)', is_active: false },
      { symbol: 'XRPUSDT', display_name: 'Ripple (XRP/USDT)', is_active: false },
      { symbol: 'DOGEUSDT', display_name: 'Dogecoin (DOGE/USDT)', is_active: false },
      { symbol: 'DOTUSDT', display_name: 'Polkadot (DOT/USDT)', is_active: false },
      { symbol: 'MATICUSDT', display_name: 'Polygon (MATIC/USDT)', is_active: false },
      { symbol: 'AVAXUSDT', display_name: 'Avalanche (AVAX/USDT)', is_active: false },
    ];

    const { error } = await supabase
      .from('trading_symbols_config')
      .insert(defaultSymbols.map(s => ({ ...s, user_id: userId })));

    if (error) {
      console.error('Error initializing symbols:', error);
    }
  };

  const toggleSymbol = async (symbolId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('trading_symbols_config')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', symbolId);

      if (error) throw error;

      await fetchSymbols();
      toast({
        title: isActive ? 'Symbol Activated' : 'Symbol Deactivated',
        description: `Trading pair has been ${isActive ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Error toggling symbol:', error);
      toast({
        title: 'Error',
        description: 'Failed to update symbol status',
        variant: 'destructive',
      });
    }
  };

  const addSymbol = async (symbol: string, displayName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('trading_symbols_config')
        .insert({
          user_id: user.id,
          symbol: symbol.toUpperCase(),
          display_name: displayName,
          is_active: false,
        });

      if (error) throw error;

      await fetchSymbols();
      toast({
        title: 'Symbol Added',
        description: `${displayName} has been added`,
      });
    } catch (error) {
      console.error('Error adding symbol:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add symbol',
        variant: 'destructive',
      });
    }
  };

  const deleteSymbol = async (symbolId: string) => {
    try {
      const { error } = await supabase
        .from('trading_symbols_config')
        .delete()
        .eq('id', symbolId);

      if (error) throw error;

      await fetchSymbols();
      toast({
        title: 'Symbol Deleted',
        description: 'Trading pair has been removed',
      });
    } catch (error) {
      console.error('Error deleting symbol:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete symbol',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchSymbols();

    // Set up realtime subscription
    const channel = supabase
      .channel('trading_symbols_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trading_symbols_config',
        },
        () => {
          fetchSymbols();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    symbols,
    activeSymbols,
    loading,
    toggleSymbol,
    addSymbol,
    deleteSymbol,
    refetch: fetchSymbols,
  };
};
