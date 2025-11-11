import { useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { BotStatus } from "@/components/BotStatus";
import { StrategyOverview } from "@/components/StrategyOverview";
import { TradeHistory } from "@/components/TradeHistory";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";

const Index = () => {
  const [botActive, setBotActive] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Top Row: Bot Status & Portfolio */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <BotStatus active={botActive} onToggle={() => setBotActive(!botActive)} />
          </div>
          <div className="lg:col-span-2">
            <PortfolioMetrics />
          </div>
        </div>

        {/* Strategy Overview */}
        <StrategyOverview />

        {/* Trade History */}
        <TradeHistory />
      </main>
    </div>
  );
};

export default Index;
