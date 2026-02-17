import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSignalRefresh } from '@/contexts/SignalRefreshContext';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const { lastRefreshTime } = useSignalRefresh();

  const { data: rejections = [], isLoading: loading } = useQuery({
    queryKey: ["signal-rejections", user?.id, lastRefreshTime],
    queryFn: async (): Promise<SignalRejection[]> => {
      // Calculate timestamp for 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      // Get rejections from last 30 minutes - select only needed columns, limit results
      const { data, error } = await supabase
        .from('signal_rejection_log')
        .select('id, symbol, checked_at, rejection_reason, filters_status, trend_data, ai_analysis')
        .gte('checked_at', thirtyMinutesAgo)
        .order('checked_at', { ascending: false })
        .limit(200);

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

      // Sort by symbol name ascending for consistent display order
      return Array.from(latestBySymbol.values()).sort((a, b) => 
        a.symbol.localeCompare(b.symbol)
      );
    },
    enabled: !!user?.id,
    staleTime: 55000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    structuralSharing: true,
  });

  return { rejections, loading };
};
