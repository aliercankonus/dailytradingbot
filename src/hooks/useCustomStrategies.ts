import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CustomStrategy {
  id: string;
  name: string;
  description: string | null;
  entry_conditions: any;
  exit_conditions: any;
  indicators: any;
  risk_settings: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useCustomStrategies = () => {
  const [strategies, setStrategies] = useState<CustomStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('custom_strategies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStrategies(data || []);
    } catch (error) {
      console.error('Error fetching strategies:', error);
      toast({
        title: "Error",
        description: "Failed to load strategies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createStrategy = async (strategy: Omit<CustomStrategy, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .from('custom_strategies')
        .insert([{ ...strategy, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Strategy created successfully",
      });

      await fetchStrategies();
      return data;
    } catch (error) {
      console.error('Error creating strategy:', error);
      toast({
        title: "Error",
        description: "Failed to create strategy",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateStrategy = async (id: string, updates: Partial<CustomStrategy>) => {
    try {
      const { error } = await (supabase as any)
        .from('custom_strategies')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Strategy updated successfully",
      });

      await fetchStrategies();
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast({
        title: "Error",
        description: "Failed to update strategy",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteStrategy = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('custom_strategies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Strategy deleted successfully",
      });

      await fetchStrategies();
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast({
        title: "Error",
        description: "Failed to delete strategy",
        variant: "destructive",
      });
      throw error;
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await updateStrategy(id, { is_active: isActive });
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  return {
    strategies,
    loading,
    createStrategy,
    updateStrategy,
    deleteStrategy,
    toggleActive,
    refetch: fetchStrategies,
  };
};
