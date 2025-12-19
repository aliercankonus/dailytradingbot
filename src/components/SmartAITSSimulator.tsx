import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Clock, Shield, AlertTriangle, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

export const SmartAITSSimulator = () => {
  // Simulation inputs
  const [peakPnl, setPeakPnl] = useState(2.5);
  const [currentPnl, setCurrentPnl] = useState(1.8);
  const [minutesSincePeak, setMinutesSincePeak] = useState(45);
  const [aggressiveness, setAggressiveness] = useState(3);
  const [baseLockPercent, setBaseLockPercent] = useState(50);
  
  // Feature toggles
  const [progressiveLockEnabled, setProgressiveLockEnabled] = useState(true);
  const [stalePeakEnabled, setStalePeakEnabled] = useState(true);
  const [decayVelocityEnabled, setDecayVelocityEnabled] = useState(true);

  // Smart AITS: Progressive lock tiers
  const getProgressiveLockPercent = (peak: number, agg: number): number => {
    const baseLock = 0.30 + (agg * 0.05);
    let tierBonus = 0;
    if (peak >= 5) tierBonus = 0.30;
    else if (peak >= 3) tierBonus = 0.20;
    else if (peak >= 2) tierBonus = 0.15;
    else if (peak >= 1) tierBonus = 0.10;
    return Math.min(0.85, baseLock + tierBonus);
  };

  // Smart AITS: Stale peak bonus
  const getStalePeakBonus = (mins: number): number => {
    if (!stalePeakEnabled) return 0;
    if (mins > 120) return 0.25;
    if (mins > 60) return 0.20;
    if (mins > 30) return 0.10;
    if (mins > 15) return 0.05;
    return 0;
  };

  // Get tier info
  const getTierInfo = (peak: number): { label: string; color: string } => {
    if (peak >= 5) return { label: "Tier 5 (5%+)", color: "text-green-500 bg-green-500/10" };
    if (peak >= 3) return { label: "Tier 4 (3-5%)", color: "text-emerald-500 bg-emerald-500/10" };
    if (peak >= 2) return { label: "Tier 3 (2-3%)", color: "text-blue-500 bg-blue-500/10" };
    if (peak >= 1) return { label: "Tier 2 (1-2%)", color: "text-cyan-500 bg-cyan-500/10" };
    return { label: "Tier 1 (0-1%)", color: "text-slate-500 bg-slate-500/10" };
  };

  // Calculate simulation results
  const simulation = useMemo(() => {
    const decayPercent = peakPnl - currentPnl;
    const decayVelocity = minutesSincePeak > 0 ? decayPercent / minutesSincePeak : 0;
    
    // Base lock from user settings
    let effectiveLock = baseLockPercent / 100;
    let lockSource = "Base Setting";
    
    // Progressive lock
    const progressiveLock = progressiveLockEnabled ? getProgressiveLockPercent(peakPnl, aggressiveness) : 0;
    
    // Stale peak bonus
    const stalePeakBonus = getStalePeakBonus(minutesSincePeak);
    
    // Decay velocity override
    let decayOverride = 0;
    let decayAction = "Normal";
    if (decayVelocityEnabled && minutesSincePeak > 0) {
      if (decayVelocity > 0.03) {
        decayAction = "EMERGENCY EXIT";
        decayOverride = 1.0; // Would exit
      } else if (decayVelocity > 0.02) {
        decayAction = "High Decay Lock";
        decayOverride = 0.80;
      }
    }
    
    // Calculate final lock
    const adaptiveLock = Math.max(progressiveLock + stalePeakBonus, decayOverride);
    
    if (adaptiveLock > effectiveLock) {
      effectiveLock = Math.min(0.85, adaptiveLock);
      if (decayOverride === 0.80) {
        lockSource = "Decay Velocity Override (80%)";
      } else if (stalePeakBonus > 0) {
        lockSource = `Progressive (${(progressiveLock * 100).toFixed(0)}%) + Stale Peak (+${(stalePeakBonus * 100).toFixed(0)}%)`;
      } else {
        lockSource = `Progressive Tier`;
      }
    }
    
    // Calculate locked profit
    const lockedProfitPercent = peakPnl * effectiveLock;
    const giveback = peakPnl - lockedProfitPercent;
    const retentionRate = (lockedProfitPercent / peakPnl) * 100;
    
    // Compare to old system (fixed 50% lock)
    const oldSystemLock = peakPnl * 0.5;
    const improvement = lockedProfitPercent - oldSystemLock;
    
    return {
      effectiveLock: effectiveLock * 100,
      lockSource,
      progressiveLock: progressiveLock * 100,
      stalePeakBonus: stalePeakBonus * 100,
      decayVelocity: decayVelocity * 100,
      decayAction,
      lockedProfitPercent,
      giveback,
      retentionRate,
      oldSystemLock,
      improvement,
      tierInfo: getTierInfo(peakPnl),
    };
  }, [peakPnl, currentPnl, minutesSincePeak, aggressiveness, baseLockPercent, progressiveLockEnabled, stalePeakEnabled, decayVelocityEnabled]);

  // Scenario comparison table
  const scenarios = useMemo(() => {
    const testCases = [
      { peak: 0.5, current: 0.3, mins: 10, desc: "Small profit, fresh" },
      { peak: 1.5, current: 1.2, mins: 20, desc: "Moderate profit, recent" },
      { peak: 2.5, current: 2.0, mins: 45, desc: "Good profit, stale peak" },
      { peak: 3.5, current: 2.5, mins: 90, desc: "Strong profit, very stale" },
      { peak: 5.0, current: 4.0, mins: 30, desc: "Excellent profit, normal" },
      { peak: 2.0, current: 0.5, mins: 30, desc: "Heavy decay (5%/min)" },
      { peak: 3.0, current: 1.5, mins: 20, desc: "Fast decay (7.5%/min)" },
    ];
    
    return testCases.map(tc => {
      const decay = tc.peak - tc.current;
      const velocity = tc.mins > 0 ? decay / tc.mins : 0;
      
      // Calculate Smart AITS lock
      const progressive = progressiveLockEnabled ? getProgressiveLockPercent(tc.peak, aggressiveness) : 0;
      const stale = getStalePeakBonus(tc.mins);
      let decayOverride = 0;
      let action = "";
      if (decayVelocityEnabled && velocity > 0.03) {
        action = "EXIT";
        decayOverride = 1.0;
      } else if (decayVelocityEnabled && velocity > 0.02) {
        action = "80%";
        decayOverride = 0.80;
      }
      
      const smartLock = Math.min(0.85, Math.max(progressive + stale, decayOverride, baseLockPercent / 100));
      const oldLock = 0.50;
      
      const smartLocked = tc.peak * smartLock;
      const oldLocked = tc.peak * oldLock;
      const diff = smartLocked - oldLocked;
      
      return {
        ...tc,
        velocity: velocity * 100,
        action,
        smartLock: smartLock * 100,
        oldLock: oldLock * 100,
        smartLocked,
        oldLocked,
        diff,
        tier: getTierInfo(tc.peak).label.split(" ")[0] + " " + getTierInfo(tc.peak).label.split(" ")[1],
      };
    });
  }, [aggressiveness, baseLockPercent, progressiveLockEnabled, stalePeakEnabled, decayVelocityEnabled]);

  const aggressivenessLabels = ["Very Conservative", "Conservative", "Balanced", "Aggressive", "Very Aggressive"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Smart AITS Simulator
        </CardTitle>
        <CardDescription>
          Test and visualize how the Smart Adaptive Intelligent Trailing System calculates lock percentages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feature Toggles */}
        <div className="flex flex-wrap gap-4 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Switch checked={progressiveLockEnabled} onCheckedChange={setProgressiveLockEnabled} />
            <Label className="text-sm">Progressive Tiers</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={stalePeakEnabled} onCheckedChange={setStalePeakEnabled} />
            <Label className="text-sm">Stale Peak</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={decayVelocityEnabled} onCheckedChange={setDecayVelocityEnabled} />
            <Label className="text-sm">Decay Velocity</Label>
          </div>
        </div>

        {/* Input Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium">Simulation Inputs</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Peak P&L</Label>
                <span className="font-mono text-primary">{peakPnl.toFixed(1)}%</span>
              </div>
              <Slider value={[peakPnl]} onValueChange={(v) => setPeakPnl(v[0])} min={0.1} max={10} step={0.1} />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Current P&L</Label>
                <span className="font-mono text-primary">{currentPnl.toFixed(1)}%</span>
              </div>
              <Slider value={[currentPnl]} onValueChange={(v) => setCurrentPnl(Math.min(v[0], peakPnl))} min={-2} max={10} step={0.1} />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Minutes Since Peak</Label>
                <span className="font-mono text-primary">{minutesSincePeak} min</span>
              </div>
              <Slider value={[minutesSincePeak]} onValueChange={(v) => setMinutesSincePeak(v[0])} min={0} max={180} step={5} />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Aggressiveness</Label>
                <Badge variant="outline">{aggressivenessLabels[aggressiveness - 1]}</Badge>
              </div>
              <Slider value={[aggressiveness]} onValueChange={(v) => setAggressiveness(v[0])} min={1} max={5} step={1} />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Base Lock %</Label>
                <span className="font-mono">{baseLockPercent}%</span>
              </div>
              <Slider value={[baseLockPercent]} onValueChange={(v) => setBaseLockPercent(v[0])} min={20} max={70} step={5} />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h4 className="flex items-center gap-2 font-medium">
              <Zap className="h-4 w-4 text-primary" />
              Smart AITS Result
            </h4>
            
            {/* Tier Badge */}
            <div className="flex items-center gap-2">
              <Badge className={simulation.tierInfo.color}>{simulation.tierInfo.label}</Badge>
              {simulation.stalePeakBonus > 0 && (
                <Badge variant="outline" className="text-amber-500">
                  <Clock className="mr-1 h-3 w-3" />
                  Stale +{simulation.stalePeakBonus.toFixed(0)}%
                </Badge>
              )}
            </div>
            
            {/* Main Result */}
            <div className="rounded-lg bg-background p-3">
              <div className="mb-2 text-3xl font-bold text-primary">
                {simulation.effectiveLock.toFixed(0)}% Lock
              </div>
              <p className="text-sm text-muted-foreground">{simulation.lockSource}</p>
            </div>
            
            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-muted/50 p-2">
                <div className="text-muted-foreground">Progressive</div>
                <div className="font-medium">{simulation.progressiveLock.toFixed(0)}%</div>
              </div>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-muted-foreground">Stale Bonus</div>
                <div className="font-medium">+{simulation.stalePeakBonus.toFixed(0)}%</div>
              </div>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-muted-foreground">Decay Velocity</div>
                <div className={`font-medium ${simulation.decayAction !== "Normal" ? "text-red-500" : ""}`}>
                  {simulation.decayVelocity.toFixed(2)}%/min
                </div>
              </div>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-muted-foreground">Action</div>
                <div className={`font-medium ${simulation.decayAction === "EMERGENCY EXIT" ? "text-red-500" : simulation.decayAction === "High Decay Lock" ? "text-amber-500" : "text-green-500"}`}>
                  {simulation.decayAction}
                </div>
              </div>
            </div>
            
            {/* Comparison */}
            <div className="rounded-lg border p-3">
              <h5 className="mb-2 text-sm font-medium">vs Old System (50% fixed)</h5>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="text-muted-foreground">Old Locked</div>
                  <div className="font-medium text-red-500">{simulation.oldSystemLock.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Smart Locked</div>
                  <div className="font-medium text-green-500">{simulation.lockedProfitPercent.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Improvement</div>
                  <div className={`font-medium ${simulation.improvement > 0 ? "text-green-500" : "text-red-500"}`}>
                    {simulation.improvement > 0 ? "+" : ""}{simulation.improvement.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="mt-2 text-center text-xs text-muted-foreground">
                Retention: {simulation.retentionRate.toFixed(0)}% of peak (giveback: {simulation.giveback.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        {/* Scenario Comparison Table */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 font-medium">
            <TrendingUp className="h-4 w-4" />
            Scenario Comparison
          </h4>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead className="text-center">Peak</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center">Stale</TableHead>
                  <TableHead className="text-center">Decay</TableHead>
                  <TableHead className="text-center">Old Lock</TableHead>
                  <TableHead className="text-center">Smart Lock</TableHead>
                  <TableHead className="text-center">Locked Profit</TableHead>
                  <TableHead className="text-center">Improvement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((s, i) => (
                  <TableRow key={i} className={s.action === "EXIT" ? "bg-red-500/10" : ""}>
                    <TableCell className="text-sm">{s.desc}</TableCell>
                    <TableCell className="text-center font-mono">{s.peak.toFixed(1)}%</TableCell>
                    <TableCell className="text-center text-xs">{s.tier}</TableCell>
                    <TableCell className="text-center font-mono">{s.mins}m</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono ${s.velocity > 3 ? "text-red-500" : s.velocity > 2 ? "text-amber-500" : ""}`}>
                        {s.velocity.toFixed(1)}%/m
                      </span>
                      {s.action && <Badge variant="outline" className="ml-1 text-[10px]">{s.action}</Badge>}
                    </TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{s.oldLock.toFixed(0)}%</TableCell>
                    <TableCell className="text-center font-mono text-primary">{s.smartLock.toFixed(0)}%</TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-green-500">{s.smartLocked.toFixed(2)}%</span>
                      <span className="text-xs text-muted-foreground"> vs {s.oldLocked.toFixed(2)}%</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono ${s.diff > 0 ? "text-green-500" : "text-red-500"}`}>
                        {s.diff > 0 ? "+" : ""}{s.diff.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            * Decay velocity calculated as (Peak - Current) / Minutes. EXIT triggers at {">"}3%/min, 80% lock at {">"}2%/min
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              +{scenarios.reduce((sum, s) => sum + (s.action !== "EXIT" ? s.diff : 0), 0).toFixed(2)}%
            </div>
            <div className="text-sm text-muted-foreground">Total Improvement</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {(scenarios.filter(s => s.action !== "EXIT").reduce((sum, s) => sum + s.smartLock, 0) / scenarios.filter(s => s.action !== "EXIT").length).toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground">Avg Smart Lock</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-500">
              {scenarios.filter(s => s.action === "EXIT").length}
            </div>
            <div className="text-sm text-muted-foreground">Emergency Exits</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};