import { lazy, Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
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

// Lazy load heavy tab content
const MarketConditionsDashboard = lazy(() => import("@/components/MarketConditionsDashboard").then(m => ({ default: m.MarketConditionsDashboard })));
const SignalsOverview = lazy(() => import("@/components/SignalsOverview").then(m => ({ default: m.SignalsOverview })));
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
const MarketOpportunityDensity = lazy(() => import("@/components/MarketOpportunityDensity"));

const TabFallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const Index = () => {
  return (
    <SignalRefreshProvider>
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6">
        <AutoSignalGenerator />
        <TradeCounterSync />
        <Tabs defaultValue="dashboard" className="space-y-6">
          <div className="relative md:contents">
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-7">
              <TabsTrigger value="dashboard" className="min-w-[5rem] flex-shrink-0">Dashboard</TabsTrigger>
              <TabsTrigger value="signals" className="min-w-[4.5rem] flex-shrink-0">Signals</TabsTrigger>
              <TabsTrigger value="positions" className="min-w-[4.5rem] flex-shrink-0">Positions</TabsTrigger>
              <TabsTrigger value="history" className="min-w-[4rem] flex-shrink-0">History</TabsTrigger>
              <TabsTrigger value="analytics" className="min-w-[5rem] flex-shrink-0">Analytics</TabsTrigger>
              <TabsTrigger value="risk" className="min-w-[3.5rem] flex-shrink-0">Risk</TabsTrigger>
              <TabsTrigger value="monitor" className="min-w-[4.5rem] flex-shrink-0">Monitor</TabsTrigger>
            </TabsList>
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
          </div>

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

            <LivePriceCard />
            <TradeHistory />

            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <MarketConditionsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <SignalsOverview />
            </Suspense>
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <PositionsSummary />
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-4">
                  <TabsTrigger value="active" className="min-w-[4rem] flex-shrink-0">Active</TabsTrigger>
                  <TabsTrigger value="exit-mgmt" className="min-w-[5rem] flex-shrink-0">Exit Mgmt</TabsTrigger>
                  <TabsTrigger value="trailing" className="min-w-[5rem] flex-shrink-0">Trailing Stops</TabsTrigger>
                  <TabsTrigger value="early-exits" className="min-w-[5rem] flex-shrink-0">Early Exits</TabsTrigger>
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
              <MarketOpportunityDensity />
              <OrderFlowDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </SignalRefreshProvider>
  );
};

export default Index;
