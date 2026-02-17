import { createContext, useContext, ReactNode } from 'react';
import { useRiskParameters as useRiskParametersHook, RiskParameters } from '@/hooks/useRiskParameters';

interface RiskParametersContextType {
  riskParams: RiskParameters | null;
  loading: boolean;
  error: string | null;
  updateRiskParameters: (updates: Partial<RiskParameters>) => Promise<void>;
}

const RiskParametersContext = createContext<RiskParametersContextType | undefined>(undefined);

export const RiskParametersProvider = ({ children }: { children: ReactNode }) => {
  const value = useRiskParametersHook();
  return (
    <RiskParametersContext.Provider value={value}>
      {children}
    </RiskParametersContext.Provider>
  );
};

export const useRiskParametersContext = (): RiskParametersContextType => {
  const context = useContext(RiskParametersContext);
  if (!context) {
    throw new Error('useRiskParametersContext must be used within a RiskParametersProvider');
  }
  return context;
};
