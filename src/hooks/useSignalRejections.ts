import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AIValidationResult {
  isValid: boolean;
  issues: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
}

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
  ai_analysis: AIValidationResult | null;
}

export const useSignalRejections = () => {
  const [rejections, setRejections] = useState<SignalRejection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRejections = async () => {
      try {
        setLoading(true);
        
        // Calculate timestamp for 30 minutes ago
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        // Get rejections from last 30 minutes, grouped by symbol (latest per symbol)
        const { data, error } = await supabase
          .from('signal_rejection_log')
          .select('*')
          .gte('checked_at', thirtyMinutesAgo)
          .order('checked_at', { ascending: false });

        if (error) throw error;

        // Get the latest rejection for each symbol within the last 30 minutes
        const latestBySymbol = new Map<string, SignalRejection>();
        data?.forEach((rejection) => {
          if (!latestBySymbol.has(rejection.symbol)) {
            latestBySymbol.set(rejection.symbol, {
              id: rejection.id,
              symbol: rejection.symbol,
              checked_at: rejection.checked_at,
              rejection_reason: rejection.rejection_reason,
              filters_status: rejection.filters_status,
              trend_data: rejection.trend_data,
              ai_analysis: rejection.ai_analysis as unknown as AIValidationResult | null,
            });
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
