import { createContext, useContext, ReactNode } from 'react';
import { useRealtimePrices, RealtimePrice } from '@/hooks/useRealtimePrices';

interface RealtimePricesContextType {
  prices: Map<string, RealtimePrice>;
  priceVersion: number;
  connected: boolean;
  error: string | null;
  getPrice: (symbol: string) => RealtimePrice;
}

const RealtimePricesContext = createContext<RealtimePricesContextType | undefined>(undefined);

export const RealtimePricesProvider = ({ children }: { children: ReactNode }) => {
  const realtimePrices = useRealtimePrices();

  return (
    <RealtimePricesContext.Provider value={realtimePrices}>
      {children}
    </RealtimePricesContext.Provider>
  );
};

export const useRealtimePricesContext = () => {
  const context = useContext(RealtimePricesContext);
  if (context === undefined) {
    throw new Error('useRealtimePricesContext must be used within a RealtimePricesProvider');
  }
  return context;
};
