import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Manual-only signal generator — no auto-interval.
// Server-side auto-trader cron (every 5 min) handles autonomous generation.
export const useSignalGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const isRunningRef = useRef(false);

  const generateSignals = useCallback(async () => {
    if (isRunningRef.current) {
      console.log('Signal generation already in progress, skipping');
      return;
    }

    try {
      isRunningRef.current = true;
      setIsGenerating(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No active session, skipping signal generation');
        return;
      }

      const { data, error } = await supabase.functions.invoke('strategy-analyzer');

      if (error) {
        if (error.message?.includes('token') || error.message?.includes('401')) {
          console.log('Authentication error during signal generation, session may have expired');
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
        console.log('No trading opportunities found at this time');
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
  }, [toast]);

  return { generateSignals, isGenerating };
};
