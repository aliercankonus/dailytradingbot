import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Layers, Target, ShieldAlert, ArrowRight, Clock, DollarSign, Percent } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice, formatPercent, formatQuantity } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface TradeLifecycleDialogProps {
  positionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RelatedPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  original_quantity: number | null;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  status: string;
  close_reason: string | null;
  strategy_name: string | null;
  is_hedge: boolean | null;
  parent_position_id: string | null;
  hedge_position_id: string | null;
  partial_tp_level: number | null;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string | null;
}

export const TradeLifecycleDialog = ({ positionId, open, onOpenChange }: TradeLifecycleDialogProps) => {
  // Fetch the main position and all related positions
  const { data: lifecycleData, isLoading } = useQuery({
    queryKey: ['trade-lifecycle', positionId],
    queryFn: async () => {
      if (!positionId) return null;

      // Fetch the main position
      const { data: mainPosition, error: mainError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', positionId)
        .single();

      if (mainError) throw mainError;

      // Find the root position (if this is a partial or hedge)
      let rootPositionId = positionId;
      if (mainPosition.parent_position_id) {
        rootPositionId = mainPosition.parent_position_id;
      }

      // Fetch all positions in this lifecycle:
      // 1. The root position itself
      // 2. All partials (same parent_position_id)
      // 3. All hedges (hedge_position_id links or is_hedge with parent_position_id)
      const { data: allRelated, error: relatedError } = await supabase
        .from('positions')
        .select('*')
        .or(`id.eq.${rootPositionId},parent_position_id.eq.${rootPositionId},hedge_position_id.eq.${rootPositionId}`)
        .order('opened_at', { ascending: true });

      if (relatedError) throw relatedError;

      // Also check if mainPosition has a hedge_position_id to fetch
      let hedgePosition = null;
      if (mainPosition.hedge_position_id) {
        const { data: hedge } = await supabase
          .from('positions')
          .select('*')
          .eq('id', mainPosition.hedge_position_id)
          .single();
        hedgePosition = hedge;
      }

      // Combine and deduplicate
      const allPositions = [...(allRelated || [])];
      if (hedgePosition && !allPositions.find(p => p.id === hedgePosition.id)) {
        allPositions.push(hedgePosition);
      }

      // Categorize positions
      const rootPosition = allPositions.find(p => p.id === rootPositionId && !p.is_hedge);
      const partialCloses = allPositions.filter(p => 
        p.parent_position_id === rootPositionId && 
        !p.is_hedge && 
        p.close_reason?.includes('partial')
      );
      const hedgePositions = allPositions.filter(p => 
        p.is_hedge || 
        p.parent_position_id === rootPositionId && p.strategy_name?.startsWith('Hedge:')
      );
      const finalClose = allPositions.find(p => 
        (p.id === rootPositionId || p.parent_position_id === rootPositionId) && 
        p.status === 'closed' && 
        !p.close_reason?.includes('partial') &&
        !p.is_hedge
      );

      // Build timeline events
      const events: Array<{
        type: 'open' | 'partial_tp' | 'partial_loss' | 'hedge_open' | 'hedge_close' | 'close';
        timestamp: string;
        position: RelatedPosition;
        description: string;
      }> = [];

      // Add open event
      if (rootPosition) {
        events.push({
          type: 'open',
          timestamp: rootPosition.opened_at || rootPosition.updated_at,
          position: rootPosition as RelatedPosition,
          description: `Opened ${rootPosition.side} position at ${formatPrice(rootPosition.entry_price, 4, '$')}`
        });
      }

      // Add partial close events
      partialCloses.forEach(p => {
        const isTP = p.close_reason?.includes('tp');
        events.push({
          type: isTP ? 'partial_tp' : 'partial_loss',
          timestamp: p.closed_at || p.updated_at,
          position: p as RelatedPosition,
          description: isTP 
            ? `Partial TP: ${formatQuantity(p.quantity, 4)} closed at ${formatPrice(p.exit_price || 0, 4, '$')}`
            : `Partial Loss: ${formatQuantity(p.quantity, 4)} closed at ${formatPrice(p.exit_price || 0, 4, '$')}`
        });
      });

      // Add hedge events
      hedgePositions.forEach(p => {
        if (p.opened_at) {
          events.push({
            type: 'hedge_open',
            timestamp: p.opened_at,
            position: p as RelatedPosition,
            description: `Hedge opened: ${p.side} ${formatQuantity(p.quantity, 4)} at ${formatPrice(p.entry_price, 4, '$')}`
          });
        }
        if (p.status === 'closed' && p.closed_at) {
          events.push({
            type: 'hedge_close',
            timestamp: p.closed_at,
            position: p as RelatedPosition,
            description: `Hedge closed: ${formatPrice(p.realized_pnl || 0, 2, '$')} P&L`
          });
        }
      });

      // Add final close event
      if (finalClose && finalClose.status === 'closed') {
        events.push({
          type: 'close',
          timestamp: finalClose.closed_at || finalClose.updated_at,
          position: finalClose as RelatedPosition,
          description: `Position closed: ${getCloseReasonLabel(finalClose.close_reason)}`
        });
      }

      // Sort events by timestamp
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Calculate totals
      const totalPnL = allPositions
        .filter(p => p.status === 'closed')
        .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

      return {
        mainPosition: mainPosition as RelatedPosition,
        rootPosition: rootPosition as RelatedPosition | undefined,
        partialCloses: partialCloses as RelatedPosition[],
        hedgePositions: hedgePositions as RelatedPosition[],
        events,
        totalPnL,
        allPositions: allPositions as RelatedPosition[]
      };
    },
    enabled: !!positionId && open,
  });

  const getCloseReasonLabel = (reason: string | null): string => {
    if (!reason) return 'Manual Close';
    switch (reason) {
      case 'take_profit': return 'Take Profit';
      case 'stop_loss': return 'Stop Loss';
      case 'trailing_stop_loss': return 'Trailing Stop';
      case 'reversal_risk_high': return 'Reversal Risk';
      case 'break_even': return 'Break-Even';
      case 'time_based_stop': return 'Time Exit';
      case 'partial_tp_1': return 'Partial TP 1';
      case 'partial_tp_2': return 'Partial TP 2';
      case 'partial_tp_3': return 'Partial TP 3';
      case 'partial_loss': return 'Partial Loss';
      default: return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'open': return <TrendingUp className="h-4 w-4 text-primary" />;
      case 'partial_tp': return <Target className="h-4 w-4 text-success" />;
      case 'partial_loss': return <ShieldAlert className="h-4 w-4 text-amber-500" />;
      case 'hedge_open': return <Layers className="h-4 w-4 text-indigo-500" />;
      case 'hedge_close': return <Layers className="h-4 w-4 text-indigo-400" />;
      case 'close': return <TrendingDown className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'open': return 'border-primary bg-primary/5';
      case 'partial_tp': return 'border-success bg-success/5';
      case 'partial_loss': return 'border-amber-500 bg-amber-500/5';
      case 'hedge_open': return 'border-indigo-500 bg-indigo-500/5';
      case 'hedge_close': return 'border-indigo-400 bg-indigo-400/5';
      case 'close': return 'border-muted-foreground bg-muted/5';
      default: return 'border-border';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Trade Lifecycle
          </DialogTitle>
          <DialogDescription>
            Complete history of this trade including partial closes, hedges, and related positions
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : lifecycleData ? (
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {lifecycleData.mainPosition.symbol}
                    <Badge className={lifecycleData.mainPosition.side === 'BUY' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                      {lifecycleData.mainPosition.side}
                    </Badge>
                  </span>
                  <span className={`text-xl font-bold ${lifecycleData.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {lifecycleData.totalPnL >= 0 ? '+' : ''}{formatPrice(lifecycleData.totalPnL, 2, '$')}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Entry Price</div>
                    <div className="font-medium">{formatPrice(lifecycleData.rootPosition?.entry_price || lifecycleData.mainPosition.entry_price, 4, '$')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Original Qty</div>
                    <div className="font-medium">{formatQuantity(lifecycleData.rootPosition?.original_quantity || lifecycleData.mainPosition.quantity, 4)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Partial Closes</div>
                    <div className="font-medium">{lifecycleData.partialCloses.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Hedge Positions</div>
                    <div className="font-medium">{lifecycleData.hedgePositions.length}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Event Timeline
              </h3>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                
                <div className="space-y-4">
                  {lifecycleData.events.map((event, index) => (
                    <div key={index} className="relative flex gap-4">
                      {/* Icon circle */}
                      <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${getEventColor(event.type)}`}>
                        {getEventIcon(event.type)}
                      </div>
                      
                      {/* Content */}
                      <div className={`flex-1 rounded-lg border p-3 ${getEventColor(event.type)}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{event.description}</div>
                          {event.position.realized_pnl !== null && event.type !== 'open' && event.type !== 'hedge_open' && (
                            <Badge 
                              variant="outline" 
                              className={event.position.realized_pnl >= 0 ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}
                            >
                              {event.position.realized_pnl >= 0 ? '+' : ''}{formatPrice(event.position.realized_pnl, 2, '$')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss')}
                          {' · '}
                          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            {(lifecycleData.partialCloses.length > 0 || lifecycleData.hedgePositions.length > 0) && (
              <>
                <Separator />
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Partial Closes */}
                  {lifecycleData.partialCloses.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-success" />
                          Partial Closes ({lifecycleData.partialCloses.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {lifecycleData.partialCloses.map((partial, index) => (
                          <div key={partial.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                            <div>
                              <div className="font-medium">{getCloseReasonLabel(partial.close_reason)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatQuantity(partial.quantity, 4)} @ {formatPrice(partial.exit_price || 0, 4, '$')}
                              </div>
                            </div>
                            <Badge 
                              variant="outline" 
                              className={(partial.realized_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}
                            >
                              {(partial.realized_pnl || 0) >= 0 ? '+' : ''}{formatPrice(partial.realized_pnl || 0, 2, '$')}
                            </Badge>
                          </div>
                        ))}
                        <div className="pt-2 border-t flex justify-between text-sm font-medium">
                          <span>Partial Total</span>
                          <span className={lifecycleData.partialCloses.reduce((s, p) => s + (p.realized_pnl || 0), 0) >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatPrice(lifecycleData.partialCloses.reduce((s, p) => s + (p.realized_pnl || 0), 0), 2, '$')}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Hedge Positions */}
                  {lifecycleData.hedgePositions.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Layers className="h-4 w-4 text-indigo-500" />
                          Hedge Positions ({lifecycleData.hedgePositions.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {lifecycleData.hedgePositions.map((hedge, index) => (
                          <div key={hedge.id} className="flex items-center justify-between text-sm p-2 rounded bg-indigo-500/5 border border-indigo-500/20">
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                <Badge variant="outline" className={hedge.side === 'BUY' ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}>
                                  {hedge.side}
                                </Badge>
                                <span className={hedge.status === 'active' ? 'text-yellow-500' : 'text-muted-foreground'}>
                                  {hedge.status}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatQuantity(hedge.quantity, 4)} @ {formatPrice(hedge.entry_price, 4, '$')}
                                {hedge.exit_price && ` → ${formatPrice(hedge.exit_price, 4, '$')}`}
                              </div>
                            </div>
                            {hedge.status === 'closed' && (
                              <Badge 
                                variant="outline" 
                                className={(hedge.realized_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}
                              >
                                {(hedge.realized_pnl || 0) >= 0 ? '+' : ''}{formatPrice(hedge.realized_pnl || 0, 2, '$')}
                              </Badge>
                            )}
                          </div>
                        ))}
                        <div className="pt-2 border-t flex justify-between text-sm font-medium">
                          <span>Hedge Total</span>
                          <span className={lifecycleData.hedgePositions.filter(h => h.status === 'closed').reduce((s, p) => s + (p.realized_pnl || 0), 0) >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatPrice(lifecycleData.hedgePositions.filter(h => h.status === 'closed').reduce((s, p) => s + (p.realized_pnl || 0), 0), 2, '$')}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            {/* Grand Total */}
            <Card className={lifecycleData.totalPnL >= 0 ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className={`h-5 w-5 ${lifecycleData.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`} />
                    <span className="font-semibold">Total Trade P&L</span>
                  </div>
                  <div className={`text-2xl font-bold ${lifecycleData.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {lifecycleData.totalPnL >= 0 ? '+' : ''}{formatPrice(lifecycleData.totalPnL, 2, '$')}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No position data found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
