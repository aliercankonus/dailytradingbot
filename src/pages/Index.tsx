import { useNavigate } from "react-router-dom";
import { Settings, Layers } from "lucide-react";
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
import { MarketBasedRecommendations } from "@/components/MarketBasedRecommendations";
import { CloseAllTradesButton } from "@/components/CloseAllTradesButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSignalGenerator } from "@/components/AutoSignalGenerator";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <DashboardHeader />
          <div className="flex items-center gap-2 mr-6">
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
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="flex justify-end mb-4">
              <CloseAllTradesButton />
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <BotStatus />
              <PortfolioMetrics />
            </div>

            <TradeHistory />

            <div className="grid grid-cols-1 gap-6">
              <LivePriceCard />
              <StrategyOverview />
            </div>

            <MarketBasedRecommendations />
          </TabsContent>

          <TabsContent value="signals">
            <TradingSignalsDashboard />
          </TabsContent>

          <TabsContent value="positions">
            <ActivePositions />
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
