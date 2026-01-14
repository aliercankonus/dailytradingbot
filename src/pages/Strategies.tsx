import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, Activity, Edit, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBuiltInStrategies } from "@/hooks/useBuiltInStrategies";
import { useStrategyPerformanceUpdater } from "@/hooks/useStrategyPerformanceUpdater";
import { BacktestingModule } from "@/components/BacktestingModule";
import { StrategyComparison } from "@/components/StrategyComparison";
import { MonteCarloSimulation } from "@/components/MonteCarloSimulation";
import { EditBuiltInStrategyDialog } from "@/components/EditBuiltInStrategyDialog";

const Strategies = () => {
  const navigate = useNavigate();
  const { strategies: builtInStrategies, loading: builtInLoading, toggleStatus, refetch: refetchBuiltIn } = useBuiltInStrategies();
  const { updatePerformance, isUpdating } = useStrategyPerformanceUpdater();
  const [editingBuiltInStrategy, setEditingBuiltInStrategy] = useState<any>(null);

  const handleUpdatePerformance = async () => {
    await updatePerformance();
    refetchBuiltIn();
  };

  const handleBuiltInToggle = async (id: string, currentStatus: string) => {
    await toggleStatus(id, currentStatus);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Trading Performance</h1>
                <p className="text-sm text-muted-foreground">Monitor and analyze your trading strategies</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="all">Strategies</TabsTrigger>
            <TabsTrigger value="backtesting">Backtest</TabsTrigger>
            <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
            <TabsTrigger value="comparison">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            {/* Built-in Strategies */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Active Trading Strategies</h2>
                <Button 
                  onClick={handleUpdatePerformance} 
                  disabled={isUpdating}
                  size="sm" 
                  variant="outline"
                  className="gap-2"
                >
                  <Activity className="h-4 w-4" />
                  {isUpdating ? 'Calculating...' : 'Update Metrics'}
                </Button>
              </div>
              {builtInLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                  <p className="mt-4 text-muted-foreground">Loading strategies...</p>
                </div>
              ) : builtInStrategies.length === 0 ? (
                <Card className="p-12 text-center">
                  <p className="text-muted-foreground">No strategies available. Run the auto-trader to generate performance data.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {builtInStrategies.map((strategy) => (
                    <Card key={strategy.id} className="p-6 hover:border-primary/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-lg text-foreground">
                              {strategy.strategy_name}
                            </h3>
                            <Badge variant={strategy.status === "active" ? "default" : "secondary"}>
                              {strategy.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground mb-1">Total Trades</div>
                              <div className="font-mono text-foreground font-semibold">{strategy.total_trades}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">Win Rate</div>
                              <div className="font-mono text-foreground font-semibold">
                                {strategy.total_trades > 0 
                                  ? ((strategy.winning_trades / strategy.total_trades) * 100).toFixed(1)
                                  : "0"}%
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">Total Profit</div>
                              <div className={`font-mono font-semibold ${strategy.total_profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                                ${strategy.total_profit?.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">Max Drawdown</div>
                              <div className="font-mono text-loss font-semibold">
                                {strategy.max_drawdown?.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingBuiltInStrategy(strategy)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <div className="flex items-center gap-2">
                            <Power className="h-4 w-4 text-muted-foreground" />
                            <Switch
                              checked={strategy.status === 'active'}
                              onCheckedChange={() => handleBuiltInToggle(strategy.id, strategy.status)}
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="backtesting">
            {builtInStrategies.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  No strategies available for backtesting. Run the auto-trader first.
                </p>
              </Card>
            ) : (
              <BacktestingModule 
                strategies={builtInStrategies.map(s => ({ id: s.id, name: s.strategy_name }))}
              />
            )}
          </TabsContent>

          <TabsContent value="comparison">
            <StrategyComparison />
          </TabsContent>

          <TabsContent value="monte-carlo">
            {builtInStrategies.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No strategies available for Monte Carlo simulations.</p>
              </Card>
            ) : (
              <MonteCarloSimulation 
                strategies={builtInStrategies.map(s => ({ id: s.id, name: s.strategy_name }))}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <EditBuiltInStrategyDialog
        strategy={editingBuiltInStrategy}
        open={!!editingBuiltInStrategy}
        onOpenChange={(open) => !open && setEditingBuiltInStrategy(null)}
        onSuccess={refetchBuiltIn}
      />
    </div>
  );
};

export default Strategies;
