import { useMemo, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Brush, ReferenceArea } from 'recharts';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface PriceEvent {
  timestamp: string;
  price: number;
  type: 'entry' | 'partial_tp' | 'partial_loss' | 'hedge_open' | 'hedge_close' | 'exit';
  label: string;
  pnl?: number | null;
}

interface TradeLifecyclePriceChartProps {
  events: Array<{
    type: string;
    timestamp: string;
    position: {
      entry_price: number;
      exit_price: number | null;
      realized_pnl: number | null;
      stop_loss: number | null;
      take_profit: number | null;
    };
    description: string;
  }>;
  stopLoss?: number | null;
  takeProfit?: number | null;
  side: 'BUY' | 'SELL' | string;
}

export const TradeLifecyclePriceChart = ({ events, stopLoss, takeProfit, side }: TradeLifecyclePriceChartProps) => {
  const [zoomState, setZoomState] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const chartData = useMemo(() => {
    if (!events || events.length === 0) return [];

    const priceEvents: PriceEvent[] = [];

    events.forEach((event) => {
      const eventType = event.type;
      
      if (eventType === 'open') {
        priceEvents.push({
          timestamp: event.timestamp,
          price: event.position.entry_price,
          type: 'entry',
          label: 'Entry',
          pnl: null
        });
      } else if (eventType === 'partial_tp' || eventType === 'partial_loss') {
        if (event.position.exit_price) {
          priceEvents.push({
            timestamp: event.timestamp,
            price: event.position.exit_price,
            type: eventType,
            label: eventType === 'partial_tp' ? 'Partial TP' : 'Partial Loss',
            pnl: event.position.realized_pnl
          });
        }
      } else if (eventType === 'hedge_open') {
        priceEvents.push({
          timestamp: event.timestamp,
          price: event.position.entry_price,
          type: 'hedge_open',
          label: 'Hedge Open',
          pnl: null
        });
      } else if (eventType === 'hedge_close') {
        if (event.position.exit_price) {
          priceEvents.push({
            timestamp: event.timestamp,
            price: event.position.exit_price,
            type: 'hedge_close',
            label: 'Hedge Close',
            pnl: event.position.realized_pnl
          });
        }
      } else if (eventType === 'close') {
        if (event.position.exit_price) {
          priceEvents.push({
            timestamp: event.timestamp,
            price: event.position.exit_price,
            type: 'exit',
            label: 'Exit',
            pnl: event.position.realized_pnl
          });
        }
      }
    });

    // Sort by timestamp
    priceEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return priceEvents;
  }, [events]);

  const visibleData = useMemo(() => {
    if (!zoomState || chartData.length === 0) return chartData;
    return chartData.slice(zoomState.startIndex, zoomState.endIndex + 1);
  }, [chartData, zoomState]);

  const { minPrice, maxPrice, entryPrice } = useMemo(() => {
    if (visibleData.length === 0) return { minPrice: 0, maxPrice: 0, entryPrice: 0 };

    const prices = visibleData.map(d => d.price);
    if (stopLoss && (!zoomState || visibleData.some(d => d.type === 'entry'))) prices.push(stopLoss);
    if (takeProfit && (!zoomState || visibleData.some(d => d.type === 'entry'))) prices.push(takeProfit);

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.15;
    const entry = chartData.find(d => d.type === 'entry')?.price || 0;

    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      entryPrice: entry
    };
  }, [visibleData, stopLoss, takeProfit, zoomState, chartData]);

  const handleMouseDown = useCallback((e: any) => {
    if (e?.activeLabel) {
      setRefAreaLeft(e.activeLabel);
      setIsSelecting(true);
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (isSelecting && e?.activeLabel) {
      setRefAreaRight(e.activeLabel);
    }
  }, [isSelecting]);

  const handleMouseUp = useCallback(() => {
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      const leftIndex = chartData.findIndex(d => d.timestamp === refAreaLeft);
      const rightIndex = chartData.findIndex(d => d.timestamp === refAreaRight);
      
      if (leftIndex !== -1 && rightIndex !== -1) {
        const startIndex = Math.min(leftIndex, rightIndex);
        const endIndex = Math.max(leftIndex, rightIndex);
        setZoomState({ startIndex, endIndex });
      }
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsSelecting(false);
  }, [refAreaLeft, refAreaRight, chartData]);

  const handleZoomIn = useCallback(() => {
    if (chartData.length <= 2) return;
    
    const currentStart = zoomState?.startIndex ?? 0;
    const currentEnd = zoomState?.endIndex ?? chartData.length - 1;
    const range = currentEnd - currentStart;
    
    if (range <= 2) return;
    
    const shrink = Math.max(1, Math.floor(range * 0.2));
    setZoomState({
      startIndex: currentStart + shrink,
      endIndex: currentEnd - shrink
    });
  }, [chartData.length, zoomState]);

  const handleZoomOut = useCallback(() => {
    if (!zoomState) return;
    
    const expand = Math.max(1, Math.floor((zoomState.endIndex - zoomState.startIndex) * 0.3));
    const newStart = Math.max(0, zoomState.startIndex - expand);
    const newEnd = Math.min(chartData.length - 1, zoomState.endIndex + expand);
    
    if (newStart === 0 && newEnd === chartData.length - 1) {
      setZoomState(null);
    } else {
      setZoomState({ startIndex: newStart, endIndex: newEnd });
    }
  }, [chartData.length, zoomState]);

  const handleReset = useCallback(() => {
    setZoomState(null);
  }, []);

  const handleBrushChange = useCallback((brushState: any) => {
    if (brushState && brushState.startIndex !== undefined && brushState.endIndex !== undefined) {
      if (brushState.startIndex === 0 && brushState.endIndex === chartData.length - 1) {
        setZoomState(null);
      } else {
        setZoomState({ startIndex: brushState.startIndex, endIndex: brushState.endIndex });
      }
    }
  }, [chartData.length]);

  if (chartData.length === 0) {
    return null;
  }

  const getMarkerColor = (type: PriceEvent['type']) => {
    switch (type) {
      case 'entry': return 'hsl(var(--primary))';
      case 'partial_tp': return 'hsl(var(--success))';
      case 'partial_loss': return 'hsl(38, 92%, 50%)'; // amber
      case 'hedge_open': return 'hsl(239, 84%, 67%)'; // indigo
      case 'hedge_close': return 'hsl(239, 84%, 67%)';
      case 'exit': return 'hsl(var(--muted-foreground))';
      default: return 'hsl(var(--foreground))';
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as PriceEvent;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <div className="font-semibold text-foreground">{data.label}</div>
          <div className="text-sm text-muted-foreground">
            {format(new Date(data.timestamp), 'MMM d, HH:mm:ss')}
          </div>
          <div className="mt-1 font-medium text-foreground">
            {formatPrice(data.price, 4, '$')}
          </div>
          {data.pnl !== null && data.pnl !== undefined && (
            <div className={`text-sm font-medium mt-1 ${data.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              P&L: {data.pnl >= 0 ? '+' : ''}{formatPrice(data.pnl, 2, '$')}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const showBrush = chartData.length > 3;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Price Movement
            {zoomState && (
              <span className="text-xs text-muted-foreground font-normal">
                (Zoomed: {visibleData.length} of {chartData.length} events)
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomIn}
              disabled={chartData.length <= 2 || (zoomState && zoomState.endIndex - zoomState.startIndex <= 2)}
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomOut}
              disabled={!zoomState}
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleReset}
              disabled={!zoomState}
              title="Reset Zoom"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-2 text-center">
          Drag on chart to zoom • Use brush below to pan
        </div>
        <div className={showBrush ? "h-[240px]" : "h-[200px]"} style={{ width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: showBrush ? 30 : 10 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <XAxis
                dataKey="timestamp"
                tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDataOverflow
                domain={zoomState ? [visibleData[0]?.timestamp, visibleData[visibleData.length - 1]?.timestamp] : ['dataMin', 'dataMax']}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickFormatter={(val) => formatPrice(val, 2, '$')}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={65}
                allowDataOverflow
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Stop Loss Reference Line */}
              {stopLoss && (
                <ReferenceLine
                  y={stopLoss}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'SL',
                    position: 'right',
                    fill: 'hsl(var(--destructive))',
                    fontSize: 10
                  }}
                />
              )}
              
              {/* Take Profit Reference Line */}
              {takeProfit && (
                <ReferenceLine
                  y={takeProfit}
                  stroke="hsl(var(--success))"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'TP',
                    position: 'right',
                    fill: 'hsl(var(--success))',
                    fontSize: 10
                  }}
                />
              )}

              {/* Entry Price Reference Line */}
              {entryPrice > 0 && (
                <ReferenceLine
                  y={entryPrice}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
              )}

              {/* Zoom Selection Area */}
              {refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  strokeOpacity={0.3}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                />
              )}

              {/* Price Line */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />

              {/* Event Markers */}
              {chartData.map((event, index) => (
                <ReferenceDot
                  key={index}
                  x={event.timestamp}
                  y={event.price}
                  r={event.type === 'entry' || event.type === 'exit' ? 8 : 6}
                  fill={getMarkerColor(event.type)}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              ))}

              {/* Brush for panning */}
              {showBrush && (
                <Brush
                  dataKey="timestamp"
                  height={20}
                  stroke="hsl(var(--border))"
                  fill="hsl(var(--muted))"
                  tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                  onChange={handleBrushChange}
                  startIndex={zoomState?.startIndex}
                  endIndex={zoomState?.endIndex}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">Entry</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-muted-foreground">Partial TP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
            <span className="text-muted-foreground">Partial Loss</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(239, 84%, 67%)' }} />
            <span className="text-muted-foreground">Hedge</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Exit</span>
          </div>
          {stopLoss && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-destructive" style={{ borderStyle: 'dashed' }} />
              <span className="text-muted-foreground">Stop Loss</span>
            </div>
          )}
          {takeProfit && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-success" style={{ borderStyle: 'dashed' }} />
              <span className="text-muted-foreground">Take Profit</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};