import { useSyncTradeCounters } from '@/hooks/useSyncTradeCounters';

/**
 * Component that automatically syncs trade counters on app startup
 * Mounts globally to ensure counters are always accurate
 */
export function TradeCounterSync() {
  useSyncTradeCounters();
  return null;
}
