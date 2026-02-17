import { useSignalRefresh } from '@/contexts/SignalRefreshContext';

export function RefreshCountdownBar() {
  const { secondsUntilRefresh, isRefreshing } = useSignalRefresh();
  const progress = (secondsUntilRefresh / 60) * 100;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1 flex-1 max-w-[120px] bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isRefreshing ? 'bg-primary animate-pulse' : 'bg-primary/60'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="tabular-nums w-7 text-right">
        {isRefreshing ? '...' : `${secondsUntilRefresh}s`}
      </span>
    </div>
  );
}
