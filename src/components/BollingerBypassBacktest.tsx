import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  Target,
  Layers,
  Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TradeResult {
  entryTime: string;
  exitTime: string;
  type: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  percentB: number;
  adx: number;
  adxSlope: number;
  diGap: number;
  tier: number;
  positionSize: number;
  pnlPercent: number;
  pnlAdjusted: number;
  exitReason: string;
  priceActionConfirmed: boolean;
  priceActionDetails: {
    shallowPullback: boolean;
    structureIntact: boolean;
    consolidationBreakout: boolean;
    noWickRejection: boolean;
  };
}

interface BacktestSummary {
  symbol: string;
  totalCandlesAnalyzed: number;
  bypassOpportunities: { long: number; short: number };
  tradesExecuted: { long: number; short: number };
  tierBreakdown: {
    tier1: { attempts: number; wins: number; totalPnl: number };
    tier2: { attempts: number; wins: number; totalPnl: number };
    tier3: { attempts: number; wins: number; totalPnl: number };
  };
  priceActionStats: {
    withConfirmation: { trades: number; wins: number; avgPnl: number };
    withoutConfirmation: { trades: number; wins: number; avgPnl: number };
  };
  overallMetrics: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    netPnl: number;
    netPnlAdjusted: number;
  };
}

export default function BollingerBypassBacktest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [trades, setTrades] = useState<TradeResult[]>([]);
  const [formData, setFormData] = useState({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    requirePriceAction: true
  });

  const runBacktest = async () => {
    setLoading(true);
    setProgress(20);
    setSummary(null);
    setTrades([]);

    try {
      setProgress(40);
      const { data, error } = await supabase.functions.invoke('backtest-bollinger-bypass', {
        body: formData
      });

      setProgress(80);
      
      if (error) throw error;
      
      setSummary(data.summary);
      setTrades(data.trades || []);
      setProgress(100);
      
      toast({
        title: "Backtest Complete",
        description: `Analyzed ${data.summary.totalCandlesAnalyzed} candles, ${data.summary.overallMetrics.totalTrades} trades executed`
      });
    } catch (err: any) {
      toast({
        title: "Backtest Failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier: number) => {
    switch (tier) {
      case 1: return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">Tier 1</Badge>;
      case 2: return <Badge variant="outline" className="bg-blue-500/20 text-blue-400">Tier 2</Badge>;
      case 3: return <Badge variant="outline" className="bg-purple-500/20 text-purple-400">Tier 3</Badge>;
      default: return <Badge variant="outline">N/A</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Bollinger Tiered Bypass Backtest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Validates entries at extreme %B (90-97 LONG, 3-10 SHORT) with tiered ADX/DI requirements
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Symbol</Label>
              <Input 
                value={formData.symbol} 
                onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))}
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input 
                type="date" 
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input 
                type="date" 
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="priceAction"
                  checked={formData.requirePriceAction}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requirePriceAction: checked }))}
                />
                <Label htmlFor="priceAction" className="text-sm">Require Price Action</Label>
              </div>
            </div>
          </div>

          <Button onClick={runBacktest} disabled={loading} className="w-full">
            {loading ? "Running Backtest..." : "Run Bollinger Bypass Backtest"}
          </Button>
          
          {loading && <Progress value={progress} />}
        </CardContent>
      </Card>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Total Trades
                </div>
                <div className="text-2xl font-bold">{summary.overallMetrics.totalTrades}</div>
                <div className="text-xs text-muted-foreground">
                  {summary.tradesExecuted.long} long / {summary.tradesExecuted.short} short
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-4 w-4" />
                  Win Rate
                </div>
                <div className={`text-2xl font-bold ${summary.overallMetrics.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.overallMetrics.winRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  PF: {summary.overallMetrics.profitFactor.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Net PnL (Raw)
                </div>
                <div className={`text-2xl font-bold ${summary.overallMetrics.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.overallMetrics.netPnl >= 0 ? '+' : ''}{summary.overallMetrics.netPnl.toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  Net PnL (Adjusted)
                </div>
                <div className={`text-2xl font-bold ${summary.overallMetrics.netPnlAdjusted >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.overallMetrics.netPnlAdjusted >= 0 ? '+' : ''}{summary.overallMetrics.netPnlAdjusted.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">Position size adjusted</div>
              </CardContent>
            </Card>
          </div>

          {/* Tier Breakdown */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tier Performance Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: 'Tier 1', data: summary.tierBreakdown.tier1, color: 'yellow', desc: 'ADX 25+, 40% size' },
                  { name: 'Tier 2', data: summary.tierBreakdown.tier2, color: 'blue', desc: 'ADX 35+, 50% size' },
                  { name: 'Tier 3', data: summary.tierBreakdown.tier3, color: 'purple', desc: 'ADX 40+, 60% size' }
                ].map(tier => (
                  <div key={tier.name} className={`p-4 rounded-lg bg-${tier.color}-500/10 border border-${tier.color}-500/30`}>
                    <div className={`text-${tier.color}-400 font-medium`}>{tier.name}</div>
                    <div className="text-xs text-muted-foreground mb-2">{tier.desc}</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Trades:</span>
                        <span className="font-mono">{tier.data.attempts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Win Rate:</span>
                        <span className={`font-mono ${tier.data.attempts > 0 && (tier.data.wins / tier.data.attempts) >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                          {tier.data.attempts > 0 ? ((tier.data.wins / tier.data.attempts) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Net PnL:</span>
                        <span className={`font-mono ${tier.data.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {tier.data.totalPnl >= 0 ? '+' : ''}{tier.data.totalPnl.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Price Action Comparison */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Price Action Confirmation Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="text-green-400 font-medium">With Confirmation</div>
                  <div className="space-y-1 text-sm mt-2">
                    <div className="flex justify-between">
                      <span>Trades:</span>
                      <span className="font-mono">{summary.priceActionStats.withConfirmation.trades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Win Rate:</span>
                      <span className="font-mono">
                        {summary.priceActionStats.withConfirmation.trades > 0 
                          ? ((summary.priceActionStats.withConfirmation.wins / summary.priceActionStats.withConfirmation.trades) * 100).toFixed(0) 
                          : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg PnL:</span>
                      <span className={`font-mono ${summary.priceActionStats.withConfirmation.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {summary.priceActionStats.withConfirmation.avgPnl >= 0 ? '+' : ''}{summary.priceActionStats.withConfirmation.avgPnl.toFixed(3)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="text-orange-400 font-medium">Without Confirmation</div>
                  <div className="space-y-1 text-sm mt-2">
                    <div className="flex justify-between">
                      <span>Trades:</span>
                      <span className="font-mono">{summary.priceActionStats.withoutConfirmation.trades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Win Rate:</span>
                      <span className="font-mono">
                        {summary.priceActionStats.withoutConfirmation.trades > 0 
                          ? ((summary.priceActionStats.withoutConfirmation.wins / summary.priceActionStats.withoutConfirmation.trades) * 100).toFixed(0) 
                          : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg PnL:</span>
                      <span className={`font-mono ${summary.priceActionStats.withoutConfirmation.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {summary.priceActionStats.withoutConfirmation.avgPnl >= 0 ? '+' : ''}{summary.priceActionStats.withoutConfirmation.avgPnl.toFixed(3)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade Details */}
          {trades.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trade Details (Last 20)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>%B</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>ADX</TableHead>
                        <TableHead>DI Gap</TableHead>
                        <TableHead>PA Conf</TableHead>
                        <TableHead>Exit</TableHead>
                        <TableHead className="text-right">PnL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.slice(-20).reverse().map((trade, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs font-mono">
                            {new Date(trade.entryTime).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {trade.type === 'long' 
                              ? <Badge className="bg-green-500/20 text-green-400">LONG</Badge>
                              : <Badge className="bg-red-500/20 text-red-400">SHORT</Badge>
                            }
                          </TableCell>
                          <TableCell className="font-mono">{trade.percentB.toFixed(1)}</TableCell>
                          <TableCell>{getTierBadge(trade.tier)}</TableCell>
                          <TableCell className="font-mono">{trade.adx.toFixed(1)}</TableCell>
                          <TableCell className="font-mono">{trade.diGap.toFixed(1)}</TableCell>
                          <TableCell>
                            {trade.priceActionConfirmed 
                              ? <Badge className="bg-green-500/20 text-green-400">✓</Badge>
                              : <Badge variant="outline">✗</Badge>
                            }
                          </TableCell>
                          <TableCell className="text-xs">{trade.exitReason}</TableCell>
                          <TableCell className={`text-right font-mono ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
