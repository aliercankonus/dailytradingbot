import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiskParametersContext } from "@/contexts/RiskParametersContext";
import { 
  Cpu, 
  TrendingUp, 
  Shrink, 
  ArrowLeftRight, 
  Zap, 
  GitBranch,
  Shield,
  Activity,
  Eye,
  Bot,
  BarChart3,
  Lock,
  Timer,
  AlertTriangle,
  Gauge,
  Scissors,
  HeartPulse,
  Waves
} from "lucide-react";

interface ModuleItem {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'inactive' | 'always-on';
  category: 'engine' | 'sub-strategy' | 'risk' | 'execution';
  regime?: string;
  sizing?: string;
}

const ModuleInventoryDashboard = () => {
  const { riskParams, loading } = useRiskParametersContext();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            Module Inventory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const modules: ModuleItem[] = [
    // === ENGINES ===
    {
      name: 'Trend Expansion Engine',
      description: 'Primary engine for directional moves in confirmed trends',
      icon: <TrendingUp className="h-4 w-4" />,
      status: riskParams?.is_trading_enabled ? 'active' : 'inactive',
      category: 'engine',
      regime: 'TREND_EXPANSION / BREAKOUT_SETUP',
      sizing: '1.0x base',
    },
    {
      name: 'Compression Micro-Range',
      description: 'Mean-reversion scalps during low-volatility compression',
      icon: <Shrink className="h-4 w-4" />,
      status: riskParams?.compression_module_enabled ? 'active' : 'inactive',
      category: 'engine',
      regime: 'RANGE_COMPRESSION',
      sizing: '0.35x base',
    },
    // === SUB-STRATEGIES ===
    {
      name: 'Mean Reversion Probes',
      description: 'Counter-trend entries at validated exhaustion points',
      icon: <ArrowLeftRight className="h-4 w-4" />,
      status: riskParams?.is_trading_enabled ? 'active' : 'inactive',
      category: 'sub-strategy',
      regime: 'TREND_EXHAUSTION',
      sizing: '0.25x',
    },
    {
      name: 'Strong Trend Tier 0 Override',
      description: 'Entries into extreme StochRSI during ADX ≥ 40 trends',
      icon: <Zap className="h-4 w-4" />,
      status: riskParams?.is_trading_enabled ? 'active' : 'inactive',
      category: 'sub-strategy',
      regime: 'TREND_EXPANSION (extreme)',
      sizing: '0.25x mandatory',
    },
    {
      name: 'Trend Continuation Pullback',
      description: 'Re-entry after EMA20/50 pullback in established trends',
      icon: <GitBranch className="h-4 w-4" />,
      status: riskParams?.is_trading_enabled ? 'active' : 'inactive',
      category: 'sub-strategy',
      regime: 'TREND_EXPANSION',
      sizing: '0.50x',
    },
    // === RISK MODULES ===
    {
      name: 'Trailing Stop',
      description: 'Dynamic profit protection via trailing stop-loss',
      icon: <Activity className="h-4 w-4" />,
      status: (riskParams as any)?.trailing_stop_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Break-Even Lock',
      description: 'Move stop-loss to entry after activation threshold',
      icon: <Lock className="h-4 w-4" />,
      status: (riskParams as any)?.break_even_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Drawdown Circuit Breaker',
      description: 'Emergency halt on portfolio drawdown',
      icon: <AlertTriangle className="h-4 w-4" />,
      status: riskParams?.drawdown_circuit_breaker_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Dynamic Stop Tightening',
      description: 'Time-based stop-loss tightening',
      icon: <Timer className="h-4 w-4" />,
      status: riskParams?.dynamic_stop_tightening_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Partial Loss Taking',
      description: 'Close portion of position at loss threshold',
      icon: <Scissors className="h-4 w-4" />,
      status: riskParams?.partial_loss_taking_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Momentum Exit Guard',
      description: 'Exit positions on momentum decay',
      icon: <Gauge className="h-4 w-4" />,
      status: (riskParams as any)?.momentum_exit_guard_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Early Profit Lock',
      description: 'Lock profit at early threshold',
      icon: <HeartPulse className="h-4 w-4" />,
      status: (riskParams as any)?.early_profit_lock_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    {
      name: 'Loss Recovery Mode',
      description: 'Adjusted sizing after consecutive losses',
      icon: <Shield className="h-4 w-4" />,
      status: riskParams?.loss_recovery_mode_enabled ? 'active' : 'inactive',
      category: 'risk',
    },
    // === EXECUTION & MONITORING ===
    {
      name: 'Shadow Mode',
      description: 'Log hypothetical signals without executing',
      icon: <Eye className="h-4 w-4" />,
      status: (riskParams as any)?.shadow_mode_enabled ? 'active' : 'inactive',
      category: 'execution',
    },
    {
      name: 'AI Rejection Analyzer',
      description: 'Validate rejection correctness via AI',
      icon: <Bot className="h-4 w-4" />,
      status: riskParams?.ai_analysis_enabled ? 'active' : 'inactive',
      category: 'execution',
    },
    {
      name: 'Regime Persistence Engine',
      description: 'State machine hysteresis for regime stability',
      icon: <Waves className="h-4 w-4" />,
      status: 'always-on',
      category: 'execution',
    },
    {
      name: 'Order Flow Analysis',
      description: 'Bid/ask imbalance and directional flow scoring',
      icon: <BarChart3 className="h-4 w-4" />,
      status: 'always-on',
      category: 'execution',
    },
    {
      name: 'Regime Age Decay',
      description: 'Graduated fatigue factor for aging regimes (20–60 candles)',
      icon: <Timer className="h-4 w-4" />,
      status: 'always-on',
      category: 'execution',
    },
    {
      name: 'Transition Buffer Scoring',
      description: 'Continuous confidence scoring (0–100) for regime transitions',
      icon: <Activity className="h-4 w-4" />,
      status: 'always-on',
      category: 'execution',
    },
  ];

  const categories = [
    { key: 'engine', label: 'Trading Engines', color: 'text-chart-1' },
    { key: 'sub-strategy', label: 'Sub-Strategies', color: 'text-chart-2' },
    { key: 'risk', label: 'Risk Management', color: 'text-chart-3' },
    { key: 'execution', label: 'Execution & Monitoring', color: 'text-chart-4' },
  ];

  const getStatusBadge = (status: ModuleItem['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-primary/20 text-primary border-primary/30 text-xs">Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">Off</Badge>;
      case 'always-on':
        return <Badge variant="outline" className="border-primary/40 text-primary text-xs">Always On</Badge>;
    }
  };

  const activeCount = modules.filter(m => m.status === 'active' || m.status === 'always-on').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-5 w-5 text-primary" />
            Module Inventory
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {activeCount}/{modules.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map(cat => {
          const catModules = modules.filter(m => m.category === cat.key);
          if (catModules.length === 0) return null;

          return (
            <div key={cat.key}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider ${cat.color} mb-2`}>
                {cat.label}
              </h4>
              <div className="space-y-1.5">
                {catModules.map(mod => (
                  <div
                    key={mod.name}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-card hover:bg-accent/50 transition-colors border border-border/50"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-muted-foreground flex-shrink-0">{mod.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{mod.name}</p>
                        {mod.regime && (
                          <p className="text-xs text-muted-foreground truncate">
                            {mod.regime}{mod.sizing ? ` · ${mod.sizing}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(mod.status)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ModuleInventoryDashboard;
