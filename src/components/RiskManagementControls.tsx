import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { usePositions } from '@/hooks/usePositions';
import { Shield, AlertTriangle, DollarSign, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

export const RiskManagementControls = () => {
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const { positions } = usePositions();
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

  const totalPnL = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Risk Management</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Open Trades</span>
          </div>
          <div className="text-2xl font-bold">{riskParams.current_open_trades}</div>
          <div className="text-xs text-muted-foreground">Max: {riskParams.max_open_trades}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">Consecutive Losses</span>
          </div>
          <div className="text-2xl font-bold">{riskParams.consecutive_losses}</div>
          <div className="text-xs text-muted-foreground">
            Threshold: {riskParams.consecutive_loss_threshold}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium">Portfolio Value</span>
          </div>
          <div className="text-2xl font-bold">${riskParams.portfolio_value.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Total capital</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm font-medium">Unrealized P&L</span>
          </div>
          <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            ${totalPnL.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">From open positions</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">Daily Loss</span>
          </div>
          <div className="text-2xl font-bold text-destructive">
            ${(riskParams.daily_realized_loss || 0).toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">
            Limit: {riskParams.daily_loss_limit_percent}% (${((riskParams.portfolio_value * riskParams.daily_loss_limit_percent) / 100).toFixed(2)})
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Risk Parameters</h3>
        
        <div className="space-y-6">
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

          </div>

          <Button onClick={handleUpdate} className="w-full">
            Update Risk Parameters
          </Button>
        </div>
      </Card>
    </div>
  );
};