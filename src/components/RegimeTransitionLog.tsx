import { useRegimeTransitions, RegimeTransitionEntry } from '@/hooks/useRegimeTransitions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight, Clock, Activity } from 'lucide-react';
import { format } from 'date-fns';

const regimeColors: Record<string, string> = {
  TREND_EXPANSION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  BREAKOUT_SETUP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  TREND_EXHAUSTION: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  RANGE_COMPRESSION: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const regimeLabels: Record<string, string> = {
  TREND_EXPANSION: 'Expansion',
  BREAKOUT_SETUP: 'Breakout',
  TREND_EXHAUSTION: 'Exhaustion',
  RANGE_COMPRESSION: 'Compression',
};

const RegimeBadge = ({ regime }: { regime: string }) => (
  <Badge variant="outline" className={`text-xs font-mono ${regimeColors[regime] || 'bg-muted text-muted-foreground'}`}>
    {regimeLabels[regime] || regime}
  </Badge>
);

const TransitionRow = ({ entry }: { entry: RegimeTransitionEntry }) => {
  const time = format(new Date(entry.recorded_at), 'HH:mm');
  const symbol = entry.symbol.replace('USDT', '');

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 py-2 px-2 sm:px-3 rounded-md text-sm ${
      entry.isDivergent ? 'bg-amber-500/5 border border-amber-500/20' : 'border border-transparent'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12 shrink-0 font-mono">{time}</span>
        <span className="font-medium w-14 shrink-0">{symbol}</span>
        <div className="flex items-center gap-1 flex-wrap">
          <RegimeBadge regime={entry.regime} />
          {entry.isDivergent && (
            <>
              <ArrowRight className="h-3 w-3 text-amber-400 shrink-0" />
              <RegimeBadge regime={entry.effective_regime!} />
              <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 pl-[6.5rem] sm:pl-0 sm:ml-auto">
        <span className="font-mono">ADX {entry.adx?.toFixed(1) ?? '—'}</span>
        {entry.adx_slope !== null && (
          <span className={`font-mono ${entry.adx_slope > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {entry.adx_slope > 0 ? '↑' : '↓'}{Math.abs(entry.adx_slope).toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
};

export const RegimeTransitionLog = () => {
  const { data: transitions, isLoading } = useRegimeTransitions();

  const divergentCount = transitions?.filter(t => t.isDivergent).length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Regime Transition Log</CardTitle>
          </div>
          {divergentCount > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {divergentCount} override{divergentCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Raw detected vs effective regime (last 2h) — overrides highlighted
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !transitions?.length ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Clock className="h-4 w-4" />
            <span>No regime transitions in the last 2 hours</span>
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[320px] overflow-y-auto">
            {transitions.map((entry, i) => (
              <TransitionRow key={`${entry.symbol}-${entry.recorded_at}-${i}`} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
