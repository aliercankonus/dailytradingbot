import { useNavigate, } from "react-router-dom";
import { Settings, Coins, BarChart3 } from "lucide-react";
import { lazy, Suspense } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { BotStatus } from "@/components/BotStatus";
import { TodayPerformanceWidget } from "@/components/TodayPerformanceWidget";
import { TradeHistory } from "@/components/TradeHistory";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { LivePriceCard } from "@/components/LivePriceCard";
import { CloseAllTradesButton } from "@/components/CloseAllTradesButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSignalGenerator } from "@/components/AutoSignalGenerator";
import { TradeCounterSync } from "@/components/TradeCounterSync";
import { Skeleton } from "@/components/ui/skeleton";

import { SignalRefreshProvider } from "@/contexts/SignalRefreshContext";

// Lazy load heavy tab content that isn't visible on initial render
const TradingSignalsDashboard = lazy(() => import("@/components/TradingSignalsDashboard").then(m => ({ default: m.TradingSignalsDashboard })));
const MarketConditionsDashboard = lazy(() => import("@/components/MarketConditionsDashboard").then(m => ({ default: m.MarketConditionsDashboard })));
const BlockedSignalsWidget = lazy(() => import("@/components/BlockedSignalsWidget").then(m => ({ default: m.BlockedSignalsWidget })));
const SignalRejectionMonitor = lazy(() => import("@/components/SignalRejectionMonitor").then(m => ({ default: m.SignalRejectionMonitor })));
const AIAnalysisDashboard = lazy(() => import("@/components/AIAnalysisDashboard").then(m => ({ default: m.AIAnalysisDashboard })));
const ActivePositions = lazy(() => import("@/components/ActivePositions").then(m => ({ default: m.ActivePositions })));
const PositionsSummary = lazy(() => import("@/components/PositionsSummary").then(m => ({ default: m.PositionsSummary })));
const ExitManagementDashboard = lazy(() => import("@/components/ExitManagementDashboard").then(m => ({ default: m.ExitManagementDashboard })));
const TrailingStopMonitor = lazy(() => import("@/components/TrailingStopMonitor").then(m => ({ default: m.TrailingStopMonitor })));
const EarlyWarningExitsDashboard = lazy(() => import("@/components/EarlyWarningExitsDashboard").then(m => ({ default: m.EarlyWarningExitsDashboard })));
const ClosedPositionsDashboard = lazy(() => import("@/components/ClosedPositionsDashboard").then(m => ({ default: m.ClosedPositionsDashboard })));
const PerformanceAnalytics = lazy(() => import("@/components/PerformanceAnalytics").then(m => ({ default: m.PerformanceAnalytics })));
const LossAttributionDashboard = lazy(() => import("@/components/LossAttributionDashboard").then(m => ({ default: m.LossAttributionDashboard })));
const RiskManagementControls = lazy(() => import("@/components/RiskManagementControls").then(m => ({ default: m.RiskManagementControls })));
const MomentumStatusDashboard = lazy(() => import("@/components/MomentumStatusDashboard").then(m => ({ default: m.MomentumStatusDashboard })));
const ModuleInventoryDashboard = lazy(() => import("@/components/ModuleInventoryDashboard"));
const RegimeTransitionLog = lazy(() => import("@/components/RegimeTransitionLog").then(m => ({ default: m.RegimeTransitionLog })));
const OrderFlowDashboard = lazy(() => import("@/components/OrderFlowDashboard").then(m => ({ default: m.OrderFlowDashboard })));
const WebSocketHealthDashboard = lazy(() => import("@/components/WebSocketHealthDashboard").then(m => ({ default: m.WebSocketHealthDashboard })));

const TabFallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const Index = () => {
  const navigate = useNavigate();

  return (
    <SignalRefreshProvider>
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
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
              <div className="lg:col-span-1">
                <BotStatus />
              </div>
              <div className="lg:col-span-2">
                <PortfolioMetrics />
              </div>
              <div className="lg:col-span-1">
                <TodayPerformanceWidget />
              </div>
            </div>

            <TradeHistory />

            <LivePriceCard />

          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <MarketConditionsDashboard />
                </div>
                <div className="lg:col-span-1">
                  <BlockedSignalsWidget />
                </div>
              </div>
              <SignalRejectionMonitor />
              <TradingSignalsDashboard />
              <AIAnalysisDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <PositionsSummary />
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="exit-mgmt">Exit Mgmt</TabsTrigger>
                  <TabsTrigger value="trailing">Trailing Stops</TabsTrigger>
                  <TabsTrigger value="early-exits">Early Exits</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="mt-4">
                  <ActivePositions />
                </TabsContent>
                <TabsContent value="exit-mgmt" className="mt-4">
                  <ExitManagementDashboard />
                </TabsContent>
                <TabsContent value="trailing" className="mt-4">
                  <TrailingStopMonitor />
                </TabsContent>
                <TabsContent value="early-exits" className="mt-4">
                  <EarlyWarningExitsDashboard />
                </TabsContent>
              </Tabs>
            </Suspense>
          </TabsContent>

          <TabsContent value="history">
            <Suspense fallback={<TabFallback />}>
              <ClosedPositionsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <PerformanceAnalytics />
              <LossAttributionDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="risk">
            <Suspense fallback={<TabFallback />}>
              <RiskManagementControls />
            </Suspense>
          </TabsContent>

          <TabsContent value="monitor" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <MomentumStatusDashboard />
                </div>
                <div className="lg:col-span-1">
                  <ModuleInventoryDashboard />
                </div>
              </div>
              <RegimeTransitionLog />
              
              <OrderFlowDashboard />
              <WebSocketHealthDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </SignalRefreshProvider>
  );
};

export default Index;