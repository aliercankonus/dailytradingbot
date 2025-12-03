import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ADXValidationResult {
  symbol: string;
  interval: string;
  lastCandleTime: string;
  lastClose: number;
  calculated: {
    adx: number;
    plusDI: number;
    minusDI: number;
  };
  history: {
    adx: number[];
    dx: number[];
  };
  validationInstructions: string;
  tolerance: string;
}

export const useADXValidation = () => {
  const [result, setResult] = useState<ADXValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateADX = async (symbol = 'BTCUSDT', interval = '1h', limit = 100) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-adx', {
        body: { symbol, interval, limit }
      });

      if (fnError) throw fnError;
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, error, validateADX };
};
