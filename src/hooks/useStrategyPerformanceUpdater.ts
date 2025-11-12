import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useStrategyPerformanceUpdater = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const updatePerformance = async () => {
    try {
      setIsUpdating(true);
      
      toast({
        title: 'Updating Performance',
        description: 'Calculating strategy metrics from historical data...',
      });

      const { data, error } = await supabase.functions.invoke('update-strategy-performance', {
        body: {}
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Updated performance for ${data.updated} strategies`,
      });

      return data;
    } catch (error) {
      console.error('Error updating performance:', error);
      toast({
        title: 'Error',
        description: 'Failed to update strategy performance',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updatePerformance, isUpdating };
};
