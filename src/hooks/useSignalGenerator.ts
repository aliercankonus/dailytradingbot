import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useSignalGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateSignals = async () => {
    try {
      setIsGenerating(true);
      
      // Check if user is authenticated before making the call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No active session, skipping signal generation');
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
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    // Generate signals immediately on mount
    generateSignals();

    // Generate signals every 5 minutes
    const interval = setInterval(generateSignals, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { generateSignals, isGenerating };
};
