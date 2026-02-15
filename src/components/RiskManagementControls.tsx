import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { usePositions } from '@/hooks/usePositions';
import { useRealtimePricesContext } from '@/contexts/RealtimePricesContext';
import { Shield, AlertTriangle, DollarSign, TrendingDown, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { TrailingStopSettings } from '@/components/TrailingStopSettings';
import { DivergenceSettings } from '@/components/DivergenceSettings';
import { LossManagementSettings } from '@/components/LossManagementSettings';
import { UnifiedRiskSettings } from '@/components/UnifiedRiskSettings';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatPrice } from '@/lib/utils';

interface RiskManagementControlsProps {
  section?: 'trade-sizing' | 'basic' | 'advanced' | 'position';
}

export const RiskManagementControls = ({ section }: RiskManagementControlsProps = {}) => {
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const { positions } = usePositions();
  
  // Get live prices from shared context
  const { priceVersion, getPrice } = useRealtimePricesContext();
  
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    max_risk_per_trade_percent: 1.5,
    max_open_trades: 5,
    consecutive_loss_threshold: 3,
    position_size_reduction_percent: 50,
    portfolio_value: 10000,
    min_confidence_threshold: 60,
    min_trend_consistency: 50,
    max_trades_per_symbol: 1,
    daily_loss_limit_percent: 5.0,
    standard_tp_multiplier: 2.5,
    divergence_tp_multiplier: 2.0,
    divergence_sl_multiplier: 0.67,
  });

  useEffect(() => {
    if (riskParams) {
      setFormData({
        max_risk_per_trade_percent: riskParams.max_risk_per_trade_percent,
        max_open_trades: riskParams.max_open_trades,
        consecutive_loss_threshold: riskParams.consecutive_loss_threshold,
        position_size_reduction_percent: riskParams.position_size_reduction_percent,
        portfolio_value: riskParams.portfolio_value,
        min_confidence_threshold: riskParams.min_confidence_threshold,
        min_trend_consistency: riskParams.min_trend_consistency,
        max_trades_per_symbol: riskParams.max_trades_per_symbol || 1,
        daily_loss_limit_percent: riskParams.daily_loss_limit_percent || 5.0,
        standard_tp_multiplier: riskParams.standard_tp_multiplier || 2.5,
        divergence_tp_multiplier: riskParams.divergence_tp_multiplier || 2.0,
        divergence_sl_multiplier: riskParams.divergence_sl_multiplier || 0.67,
      });
    }
  }, [riskParams]);

  const handleUpdate = async () => {
    try {
      await updateRiskParameters(formData);
      toast({
        title: "Settings Updated",
        description: "Risk management parameters have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : 'Failed to update settings',
        variant: "destructive",
      });
    }
  };

  if (!riskParams) {
    return <Card className="p-6"><p className="text-muted-foreground">Loading...</p></Card>;
  }

  const totalPnL = positions
    .filter(p => p.status === 'active')
    .reduce((sum, pos) => {
      const livePrice = getPrice(pos.symbol);
      const currentPrice = livePrice
        ? parseFloat(livePrice.price)
        : pos.current_price || pos.entry_price;
      
      const pnl = pos.side === 'BUY'
        ? (currentPrice - pos.entry_price) * pos.quantity
        : (pos.entry_price - currentPrice) * pos.quantity;
      
      return sum + pnl;
    }, 0);

  const showAll = !section;
  const showSection = (s: string) => showAll || section === s;

  return (
    <div className="space-y-4">
      {showAll && <h2 className="text-lg font-semibold">Risk Management</h2>}

      {showAll && (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Open Trades</span>
          </div>
          <div className="text-lg font-bold">{riskParams.current_open_trades}</div>
          <div className="text-[10px] text-muted-foreground">Max: {riskParams.max_open_trades}</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-loss" />
            <span className="text-xs font-medium">Consec. Losses</span>
          </div>
          <div className="text-lg font-bold">{riskParams.consecutive_losses}</div>
          <div className="text-[10px] text-muted-foreground">Threshold: {riskParams.consecutive_loss_threshold}</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <DollarSign className="h-3.5 w-3.5 text-profit" />
            <span className="text-xs font-medium">Portfolio Value</span>
          </div>
          <div className="text-lg font-bold truncate">{formatPrice(riskParams.portfolio_value, 2, '$')}</div>
          <div className="text-[10px] text-muted-foreground">Total capital</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-medium">Unrealized P&L</span>
          </div>
          <div className={`text-lg font-bold truncate ${totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
            {formatPrice(totalPnL, 2, '$')}
          </div>
          <div className="text-[10px] text-muted-foreground">From open positions</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-loss" />
            <span className="text-xs font-medium">Daily Loss</span>
          </div>
          <div className="text-lg font-bold text-loss truncate">
            {formatPrice(riskParams.daily_realized_loss || 0, 2, '$')}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Limit: {riskParams.daily_loss_limit_percent}%
          </div>
        </Card>
      </div>
      )}

      <Accordion type="multiple" defaultValue={[section || "trade-sizing", "basic", "position"]} className="space-y-4">
        {showSection('trade-sizing') && (
        <AccordionItem value="trade-sizing">
          <Card>
            <AccordionTrigger className="px-3 sm:px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Trade Sizing</h3>
                  <p className="text-sm text-muted-foreground">Position size, stop loss, and take profit</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 sm:px-6 pb-6">
              <UnifiedRiskSettings />
            </AccordionContent>
          </Card>
        </AccordionItem>
        )}

        {showSection('basic') && (
        <AccordionItem value="basic">
          <Card>
            <AccordionTrigger className="px-3 sm:px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Basic Risk Parameters</h3>
                  <p className="text-sm text-muted-foreground">Portfolio value, position sizing, and loss limits</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 sm:px-6 pb-6">
              <div className="space-y-6 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="portfolio-value">Portfolio Value ($)</Label>
              <Input
                id="portfolio-value"
                type="number"
                value={formData.portfolio_value}
                onChange={(e) => 
                  setFormData({ ...formData, portfolio_value: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-risk">Max Risk Per Trade (%)</Label>
              <Input
                id="max-risk"
                type="number"
                step="0.1"
                value={formData.max_risk_per_trade_percent}
                onChange={(e) => 
                  setFormData({ ...formData, max_risk_per_trade_percent: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-trades">Max Open Trades</Label>
              <Input
                id="max-trades"
                type="number"
                value={formData.max_open_trades}
                onChange={(e) => 
                  setFormData({ ...formData, max_open_trades: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loss-threshold">Consecutive Loss Threshold</Label>
              <Input
                id="loss-threshold"
                type="number"
                value={formData.consecutive_loss_threshold}
                onChange={(e) => 
                  setFormData({ ...formData, consecutive_loss_threshold: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="size-reduction">Position Size Reduction (%)</Label>
              <Input
                id="size-reduction"
                type="number"
                value={formData.position_size_reduction_percent}
                onChange={(e) => 
                  setFormData({ ...formData, position_size_reduction_percent: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Applied after reaching loss threshold
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-confidence">Minimum Confidence Threshold (%)</Label>
              <Input
                id="min-confidence"
                type="number"
                min="0"
                max="100"
                value={formData.min_confidence_threshold}
                onChange={(e) => 
                  setFormData({ ...formData, min_confidence_threshold: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Minimum confidence score (0-100) required for trade execution
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-trend-consistency">Minimum Trend Consistency (%)</Label>
              <Input
                id="min-trend-consistency"
                type="number"
                min="0"
                max="100"
                value={formData.min_trend_consistency}
                onChange={(e) => 
                  setFormData({ ...formData, min_trend_consistency: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Minimum trend consistency (0-100) required for trade execution
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-trades-per-symbol">Max Trades Per Symbol</Label>
              <Input
                id="max-trades-per-symbol"
                type="number"
                min="1"
                max="5"
                value={formData.max_trades_per_symbol}
                onChange={(e) => 
                  setFormData({ ...formData, max_trades_per_symbol: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Prevents over-concentration on single assets (recommended: 1)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-loss-limit">Daily Loss Circuit Breaker (%)</Label>
              <Input
                id="daily-loss-limit"
                type="number"
                min="1"
                max="20"
                step="0.5"
                value={formData.daily_loss_limit_percent}
                onChange={(e) => 
                  setFormData({ ...formData, daily_loss_limit_percent: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Stops all trading if daily losses exceed this % of portfolio (recommended: 5%)
              </p>
            </div>

                </div>

                <Button onClick={handleUpdate} className="w-full">
                  Update Basic Risk Parameters
                </Button>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>
        )}

        {showSection('advanced') && (
        <AccordionItem value="advanced">
          <Card>
            <AccordionTrigger className="px-3 sm:px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Advanced Strategies</h3>
                  <p className="text-sm text-muted-foreground">Signal filtering, confidence thresholds, and TP/SL multipliers</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 sm:px-6 pb-6">
              <div className="space-y-6 pt-4">
                <div className="grid gap-4 md:grid-cols-2">

            <div className="space-y-2">
              <Label htmlFor="standard-tp-multiplier">Standard Take Profit Multiplier</Label>
              <Input
                id="standard-tp-multiplier"
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.standard_tp_multiplier}
                onChange={(e) => 
                  setFormData({ ...formData, standard_tp_multiplier: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Take profit = SL distance × this multiplier (e.g., 2.5 = 1:2.5 risk/reward for aligned signals)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="divergence-tp-multiplier">Divergence Take Profit Multiplier</Label>
              <Input
                id="divergence-tp-multiplier"
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.divergence_tp_multiplier}
                onChange={(e) => 
                  setFormData({ ...formData, divergence_tp_multiplier: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Tighter TP for shorter-term divergence signals (e.g., 2.0 = 1:2.0 risk/reward)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="divergence-sl-multiplier">Divergence Stop Loss Multiplier</Label>
              <Input
                id="divergence-sl-multiplier"
                type="number"
                min="0.3"
                max="1.5"
                step="0.05"
                value={formData.divergence_sl_multiplier}
                onChange={(e) => 
                  setFormData({ ...formData, divergence_sl_multiplier: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Tighter SL for divergence signals (e.g., 0.67 = 1% SL when max risk is 1.5%)
              </p>
            </div>

                </div>

                <Button onClick={handleUpdate} className="w-full">
                  Update Advanced Strategy Parameters
                </Button>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>
        )}

        {showSection('position') && (
        <AccordionItem value="position">
          <Card>
            <AccordionTrigger className="px-3 sm:px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Position Management</h3>
                  <p className="text-sm text-muted-foreground">Trailing stops, loss management, and divergence strategies</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 sm:px-6 pb-6 space-y-6 pt-4">

              {/* Loss Management Strategies - NEW */}
              <LossManagementSettings />

              {/* Trailing Stop Loss Settings */}
              <TrailingStopSettings />

              {/* Divergence Opportunity Strategy */}
              <DivergenceSettings />
            </AccordionContent>
          </Card>
        </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};