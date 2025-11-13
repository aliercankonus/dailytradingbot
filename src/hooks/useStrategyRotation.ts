import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RotationConfig {
  id: string;
  enabled: boolean;
  rotation_interval_minutes: number;
  performance_threshold_percent: number;
  min_trades_required: number;
  market_condition_weight: number;
  performance_weight: number;
}

interface RotationHistory {
  id: string;
  from_strategy_name: string;
  to_strategy_name: string;
  reason: string;
  market_condition: any;
  performance_metrics: any;
  rotated_at: string;
}

export const useStrategyRotation = () => {
  const [config, setConfig] = useState<RotationConfig | null>(null);
  const [history, setHistory] = useState<RotationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
    fetchHistory();

    // Subscribe to rotation history changes
    const channel = supabase
      .channel('rotation_history')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'strategy_rotation_history'
      }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConfig = async () => {
    try {
      // Ensure user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        toast({
          title: 'Sign in required',
          description: 'Please sign in to manage strategy rotation.',
          variant: 'destructive',
        });
        return;
      }

      const res = await (supabase as any)
        .from('strategy_rotation_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      const { data, error } = res as any;

      if (error) throw error;
      
      // If no config exists, create one for this user
      if (!data) {
        const insertRes = await supabase
          .from('strategy_rotation_config')
          .insert({
            enabled: false,
            rotation_interval_minutes: 60,
            performance_threshold_percent: 5.0,
            min_trades_required: 10,
            market_condition_weight: 0.5,
            performance_weight: 0.5,
            user_id: user.id,
          })
          .select()
          .single();
        const { data: newConfig, error: createError } = insertRes as any;
        
        if (createError) throw createError;
        setConfig(newConfig);
      } else {
        setConfig(data);
      }
    } catch (error) {
      console.error('Error fetching rotation config:', error);
      toast({
        title: 'Error',
        description: 'Failed to load rotation configuration',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await (supabase as any)
        .from('strategy_rotation_history')
        .select('*')
        .eq('user_id', user.id)
        .order('rotated_at', { ascending: false })
        .limit(10);

      const { data, error } = res as any;
      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching rotation history:', error);
    }
  };

  const updateConfig = async (updates: Partial<RotationConfig>) => {
    try {
      if (!config) return;

      const { error } = await supabase
        .from('strategy_rotation_config')
        .update(updates)
        .eq('id', config.id);

      if (error) throw error;

      await fetchConfig();
      
      toast({
        title: 'Success',
        description: 'Rotation configuration updated',
      });
    } catch (error) {
      console.error('Error updating rotation config:', error);
      toast({
        title: 'Error',
        description: 'Failed to update configuration',
        variant: 'destructive',
      });
    }
  };

  const triggerRotation = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Sign in required',
          description: 'Please sign in before triggering rotation.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('strategy-rotation');

      if (error) throw error;

      toast({
        title: 'Rotation Check Complete',
        description: data?.rotated 
          ? `Rotated to ${data.to}` 
          : 'No rotation needed',
      });

      await fetchHistory();
    } catch (error) {
      console.error('Error triggering rotation:', error);
      toast({
        title: 'Error',
        description: 'Failed to trigger rotation',
        variant: 'destructive',
      });
    }
  };

  return {
    config,
    history,
    loading,
    updateConfig,
    triggerRotation,
  };
};
