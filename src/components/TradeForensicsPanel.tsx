import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, AlertTriangle, TrendingUp, TrendingDown, Activity, Gauge, Target, Clock } from 'lucide-react';
import { useState } from 'react';

interface EntrySnapshot {
  signal_id?: string;
  signal_created_at?: string;
  strategy_name?: string;
  quality_score?: number;
  confidence_score?: number;
  adx?: number;
  adx_slope?: number;
  stoch_rsi_4h_k?: number;
  stoch_rsi_4h_d?: number;
  regime?: string;
  primary_trend?: string;
  move_from_24h_low_percent?: number;
  move_from_24h_high_percent?: number;
  price_24h_low?: number;
  price_24h_high?: number;
  entry_exception_type?: string;
  reversal_decision?: string;
  reversal_score?: number;
  entry_gates_passed?: string[];
  position_size_multiplier?: number;
  tf_4h_trend?: string;
  tf_1h_trend?: string;
  tf_30m_trend?: string;
  tf_15m_trend?: string;
  snapshot_created_at?: string;
  // MOMENTUM FORENSICS: New fields for complete traceability
  smart_momentum_score?: number;
  smart_momentum_direction?: string;
  smart_momentum_accelerating?: boolean;
  smart_momentum_weakening?: boolean;
  smart_momentum_exhausted?: boolean;
  momentum_macd_slope?: number;
  momentum_overextension_atr?: number;
  momentum_state?: string;
  momentum_confirms?: boolean;
}

interface Position {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  strategy_name?: string;
  confidence_score?: number;
  trend?: string;
  entry_snapshot?: EntrySnapshot | string;
  live_unrealized_pnl_percent?: number;
  peak_pnl_percent?: number;
}

interface TradeForensicsPanelProps {
  position: Position;
}

export const TradeForensicsPanel = ({ position }: TradeForensicsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse entry_snapshot if it's a string
  const snapshot: EntrySnapshot | null = position.entry_snapshot 
    ? (typeof position.entry_snapshot === 'string' 
        ? JSON.parse(position.entry_snapshot) 
        : position.entry_snapshot)
    : null;

  const currentPnl = position.live_unrealized_pnl_percent ?? 0;
  const isLosing = currentPnl < 0;
  const peakPnl = position.peak_pnl_percent ?? 0;
  
  // Determine why the position might be losing
  const getLossReason = () => {
    if (!isLosing) return null;
    
    const reasons: string[] = [];
    
    // Check if it was a late entry
    const movePercent = position.side === 'BUY' 
      ? snapshot?.move_from_24h_low_percent 
      : snapshot?.move_from_24h_high_percent;
    
    if (movePercent && movePercent > 3.5) {
      reasons.push(`Late entry: Price had moved ${movePercent.toFixed(1)}% before entry`);
    }
    
    // Check low quality score
    if (snapshot?.quality_score && snapshot.quality_score < 65) {
      reasons.push(`Low quality score: ${snapshot.quality_score.toFixed(0)}%`);
    }
    
    // Check low confidence
    if (snapshot?.confidence_score && snapshot.confidence_score < 60) {
      reasons.push(`Low confidence: ${snapshot.confidence_score.toFixed(0)}%`);
    }
    
    // Check neutral trend at entry
    if (snapshot?.primary_trend === 'neutral' || position.trend === 'neutral') {
      reasons.push('Entered during neutral trend (no clear direction)');
    }
    
    // Check weak ADX
    if (typeof snapshot?.adx === 'number' && snapshot.adx < 20) {
      reasons.push(`Weak ADX at entry: ${snapshot.adx.toFixed(1)} (< 20)`);
    }
    
    // Check if peak was higher (gave back profits)
    if (peakPnl > 0.5 && currentPnl < peakPnl - 0.5) {
      reasons.push(`Gave back profits: Peak was +${peakPnl.toFixed(2)}%`);
    }
    
    // Check StochRSI extremes at entry
    if (snapshot?.stoch_rsi_4h_k) {
      if (position.side === 'BUY' && snapshot.stoch_rsi_4h_k > 80) {
        reasons.push(`Overbought at entry: StochRSI K=${snapshot.stoch_rsi_4h_k.toFixed(0)}`);
      } else if (position.side === 'SELL' && snapshot.stoch_rsi_4h_k < 20) {
        reasons.push(`Oversold at entry: StochRSI K=${snapshot.stoch_rsi_4h_k.toFixed(0)}`);
      }
    }
    
    // NEW: Check momentum opposition at entry
    if (snapshot?.smart_momentum_score !== undefined && snapshot?.smart_momentum_score !== null) {
      const momentumScore = snapshot.smart_momentum_score;
      if (position.side === 'BUY' && momentumScore < -15) {
        reasons.push(`Opposing momentum at entry: Score=${momentumScore.toFixed(0)} (bearish)`);
      } else if (position.side === 'SELL' && momentumScore > 15) {
        reasons.push(`Opposing momentum at entry: Score=${momentumScore.toFixed(0)} (bullish)`);
      }
    }
    
    // NEW: Check momentum exhaustion at entry
    if (snapshot?.smart_momentum_exhausted) {
      reasons.push('Momentum was exhausted at entry');
    }
    
    // NEW: Check momentum weakening at entry
    if (snapshot?.smart_momentum_weakening) {
      reasons.push('Momentum was weakening at entry');
    }
    
    return reasons.length > 0 ? reasons : ['Market moved against position'];
  };

  const lossReasons = getLossReason();

  // Simple summary view
  const getSimpleSummary = () => {
    const strategy = snapshot?.strategy_name || position.strategy_name || 'Unknown';
    const quality = snapshot?.quality_score ?? position.confidence_score ?? 0;
    const adx = snapshot?.adx ?? 0;
    const regime = snapshot?.regime || 'unknown';
    
    return { strategy, quality, adx, regime };
  };

  const summary = getSimpleSummary();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-2 text-xs">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Entry Analysis</span>
            {isLosing && lossReasons && (
              <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/20">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {lossReasons.length} issue{lossReasons.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="mt-2 p-3 rounded-md bg-muted/30 space-y-3">
          {/* Simple Summary */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">Entry Summary</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Strategy</div>
                <div className="font-medium truncate">{summary.strategy}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Quality</div>
                <div className={`font-medium ${summary.quality >= 70 ? 'text-green-500' : summary.quality >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {summary.quality.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">ADX</div>
                <div className={`font-medium ${typeof summary.adx === 'number' && summary.adx >= 25 ? 'text-green-500' : typeof summary.adx === 'number' && summary.adx >= 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {typeof summary.adx === 'number' ? summary.adx.toFixed(1) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Regime</div>
                <Badge variant="outline" className="text-xs capitalize">
                  {summary.regime}
                </Badge>
              </div>
            </div>
          </div>

          {/* Loss Reasons (if losing) */}
          {isLosing && lossReasons && lossReasons.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-orange-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Why It's Losing
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {lossReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-orange-500">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical Details (Expandable) */}
          {snapshot && (
            <Collapsible>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className="h-3 w-3" />
                  <span>Technical Details</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2 text-xs">
                  {/* Move Exhaustion */}
                  {(snapshot.move_from_24h_low_percent || snapshot.move_from_24h_high_percent) && (
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Move at Entry:</span>
                      <span className={`font-medium ${
                        (position.side === 'BUY' ? snapshot.move_from_24h_low_percent : snapshot.move_from_24h_high_percent) || 0 > 5 
                          ? 'text-red-500' 
                          : 'text-foreground'
                      }`}>
                        {position.side === 'BUY' 
                          ? `${snapshot.move_from_24h_low_percent?.toFixed(2)}% from 24h low`
                          : `${snapshot.move_from_24h_high_percent?.toFixed(2)}% from 24h high`
                        }
                      </span>
                    </div>
                  )}

                  {/* StochRSI */}
                  {snapshot.stoch_rsi_4h_k && (
                    <div className="flex items-center gap-2">
                      <Gauge className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">4h StochRSI:</span>
                      <span className={`font-medium ${
                        snapshot.stoch_rsi_4h_k > 80 || snapshot.stoch_rsi_4h_k < 20 ? 'text-red-500' : 'text-foreground'
                      }`}>
                        K={snapshot.stoch_rsi_4h_k.toFixed(0)}, D={snapshot.stoch_rsi_4h_d?.toFixed(0) ?? 'N/A'}
                      </span>
                    </div>
                  )}

                  {/* ADX Slope */}
                  {snapshot.adx_slope != null && (
                    <div className="flex items-center gap-2">
                      {snapshot.adx_slope > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-muted-foreground">ADX Slope:</span>
                      <span className={`font-medium ${snapshot.adx_slope > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {snapshot.adx_slope > 0 ? '+' : ''}{snapshot.adx_slope.toFixed(3)}
                      </span>
                    </div>
                  )}

                  {/* Smart Momentum Score */}
                  {snapshot.smart_momentum_score != null && (
                    <div className="flex items-center gap-2">
                      {snapshot.smart_momentum_score > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : snapshot.smart_momentum_score < 0 ? (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      ) : (
                        <Activity className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">Momentum:</span>
                      <span className={`font-medium ${
                        snapshot.smart_momentum_score > 15 ? 'text-green-500' : 
                        snapshot.smart_momentum_score < -15 ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {snapshot.smart_momentum_score > 0 ? '+' : ''}{snapshot.smart_momentum_score.toFixed(0)}
                      </span>
                      <Badge variant="outline" className={`text-xs ${
                        snapshot.smart_momentum_direction === 'bullish' ? 'text-green-500' :
                        snapshot.smart_momentum_direction === 'bearish' ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {snapshot.smart_momentum_direction || 'neutral'}
                      </Badge>
                      {snapshot.smart_momentum_accelerating && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500">
                          Accelerating
                        </Badge>
                      )}
                      {snapshot.smart_momentum_weakening && (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-500">
                          Weakening
                        </Badge>
                      )}
                      {snapshot.smart_momentum_exhausted && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500">
                          Exhausted
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* MACD Slope at Entry */}
                  {snapshot.momentum_macd_slope != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">MACD Slope:</span>
                      <span className={`font-medium ${
                        snapshot.momentum_macd_slope > 0 ? 'text-green-500' : 
                        snapshot.momentum_macd_slope < 0 ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {snapshot.momentum_macd_slope > 0 ? '+' : ''}{snapshot.momentum_macd_slope.toFixed(4)}
                      </span>
                    </div>
                  )}

                  {/* Momentum State at Entry */}
                  {snapshot.momentum_state && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Momentum State:</span>
                      <Badge variant="outline" className={`text-xs ${
                        snapshot.momentum_state === 'confirmed' ? 'bg-green-500/10 text-green-500' :
                        snapshot.momentum_state === 'building' ? 'bg-blue-500/10 text-blue-500' :
                        snapshot.momentum_state === 'exhausted' ? 'bg-red-500/10 text-red-500' :
                        snapshot.momentum_state === 'mixed' ? 'bg-yellow-500/10 text-yellow-500' : ''
                      }`}>
                        {snapshot.momentum_state}
                      </Badge>
                      {snapshot.momentum_confirms !== undefined && (
                        <span className={`text-xs ${snapshot.momentum_confirms ? 'text-green-500' : 'text-red-500'}`}>
                          {snapshot.momentum_confirms ? '✓ Confirms' : '✗ No Confirm'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Timeframe Alignment */}
                  {(snapshot.tf_4h_trend || snapshot.tf_1h_trend || snapshot.tf_30m_trend || snapshot.tf_15m_trend) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">TF Alignment:</span>
                      {snapshot.tf_4h_trend && (
                        <Badge variant="outline" className="text-xs">4h: {snapshot.tf_4h_trend}</Badge>
                      )}
                      {snapshot.tf_1h_trend && (
                        <Badge variant="outline" className="text-xs">1h: {snapshot.tf_1h_trend}</Badge>
                      )}
                      {snapshot.tf_30m_trend && (
                        <Badge variant="outline" className="text-xs">30m: {snapshot.tf_30m_trend}</Badge>
                      )}
                      {snapshot.tf_15m_trend && (
                        <Badge variant="outline" className="text-xs">15m: {snapshot.tf_15m_trend}</Badge>
                      )}
                    </div>
                  )}

                  {/* Entry Exception Type */}
                  {snapshot.entry_exception_type && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Entry Type:</span>
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500">
                        {snapshot.entry_exception_type}
                      </Badge>
                    </div>
                  )}

                  {/* Gates Passed */}
                  {snapshot.entry_gates_passed && snapshot.entry_gates_passed.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Gates Passed:</span>
                      <div className="flex flex-wrap gap-1">
                        {snapshot.entry_gates_passed.map((gate, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {gate}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* No snapshot warning */}
          {!snapshot && (
            <div className="text-xs text-muted-foreground italic">
              Entry snapshot not available (position opened before this feature was enabled)
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
