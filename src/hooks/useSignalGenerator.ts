import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRiskParameters } from './useRiskParameters';

export const useSignalGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const { riskParams, loading } = useRiskParameters();
  const isRunningRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateSignals = useCallback(async () => {
    // Prevent concurrent runs
    if (isRunningRef.current) {
      console.log('Signal generation already in progress, skipping');
      return;
    }

    try {
      isRunningRef.current = true;
      setIsGenerating(true);
      
      // Check if bot is enabled before generating signals
      if (!riskParams?.is_trading_enabled) {
        console.log('Bot is disabled, skipping signal generation');
        return;
      }
      
      // Check if user is authenticated before making the call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No active session, skipping signal generation');
        return;
      }

      // Check if tab is visible (reduce API calls when tab is hidden)
      if (document.hidden) {
        console.log('Tab is hidden, skipping signal generation');
        return;
      }

      const { data, error } = await supabase.functions.invoke('strategy-analyzer');

      if (error) {
        // Don't show toast for auth errors during auto-polling
        if (error.message?.includes('token') || error.message?.includes('401')) {
          console.log('Authentication error during auto signal generation, session may have expired');
          return;
        }
        throw error;
      }

      if (data?.signals?.length > 0) {
        const deduplicationInfo = data.totalSignalsGenerated > data.signalsAfterDeduplication 
          ? ` (${data.totalSignalsGenerated} before deduplication)` 
          : '';
        toast({
          title: "Signals Generated",
          description: data.autoExecuteEnabled 
            ? `Generated ${data.signals.length} signals${deduplicationInfo}, executed ${data.executedSignals}`
            : `Found ${data.signals.length} new trading signals${deduplicationInfo}`,
        });
      } else {
        toast({
          title: "No Signals",
          description: "No trading opportunities found at this time",
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Error generating signals:', error);
      toast({
        title: "Error",
        description: "Failed to generate signals",
        variant: "destructive"
      });
    } finally {
      isRunningRef.current = false;
      setIsGenerating(false);
    }
  }, [riskParams?.is_trading_enabled, toast]);

  useEffect(() => {
    // Wait for risk parameters to load
    if (loading) {
      console.log('Waiting for risk parameters to load...');
      return;
    }

    // Only generate signals if bot is enabled
    if (!riskParams?.is_trading_enabled) {
      console.log('Bot is disabled, skipping signal generation');
      return;
    }

    console.log('Bot is enabled, starting signal generation (90s interval)');
    // Generate signals immediately on mount
    generateSignals();

    // Generate signals every 90 seconds for faster detection
    intervalRef.current = setInterval(generateSignals, 90 * 1000);

    // Visibility change handler - generate when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && riskParams?.is_trading_enabled) {
        console.log('Tab became visible, generating signals');
        generateSignals();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [riskParams?.is_trading_enabled, loading, generateSignals]);

  return { generateSignals, isGenerating };
};
