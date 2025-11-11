import { Activity } from "lucide-react";

export const DashboardHeader = () => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Activity className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">CryptoBot</h1>
              <p className="text-xs text-muted-foreground">Algorithmic Trading System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
