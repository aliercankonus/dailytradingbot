import { useSignalGenerator } from '@/hooks/useSignalGenerator';

// This component mounts the signal generator globally so signals are created
// immediately on app load and at intervals, regardless of the active tab.
export function AutoSignalGenerator() {
  // The hook self-triggers on mount and every 5 minutes
  useSignalGenerator();
  return null;
}
