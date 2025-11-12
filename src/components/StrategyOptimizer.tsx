import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Settings, TrendingUp, Target, Activity, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface StrategyOptimizerProps {
  strategies: Array<{ id: string; name: string }>;
}

export const StrategyOptimizer = ({ strategies }: StrategyOptimizerProps) => {
  const { toast } = useToast();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const [formData, setFormData] = useState({
    strategyId: strategies[0]?.id || '',
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
  });

  const [paramRanges, setParamRanges] = useState({
    stopLoss: { min: 1, max: 5, step: 0.5 },
    takeProfit: { min: 2, max: 10, step: 1 },
    rsiLow: { min: 20, max: 40, step: 5 },
    rsiHigh: { min: 60, max: 80, step: 5 },
  });

  const handleOptimize = async () => {
    if (!formData.strategyId) {
      toast({
        title: "Strategy Required",
        description: "Please select a strategy to optimize",
        variant: "destructive",
      });
      return;
    }

    setIsOptimizing(true);
    try {
      toast({
        title: "Optimizing Strategy",
        description: "Testing parameter combinations...",
      });

      const { data, error } = await supabase.functions.invoke('optimize-strategy', {
        body: {
          ...formData,
          parameterRanges: paramRanges,
        },
      });

      if (error) throw error;

      setResults(data);

      toast({
        title: "Optimization Complete",
        description: `Tested ${data.totalCombinationsTested} combinations`,
      });
    } catch (error) {
      toast({
        title: "Optimization Failed",
        description: error instanceof Error ? error.message : 'Failed to optimize strategy',
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Strategy Optimizer</h2>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic Settings</TabsTrigger>
          <TabsTrigger value="advanced">Parameter Ranges</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Optimization Settings</h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="opt-strategy">Strategy</Label>
                <Select
                  value={formData.strategyId}
                  onValueChange={(value) => setFormData({ ...formData, strategyId: value })}
                >
                  <SelectTrigger id="opt-strategy">
                    <SelectValue placeholder="Select a strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opt-symbol">Symbol</Label>
                <Input
                  id="opt-symbol"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  placeholder="BTCUSDT"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opt-start-date">Start Date</Label>
                <Input
                  id="opt-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opt-end-date">End Date</Label>
                <Input
                  id="opt-end-date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opt-capital">Initial Capital ($)</Label>
                <Input
                  id="opt-capital"
                  type="number"
                  value={formData.initialCapital}
                  onChange={(e) => setFormData({ ...formData, initialCapital: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="advanced">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Parameter Ranges to Test</h3>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Stop Loss %</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Input
                      type="number"
                      value={paramRanges.stopLoss.min}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        stopLoss: { ...paramRanges.stopLoss, min: parseFloat(e.target.value) }
                      })}
                      step="0.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max</Label>
                    <Input
                      type="number"
                      value={paramRanges.stopLoss.max}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        stopLoss: { ...paramRanges.stopLoss, max: parseFloat(e.target.value) }
                      })}
                      step="0.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Step</Label>
                    <Input
                      type="number"
                      value={paramRanges.stopLoss.step}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        stopLoss: { ...paramRanges.stopLoss, step: parseFloat(e.target.value) }
                      })}
                      step="0.5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Take Profit %</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Input
                      type="number"
                      value={paramRanges.takeProfit.min}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        takeProfit: { ...paramRanges.takeProfit, min: parseFloat(e.target.value) }
                      })}
                      step="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max</Label>
                    <Input
                      type="number"
                      value={paramRanges.takeProfit.max}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        takeProfit: { ...paramRanges.takeProfit, max: parseFloat(e.target.value) }
                      })}
                      step="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Step</Label>
                    <Input
                      type="number"
                      value={paramRanges.takeProfit.step}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        takeProfit: { ...paramRanges.takeProfit, step: parseFloat(e.target.value) }
                      })}
                      step="1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">RSI Low (Entry)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiLow.min}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiLow: { ...paramRanges.rsiLow, min: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiLow.max}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiLow: { ...paramRanges.rsiLow, max: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Step</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiLow.step}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiLow: { ...paramRanges.rsiLow, step: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">RSI High (Exit)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiHigh.min}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiHigh: { ...paramRanges.rsiHigh, min: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiHigh.max}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiHigh: { ...paramRanges.rsiHigh, max: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Step</Label>
                    <Input
                      type="number"
                      value={paramRanges.rsiHigh.step}
                      onChange={(e) => setParamRanges({
                        ...paramRanges,
                        rsiHigh: { ...paramRanges.rsiHigh, step: parseFloat(e.target.value) }
                      })}
                      step="5"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Button 
        onClick={handleOptimize} 
        disabled={isOptimizing || !formData.strategyId}
        className="w-full"
      >
        <Zap className="h-4 w-4 mr-2" />
        {isOptimizing ? 'Optimizing...' : 'Optimize Strategy Parameters'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Tests multiple parameter combinations to find optimal settings for maximum profitability
      </p>

      {results && (
        <>
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Optimal Parameters Found
            </h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">Stop Loss</div>
                <div className="text-2xl font-bold">{results.bestParameters?.stopLoss}%</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Take Profit</div>
                <div className="text-2xl font-bold">{results.bestParameters?.takeProfit}%</div>
              </div>
              {results.bestParameters?.rsiLow && (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">RSI Entry</div>
                    <div className="text-2xl font-bold">{results.bestParameters.rsiLow}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">RSI Exit</div>
                    <div className="text-2xl font-bold">{results.bestParameters.rsiHigh}</div>
                  </div>
                </>
              )}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Net Profit</span>
              </div>
              <div className={`text-2xl font-bold ${results.bestResults?.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${results.bestResults?.netProfit?.toFixed(2)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Win Rate</span>
              </div>
              <div className="text-2xl font-bold">{results.bestResults?.winRate?.toFixed(1)}%</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Profit Factor</span>
              </div>
              <div className="text-2xl font-bold">{results.bestResults?.profitFactor?.toFixed(2)}</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-5 w-5 text-orange-500" />
                <span className="text-sm font-medium">Total Trades</span>
              </div>
              <div className="text-2xl font-bold">{results.bestResults?.totalTrades}</div>
            </Card>
          </div>

          {results.topResults && results.topResults.length > 1 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Top 10 Parameter Combinations</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.topResults.map((result: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                      <div className="text-sm">
                        <span className="font-medium">SL:</span> {result.parameters.stopLoss}% |{' '}
                        <span className="font-medium">TP:</span> {result.parameters.takeProfit}%
                        {result.parameters.rsiLow && (
                          <>
                            {' '}| <span className="font-medium">RSI:</span> {result.parameters.rsiLow}-{result.parameters.rsiHigh}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-500 font-medium">
                        WR: {result.winRate?.toFixed(1)}%
                      </span>
                      <span className="text-primary font-medium">
                        PF: {result.profitFactor?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {!results && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No optimization results yet. Configure and run optimization above.</p>
        </Card>
      )}
    </div>
  );
};
