import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BuiltInStrategy {
  id: string;
  strategy_name: string;
  status: string;
  total_trades: number;
  winning_trades: number;
  total_profit: number;
  max_drawdown: number;
  last_updated: string;
}

export const useBuiltInStrategies = () => {
  const [strategies, setStrategies] = useState<BuiltInStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('strategy_performance')
        .select('*')
        .order('strategy_name');

      if (error) throw error;
      setStrategies(data || []);
    } catch (error) {
      console.error('Error fetching built-in strategies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load strategies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'standby' : 'active';
      
      const { error } = await supabase
        .from('strategy_performance')
        .update({ status: newStatus, last_updated: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Strategy ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
      });

      fetchStrategies();
    } catch (error) {
      console.error('Error toggling strategy status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update strategy status',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  return { strategies, loading, toggleStatus, refetch: fetchStrategies };
};