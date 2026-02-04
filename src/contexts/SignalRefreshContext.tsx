import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface SignalRefreshContextType {
  lastRefreshTime: number;
  refreshNow: () => void;
  isRefreshing: boolean;
}

const SignalRefreshContext = createContext<SignalRefreshContextType | null>(null);

const REFRESH_INTERVAL_MS = 60000; // 60 seconds - centralized interval for all signal data

export function SignalRefreshProvider({ children }: { children: ReactNode }) {
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshNow = useCallback(() => {
    setIsRefreshing(true);
    setLastRefreshTime(Date.now());
    // Reset refreshing state after a short delay
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshNow();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshNow]);

  return (
    <SignalRefreshContext.Provider value={{ lastRefreshTime, refreshNow, isRefreshing }}>
      {children}
    </SignalRefreshContext.Provider>
  );
}

export function useSignalRefresh() {
  const context = useContext(SignalRefreshContext);
  if (!context) {
    throw new Error('useSignalRefresh must be used within a SignalRefreshProvider');
  }
  return context;
}
