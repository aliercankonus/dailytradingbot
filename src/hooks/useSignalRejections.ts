import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

export const fetchSignalRejections = async (): Promise<SignalRejection[]> => {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('signal_rejection_log')
    .select('id, symbol, checked_at, rejection_reason, filters_status, trend_data, ai_analysis')
    .gte('checked_at', threeHoursAgo)
    .order('checked_at', { ascending: false })
    .limit(200);

  if (error) throw error;

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

  return Array.from(latestBySymbol.values()).sort((a, b) => 
    a.symbol.localeCompare(b.symbol)
  );
};

export const SIGNAL_REJECTIONS_QUERY_KEY = ['signal-rejections'];

export const useSignalRejections = () => {
  const { user } = useAuth();

  const { data: rejections = [], isLoading: loading } = useQuery({
    queryKey: [...SIGNAL_REJECTIONS_QUERY_KEY, user?.id],
    queryFn: fetchSignalRejections,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    structuralSharing: true,
  });

  return { rejections, loading };
};
