import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useSignalGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateSignals = async () => {
    try {
      setIsGenerating(true);
      const { data, error } = await supabase.functions.invoke('strategy-analyzer');

      if (error) throw error;

      if (data?.signals?.length > 0) {
        toast({
          title: "Signals Generated",
          description: `Found ${data.signals.length} new trading signals`,
        });
      }
    } catch (error) {
      console.error('Error generating signals:', error);
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
