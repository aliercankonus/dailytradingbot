import { useNavigate } from "react-router-dom";
import { Settings, Layers, Coins } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { BotStatus } from "@/components/BotStatus";
import { StrategyOverview } from "@/components/StrategyOverview";
import { TradeHistory } from "@/components/TradeHistory";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { LivePriceCard } from "@/components/LivePriceCard";
import { TradingSignalsDashboard } from "@/components/TradingSignalsDashboard";
import { RiskManagementControls } from "@/components/RiskManagementControls";
import { PerformanceAnalytics } from "@/components/PerformanceAnalytics";
import { ActivePositions } from "@/components/ActivePositions";
import { ClosedPositionsDashboard } from "@/components/ClosedPositionsDashboard";
import { CloseAllTradesButton } from "@/components/CloseAllTradesButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSignalGenerator } from "@/components/AutoSignalGenerator";
import { TradeCounterSync } from "@/components/TradeCounterSync";
import { TrailingStopMonitor } from "@/components/TrailingStopMonitor";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <DashboardHeader />
          <div className="flex items-center gap-2 mr-6">
            <button
              onClick={() => navigate('/symbols')}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              aria-label="Trading Symbols"
            >
              <Coins className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={() => navigate('/strategies')}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              aria-label="Strategies"
            >
              <Layers className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6">
        <AutoSignalGenerator />
        <TradeCounterSync />
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="flex justify-end mb-4">
              <CloseAllTradesButton />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-1">
                <BotStatus />
              </div>
              <div className="lg:col-span-2">
                <PortfolioMetrics />
              </div>
            </div>

            <TradeHistory />

            <div className="grid grid-cols-1 gap-6">
              <LivePriceCard />
              <StrategyOverview />
            </div>

            
          </TabsContent>

          <TabsContent value="signals">
            <TradingSignalsDashboard />
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <TrailingStopMonitor />
            <ActivePositions />
          </TabsContent>

          <TabsContent value="history">
            <ClosedPositionsDashboard />
          </TabsContent>

          <TabsContent value="analytics">
            <PerformanceAnalytics />
          </TabsContent>

          <TabsContent value="risk">
            <RiskManagementControls />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
