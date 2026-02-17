import { createContext, useContext, ReactNode } from 'react';
import { useSymbols as useSymbolsHook, TradingSymbol } from '@/hooks/useSymbols';

interface SymbolsContextType {
  symbols: TradingSymbol[];
  activeSymbols: string[];
  loading: boolean;
  addSymbol: (symbol: string, displayName: string) => Promise<void>;
  deleteSymbol: (id: string) => Promise<void>;
  toggleSymbol: (id: string, isActive: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

const SymbolsContext = createContext<SymbolsContextType | undefined>(undefined);

export const SymbolsProvider = ({ children }: { children: ReactNode }) => {
  const value = useSymbolsHook();
  return (
    <SymbolsContext.Provider value={value}>
      {children}
    </SymbolsContext.Provider>
  );
};

export const useSymbolsContext = (): SymbolsContextType => {
  const context = useContext(SymbolsContext);
  if (!context) {
    throw new Error('useSymbolsContext must be used within a SymbolsProvider');
  }
  return context;
};
