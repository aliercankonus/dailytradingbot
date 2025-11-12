import { useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { BotStatus } from "@/components/BotStatus";
import { StrategyOverview } from "@/components/StrategyOverview";
import { TradeHistory } from "@/components/TradeHistory";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { LivePriceCard } from "@/components/LivePriceCard";
import { TradingSignalsDashboard } from "@/components/TradingSignalsDashboard";
import { RiskManagementControls } from "@/components/RiskManagementControls";
import { BacktestingModule } from "@/components/BacktestingModule";
import { ActivePositions } from "@/components/ActivePositions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [botActive, setBotActive] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="signals">Trading Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="risk">Risk Management</TabsTrigger>
            <TabsTrigger value="backtest">Backtesting</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <BotStatus active={botActive} onToggle={() => setBotActive(!botActive)} />
              </div>
              <div className="lg:col-span-2">
                <PortfolioMetrics />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <LivePriceCard />
              </div>
              <div className="lg:col-span-2">
                <StrategyOverview />
              </div>
            </div>

            <TradeHistory />
          </TabsContent>

          <TabsContent value="signals">
            <TradingSignalsDashboard />
          </TabsContent>

          <TabsContent value="positions">
            <ActivePositions />
          </TabsContent>

          <TabsContent value="risk">
            <RiskManagementControls />
          </TabsContent>

          <TabsContent value="backtest">
            <BacktestingModule />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
