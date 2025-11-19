import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}

export const useSignalRejections = () => {
  const [rejections, setRejections] = useState<SignalRejection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRejections = async () => {
      try {
        setLoading(true);
        
        // Get all rejections (limited to 200 by cleanup), grouped by symbol (latest per symbol)
        const { data, error } = await supabase
          .from('signal_rejection_log')
          .select('*')
          .order('checked_at', { ascending: false });

        if (error) throw error;

        // Get the latest rejection for each symbol
        const latestBySymbol = new Map<string, SignalRejection>();
        data?.forEach((rejection) => {
          if (!latestBySymbol.has(rejection.symbol)) {
            latestBySymbol.set(rejection.symbol, rejection);
          }
        });

        setRejections(Array.from(latestBySymbol.values()));
      } catch (err) {
        console.error('Error fetching signal rejections:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRejections();
    
    // Refresh every minute
    const interval = setInterval(fetchRejections, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return { rejections, loading };
};
