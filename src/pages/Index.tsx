import { useNavigate } from "react-router-dom";
import { Settings, Layers, Coins, BarChart3 } from "lucide-react";
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
import { EarlyWarningExitsDashboard } from "@/components/EarlyWarningExitsDashboard";
import { CloseAllTradesButton } from "@/components/CloseAllTradesButton";
import { WebSocketHealthDashboard } from "@/components/WebSocketHealthDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSignalGenerator } from "@/components/AutoSignalGenerator";
import { TradeCounterSync } from "@/components/TradeCounterSync";
import { TrailingStopMonitor } from "@/components/TrailingStopMonitor";
import { SignalTimingMonitor } from "@/components/SignalTimingMonitor";
import { PositionsSummary } from "@/components/PositionsSummary";
import { AIAnalysisDashboard } from "@/components/AIAnalysisDashboard";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <DashboardHeader />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigate('/performance')}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
                aria-label="Performance"
              >
                <BarChart3 className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
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
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6">
        <AutoSignalGenerator />
        <TradeCounterSync />
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="monitor">Monitor</TabsTrigger>
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

          <TabsContent value="signals" className="space-y-6">
            <SignalTimingMonitor />
            <TradingSignalsDashboard />
            <AIAnalysisDashboard />
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <PositionsSummary />
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="trailing">Trailing Stops</TabsTrigger>
                <TabsTrigger value="early-exits">Early Exits</TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-4">
                <ActivePositions />
              </TabsContent>
              <TabsContent value="trailing" className="mt-4">
                <TrailingStopMonitor />
              </TabsContent>
              <TabsContent value="early-exits" className="mt-4">
                <EarlyWarningExitsDashboard />
              </TabsContent>
            </Tabs>
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

          <TabsContent value="monitor">
            <WebSocketHealthDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
