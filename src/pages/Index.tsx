import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useRealtimePositionSync } from "@/hooks/useRealtimePositionSync";
import { AppHeader } from "@/components/AppHeader";
import { BotStatus } from "@/components/BotStatus";
import { TodayPerformanceWidget } from "@/components/TodayPerformanceWidget";
import { TradeHistory } from "@/components/TradeHistory";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { LivePriceCard } from "@/components/LivePriceCard";
import { CloseAllTradesButton } from "@/components/CloseAllTradesButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TradeCounterSync } from "@/components/TradeCounterSync";




import { MarketConditionsDashboard } from "@/components/MarketConditionsDashboard";
import { SignalsOverview } from "@/components/SignalsOverview";
import { SignalProximityWidget } from "@/components/SignalProximityWidget";
import { ActivePositions } from "@/components/ActivePositions";
import { PositionsSummary } from "@/components/PositionsSummary";
import { ExitManagementDashboard } from "@/components/ExitManagementDashboard";
import { TrailingStopMonitor } from "@/components/TrailingStopMonitor";
import { EarlyWarningExitsDashboard } from "@/components/EarlyWarningExitsDashboard";
import { ClosedPositionsDashboard } from "@/components/ClosedPositionsDashboard";
import { RiskManagementControls } from "@/components/RiskManagementControls";
import { MomentumStatusDashboard } from "@/components/MomentumStatusDashboard";
import ModuleInventoryDashboard from "@/components/ModuleInventoryDashboard";
import { RegimeTransitionLog } from "@/components/RegimeTransitionLog";
import { OrderFlowDashboard } from "@/components/OrderFlowDashboard";
import LtfMicroMomentumWidget from "@/components/LtfMicroMomentumWidget";
import MarketOpportunityDensity from "@/components/MarketOpportunityDensity";


const usePersistedTab = (key: string, defaultValue: string) => {
  const [value, setValue] = useState(() => {
    try { return sessionStorage.getItem(key) || defaultValue; } catch { return defaultValue; }
  });
  const setAndPersist = (v: string) => {
    setValue(v);
    try { sessionStorage.setItem(key, v); } catch {}
  };
  return [value, setAndPersist] as const;
};

const Index = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = usePersistedTab("tf-active-tab", "dashboard");

  // Always-on realtime sync regardless of active tab
  useRealtimePositionSync();
  

  const [positionsSubTab, setPositionsSubTab] = usePersistedTab("tf-positions-sub", "active");
  
  const [riskSubTab, setRiskSubTab] = usePersistedTab("tf-risk-sub", "sizing");
  const [monitorSubTab, setMonitorSubTab] = usePersistedTab("tf-monitor-sub", "momentum");

  // Reset to dashboard tab only when explicitly navigating to "/" (e.g. clicking logo)
  const prevLocationKey = useRef(location.key);
  useEffect(() => {
    if (location.key !== prevLocationKey.current && location.pathname === "/") {
      setActiveTab("dashboard");
      prevLocationKey.current = location.key;
    }
  }, [location.key, location.pathname]);

  return (
    <>
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto px-3 sm:px-4 py-4">
        
        <TradeCounterSync />
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="relative md:contents">
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-6 h-8">
              <TabsTrigger value="dashboard" className="min-w-[5rem] flex-shrink-0 text-xs">Dashboard</TabsTrigger>
              <TabsTrigger value="signals" className="min-w-[4.5rem] flex-shrink-0 text-xs">Signals</TabsTrigger>
              <TabsTrigger value="positions" className="min-w-[4.5rem] flex-shrink-0 text-xs">Positions</TabsTrigger>
              <TabsTrigger value="history" className="min-w-[4rem] flex-shrink-0 text-xs">History</TabsTrigger>
              <TabsTrigger value="risk" className="min-w-[3.5rem] flex-shrink-0 text-xs">Risk</TabsTrigger>
              <TabsTrigger value="monitor" className="min-w-[4.5rem] flex-shrink-0 text-xs">Monitor</TabsTrigger>
            </TabsList>
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
          </div>
          

          <TabsContent value="dashboard" className="space-y-4">
            <div className="flex justify-end mb-2">
              <CloseAllTradesButton />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <div>
                <BotStatus />
              </div>
              <div>
                <PortfolioMetrics />
              </div>
              <div>
                <TodayPerformanceWidget />
              </div>
            </div>

            <LivePriceCard />
            <TradeHistory />

            <MarketConditionsDashboard />
          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <SignalProximityWidget />
            <SignalsOverview />
          </TabsContent>

          <TabsContent value="positions" className="space-y-4">
            <PositionsSummary />
            <Tabs value={positionsSubTab} onValueChange={setPositionsSubTab} className="space-y-4">
              <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 h-8">
                <TabsTrigger value="active" className="min-w-[4.5rem] flex-shrink-0 text-xs">Active</TabsTrigger>
                <TabsTrigger value="exits" className="min-w-[4.5rem] flex-shrink-0 text-xs">Exit Mgmt</TabsTrigger>
                <TabsTrigger value="trailing" className="min-w-[5rem] flex-shrink-0 text-xs">Trailing Stop</TabsTrigger>
                <TabsTrigger value="warnings" className="min-w-[5.5rem] flex-shrink-0 text-xs">Early Warnings</TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-4">
                <ActivePositions />
              </TabsContent>

              <TabsContent value="exits">
                <ExitManagementDashboard />
              </TabsContent>

              <TabsContent value="trailing">
                <TrailingStopMonitor />
              </TabsContent>

              <TabsContent value="warnings">
                <EarlyWarningExitsDashboard />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="history">
            <ClosedPositionsDashboard />
          </TabsContent>


          <TabsContent value="risk">
            <Tabs value={riskSubTab} onValueChange={setRiskSubTab} className="space-y-4">
              <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 h-8">
                <TabsTrigger value="sizing" className="min-w-[5rem] flex-shrink-0 text-xs">Trade Sizing</TabsTrigger>
                <TabsTrigger value="basic" className="min-w-[4.5rem] flex-shrink-0 text-xs">Basic Risk</TabsTrigger>
                <TabsTrigger value="advanced" className="min-w-[4.5rem] flex-shrink-0 text-xs">Advanced</TabsTrigger>
                <TabsTrigger value="position" className="min-w-[5rem] flex-shrink-0 text-xs">Position Mgmt</TabsTrigger>
              </TabsList>

              <TabsContent value="sizing">
                <RiskManagementControls section="trade-sizing" />
              </TabsContent>

              <TabsContent value="basic">
                <RiskManagementControls section="basic" />
              </TabsContent>

              <TabsContent value="advanced">
                <RiskManagementControls section="advanced" />
              </TabsContent>

              <TabsContent value="position">
                <RiskManagementControls section="position" />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="monitor">
            <Tabs value={monitorSubTab} onValueChange={setMonitorSubTab} className="space-y-4">
              <TabsList className="flex w-full overflow-x-auto scrollbar-hide md:grid md:grid-cols-5 h-8">
                <TabsTrigger value="momentum" className="min-w-[5rem] flex-shrink-0 text-xs">Momentum</TabsTrigger>
                <TabsTrigger value="regime" className="min-w-[4.5rem] flex-shrink-0 text-xs">Regime</TabsTrigger>
                <TabsTrigger value="modules" className="min-w-[4.5rem] flex-shrink-0 text-xs">Modules</TabsTrigger>
                <TabsTrigger value="opportunity" className="min-w-[5.5rem] flex-shrink-0 text-xs">Opportunity</TabsTrigger>
                <TabsTrigger value="orderflow" className="min-w-[5.5rem] flex-shrink-0 text-xs">Order Flow</TabsTrigger>
              </TabsList>

              <TabsContent value="momentum">
                <MomentumStatusDashboard />
              </TabsContent>

              <TabsContent value="regime">
                <RegimeTransitionLog />
              </TabsContent>

              <TabsContent value="modules">
                <ModuleInventoryDashboard />
              </TabsContent>

              <TabsContent value="opportunity">
                <MarketOpportunityDensity />
              </TabsContent>

              <TabsContent value="orderflow">
                <OrderFlowDashboard />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </>
  );
};

export default Index;
