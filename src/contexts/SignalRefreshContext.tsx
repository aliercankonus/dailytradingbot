import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface SignalRefreshContextType {
  lastRefreshTime: number;
  refreshNow: () => void;
  isRefreshing: boolean;
  secondsUntilRefresh: number;
}

const SignalRefreshContext = createContext<SignalRefreshContextType | null>(null);

const REFRESH_INTERVAL_S = 60; // 60 seconds - centralized interval for all signal data

export function SignalRefreshProvider({ children }: { children: ReactNode }) {
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_INTERVAL_S);

  const refreshNow = useCallback(() => {
    setIsRefreshing(true);
    setLastRefreshTime(Date.now());
    setSecondsUntilRefresh(REFRESH_INTERVAL_S);
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          // Trigger refresh
          setIsRefreshing(true);
          setLastRefreshTime(Date.now());
          setTimeout(() => setIsRefreshing(false), 500);
          return REFRESH_INTERVAL_S;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SignalRefreshContext.Provider value={{ lastRefreshTime, refreshNow, isRefreshing, secondsUntilRefresh }}>
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
