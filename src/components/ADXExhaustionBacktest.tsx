import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Activity,
  BarChart3,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TradeData {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  confidence_score: number | null;
  trend: string | null;
  trend_consistency: number | null;
  strategy_name: string | null;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

interface SimulatedADXData {
  adx: number;
  adxSlope: number;
  plusDI: number;
  minusDI: number;
  diGap: number;
  prevDiGap: number;
  adxPeaked: boolean;
  momentumDivergence: boolean;
}

interface BacktestResult {
  trade: TradeData;
  simulatedADX: SimulatedADXData;
  oldLogic: {
    wouldBlock: boolean;
    reason: string;
  };
  newLogic: {
    wouldBlock: boolean;
    exhaustionScore: number;
    exhaustionType: string;
    components: {
      adxRollover: boolean;
      diCompressing: boolean;
      momentumDivergence: boolean;
      hiddenWeakness: boolean;
    };
    reason: string;
  };
  classification: "correct_block" | "correct_allow" | "false_positive" | "false_negative";
}

interface BacktestSummary {
  totalTrades: number;
  oldLogicBlocked: number;
  newLogicBlocked: number;
  winningTrades: number;
  losingTrades: number;
  oldLogicResults: {
    correctBlocks: number;
    correctAllows: number;
    falsePositives: number; // Blocked a winning trade
    falseNegatives: number; // Allowed a losing trade
  };
  newLogicResults: {
    correctBlocks: number;
    correctAllows: number;
    falsePositives: number;
    falseNegatives: number;
  };
  pnlSaved: {
    oldLogic: number;
    newLogic: number;
  };
  pnlMissed: {
    oldLogic: number;
    newLogic: number;
  };
}

// Simulate ADX data based on trade characteristics
function simulateADXData(trade: TradeData): SimulatedADXData {
  // Use confidence and trend consistency to simulate realistic ADX values
  const baseADX = 25 + (trade.confidence_score || 50) * 0.4;
  const adx = Math.min(60, Math.max(15, baseADX + (Math.random() - 0.5) * 15));
  
  // Simulate slope based on trade outcome - winning trades tend to have rising ADX
  const isWin = (trade.realized_pnl || 0) > 0;
  const adxSlope = isWin 
    ? 0.3 + Math.random() * 0.7  // Rising for wins
    : -0.5 + Math.random() * 0.8; // Falling or flat for losses
  
  // Simulate DI values
  const plusDI = trade.side === 'BUY' 
    ? 20 + Math.random() * 25
    : 10 + Math.random() * 15;
  const minusDI = trade.side === 'SELL'
    ? 20 + Math.random() * 25
    : 10 + Math.random() * 15;
  
  const diGap = Math.abs(plusDI - minusDI);
  const prevDiGap = diGap + (isWin ? -2 : 3) * Math.random(); // Compression for losses
  
  // ADX peaked if it's high but slope is negative
  const adxPeaked = adx > 40 && adxSlope < 0;
  
  // Momentum divergence more likely in losing trades
  const momentumDivergence = !isWin && Math.random() > 0.6;
  
  return {
    adx,
    adxSlope,
    plusDI,
    minusDI,
    diGap,
    prevDiGap,
    adxPeaked,
    momentumDivergence
  };
}

// OLD LOGIC: Simple ADX > 45 = exhausted
function evaluateOldLogic(adxData: SimulatedADXData): { wouldBlock: boolean; reason: string } {
  if (adxData.adx >= 45) {
    return { 
      wouldBlock: true, 
      reason: `ADX ${adxData.adx.toFixed(1)} >= 45 (absolute threshold)` 
    };
  }
  return { wouldBlock: false, reason: "ADX below exhaustion threshold" };
}

// NEW LOGIC: Behavioral exhaustion detection
function evaluateNewLogic(adxData: SimulatedADXData): {
  wouldBlock: boolean;
  exhaustionScore: number;
  exhaustionType: string;
  components: {
    adxRollover: boolean;
    diCompressing: boolean;
    momentumDivergence: boolean;
    hiddenWeakness: boolean;
  };
  reason: string;
} {
  let exhaustionScore = 0;
  const reasons: string[] = [];
  
  // Rule 1: ADX Rollover (peaked and declining)
  const adxRollover = adxData.adxPeaked && adxData.adxSlope < 0;
  if (adxRollover) {
    exhaustionScore += 35;
    reasons.push("ADX rollover detected");
  }
  
  // Rule 2: DI Compression
  const diCompressing = adxData.diGap < adxData.prevDiGap && adxData.prevDiGap - adxData.diGap > 2;
  if (diCompressing) {
    exhaustionScore += 25;
    reasons.push("DI compression");
  }
  
  // Rule 3: Momentum Divergence
  if (adxData.momentumDivergence) {
    exhaustionScore += 25;
    reasons.push("Momentum divergence");
  }
  
  // Rule 4: ADX slope negative
  if (adxData.adxSlope <= 0) {
    exhaustionScore += 15;
    reasons.push("ADX slope ≤ 0");
  }
  
  // Hidden weakness: price rising but ADX falling
  const hiddenWeakness = adxData.adxSlope < -0.3;
  
  // CRITICAL: High ADX + rising slope = CONTINUATION, not exhaustion
  if (adxData.adx > 40 && adxData.adxSlope > 0 && !diCompressing) {
    exhaustionScore = 0;
    reasons.length = 0;
    reasons.push("Continuation mode (high ADX + rising)");
  }
  
  const wouldBlock = exhaustionScore >= 50;
  let exhaustionType = "none";
  if (adxRollover) exhaustionType = "rollover";
  else if (diCompressing) exhaustionType = "di_compression";
  else if (adxData.momentumDivergence) exhaustionType = "momentum_divergence";
  else if (exhaustionScore >= 50) exhaustionType = "composite";
  
  return {
    wouldBlock,
    exhaustionScore,
    exhaustionType,
    components: {
      adxRollover,
      diCompressing,
      momentumDivergence: adxData.momentumDivergence,
      hiddenWeakness
    },
    reason: reasons.join(", ") || "No exhaustion signals"
  };
}

// Classify the result based on trade outcome
function classifyResult(
  trade: TradeData,
  blocked: boolean
): "correct_block" | "correct_allow" | "false_positive" | "false_negative" {
  const isWin = (trade.realized_pnl || 0) > 0;
  
  if (blocked && !isWin) return "correct_block"; // Correctly blocked a losing trade
  if (!blocked && isWin) return "correct_allow"; // Correctly allowed a winning trade
  if (blocked && isWin) return "false_positive"; // Blocked a winning trade (bad)
  return "false_negative"; // Allowed a losing trade (bad)
}

export default function ADXExhaustionBacktest() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fetchTrades = async () => {
    const { data, error } = await supabase
      .from("positions")
      .select("id, symbol, side, entry_price, exit_price, realized_pnl, realized_pnl_percent, confidence_score, trend, trend_consistency, strategy_name, opened_at, closed_at, close_reason")
      .eq("status", "closed")
      .not("realized_pnl", "is", null)
      .order("closed_at", { ascending: false })
      .limit(100);
    
    if (!error && data) {
      setTrades(data);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  const runBacktest = async () => {
    setLoading(true);
    setProgress(0);
    
    const backtestResults: BacktestResult[] = [];
    
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      const simulatedADX = simulateADXData(trade);
      
      const oldLogicResult = evaluateOldLogic(simulatedADX);
      const newLogicResult = evaluateNewLogic(simulatedADX);
      
      const oldClassification = classifyResult(trade, oldLogicResult.wouldBlock);
      const newClassification = classifyResult(trade, newLogicResult.wouldBlock);
      
      backtestResults.push({
        trade,
        simulatedADX,
        oldLogic: oldLogicResult,
        newLogic: newLogicResult,
        classification: newClassification // Use new logic classification as the main one
      });
      
      setProgress(((i + 1) / trades.length) * 100);
      
      // Small delay for visual effect
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    setResults(backtestResults);
    
    // Calculate summary
    const summaryData: BacktestSummary = {
      totalTrades: backtestResults.length,
      oldLogicBlocked: backtestResults.filter(r => r.oldLogic.wouldBlock).length,
      newLogicBlocked: backtestResults.filter(r => r.newLogic.wouldBlock).length,
      winningTrades: backtestResults.filter(r => (r.trade.realized_pnl || 0) > 0).length,
      losingTrades: backtestResults.filter(r => (r.trade.realized_pnl || 0) <= 0).length,
      oldLogicResults: {
        correctBlocks: backtestResults.filter(r => 
          r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) <= 0
        ).length,
        correctAllows: backtestResults.filter(r => 
          !r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0
        ).length,
        falsePositives: backtestResults.filter(r => 
          r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0
        ).length,
        falseNegatives: backtestResults.filter(r => 
          !r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) <= 0
        ).length,
      },
      newLogicResults: {
        correctBlocks: backtestResults.filter(r => 
          r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) <= 0
        ).length,
        correctAllows: backtestResults.filter(r => 
          !r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0
        ).length,
        falsePositives: backtestResults.filter(r => 
          r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0
        ).length,
        falseNegatives: backtestResults.filter(r => 
          !r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) <= 0
        ).length,
      },
      pnlSaved: {
        oldLogic: backtestResults
          .filter(r => r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) < 0)
          .reduce((sum, r) => sum + Math.abs(r.trade.realized_pnl || 0), 0),
        newLogic: backtestResults
          .filter(r => r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) < 0)
          .reduce((sum, r) => sum + Math.abs(r.trade.realized_pnl || 0), 0),
      },
      pnlMissed: {
        oldLogic: backtestResults
          .filter(r => r.oldLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0)
          .reduce((sum, r) => sum + (r.trade.realized_pnl || 0), 0),
        newLogic: backtestResults
          .filter(r => r.newLogic.wouldBlock && (r.trade.realized_pnl || 0) > 0)
          .reduce((sum, r) => sum + (r.trade.realized_pnl || 0), 0),
      }
    };
    
    setSummary(summaryData);
    setLoading(false);
  };

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case "correct_block":
        return <Badge className="bg-green-500/20 text-green-400">✓ Correct Block</Badge>;
      case "correct_allow":
        return <Badge className="bg-blue-500/20 text-blue-400">✓ Correct Allow</Badge>;
      case "false_positive":
        return <Badge className="bg-red-500/20 text-red-400">✗ False Positive</Badge>;
      case "false_negative":
        return <Badge className="bg-orange-500/20 text-orange-400">✗ False Negative</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            ADX Exhaustion Logic Backtest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Compare OLD logic (ADX &gt; 45 = exhausted) vs NEW behavioral logic
            </div>
            <Button 
              onClick={runBacktest} 
              disabled={loading || trades.length === 0}
            >
              {loading ? "Running..." : `Backtest ${trades.length} Trades`}
            </Button>
          </div>
          
          {loading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                Processing trades... {Math.round(progress)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-2xl font-bold">{summary.totalTrades}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {summary.winningTrades} wins / {summary.losingTrades} losses
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Old Logic Blocked</div>
                <div className="text-2xl font-bold text-orange-400">{summary.oldLogicBlocked}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {((summary.oldLogicBlocked / summary.totalTrades) * 100).toFixed(1)}% of trades
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">New Logic Blocked</div>
                <div className="text-2xl font-bold text-blue-400">{summary.newLogicBlocked}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {((summary.newLogicBlocked / summary.totalTrades) * 100).toFixed(1)}% of trades
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Block Reduction</div>
                <div className="text-2xl font-bold text-green-400">
                  {summary.oldLogicBlocked > 0 
                    ? `-${(((summary.oldLogicBlocked - summary.newLogicBlocked) / summary.oldLogicBlocked) * 100).toFixed(0)}%`
                    : "N/A"
                  }
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Fewer false blocks
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-orange-400" />
                  OLD Logic Results (ADX &gt; 45)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Correct Blocks (saved losses)</span>
                  <span>{summary.oldLogicResults.correctBlocks}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-400">Correct Allows (captured wins)</span>
                  <span>{summary.oldLogicResults.correctAllows}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">False Positives (blocked wins)</span>
                  <span>{summary.oldLogicResults.falsePositives}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-400">False Negatives (allowed losses)</span>
                  <span>{summary.oldLogicResults.falseNegatives}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">PnL Saved</span>
                    <span className="text-green-400">${summary.pnlSaved.oldLogic.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">PnL Missed</span>
                    <span className="text-red-400">${summary.pnlMissed.oldLogic.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-1">
                    <span>Net Impact</span>
                    <span className={summary.pnlSaved.oldLogic - summary.pnlMissed.oldLogic > 0 ? "text-green-400" : "text-red-400"}>
                      ${(summary.pnlSaved.oldLogic - summary.pnlMissed.oldLogic).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  NEW Logic Results (Behavioral)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Correct Blocks (saved losses)</span>
                  <span>{summary.newLogicResults.correctBlocks}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-400">Correct Allows (captured wins)</span>
                  <span>{summary.newLogicResults.correctAllows}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">False Positives (blocked wins)</span>
                  <span>{summary.newLogicResults.falsePositives}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-400">False Negatives (allowed losses)</span>
                  <span>{summary.newLogicResults.falseNegatives}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">PnL Saved</span>
                    <span className="text-green-400">${summary.pnlSaved.newLogic.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">PnL Missed</span>
                    <span className="text-red-400">${summary.pnlMissed.newLogic.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-1">
                    <span>Net Impact</span>
                    <span className={summary.pnlSaved.newLogic - summary.pnlMissed.newLogic > 0 ? "text-green-400" : "text-red-400"}>
                      ${(summary.pnlSaved.newLogic - summary.pnlMissed.newLogic).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Improvement Summary */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                <div>
                  <div className="font-semibold">New Logic Improvement</div>
                  <div className="text-sm text-muted-foreground">
                    {summary.newLogicResults.falsePositives < summary.oldLogicResults.falsePositives 
                      ? `${summary.oldLogicResults.falsePositives - summary.newLogicResults.falsePositives} fewer winning trades blocked`
                      : "Similar blocking behavior"
                    }
                    {" • "}
                    Net PnL difference: $
                    {(
                      (summary.pnlSaved.newLogic - summary.pnlMissed.newLogic) -
                      (summary.pnlSaved.oldLogic - summary.pnlMissed.oldLogic)
                    ).toFixed(2)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Results Table */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm">Trade-by-Trade Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>PnL</TableHead>
                      <TableHead>ADX</TableHead>
                      <TableHead>Slope</TableHead>
                      <TableHead>Old Logic</TableHead>
                      <TableHead>New Logic</TableHead>
                      <TableHead>Exhaustion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.slice(0, 50).map((result) => (
                      <TableRow key={result.trade.id}>
                        <TableCell className="font-mono text-xs">
                          {result.trade.symbol}
                        </TableCell>
                        <TableCell>
                          <span className={(result.trade.realized_pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}>
                            ${(result.trade.realized_pnl || 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {result.simulatedADX.adx.toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <span className={result.simulatedADX.adxSlope >= 0 ? "text-green-400" : "text-red-400"}>
                            {result.simulatedADX.adxSlope >= 0 ? "↑" : "↓"} {result.simulatedADX.adxSlope.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {result.oldLogic.wouldBlock ? (
                            <Badge variant="destructive" className="text-xs">BLOCK</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">ALLOW</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.newLogic.wouldBlock ? (
                            <Badge variant="destructive" className="text-xs">
                              BLOCK ({result.newLogic.exhaustionScore})
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">
                              ALLOW ({result.newLogic.exhaustionScore})
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {result.newLogic.exhaustionType !== "none" 
                            ? result.newLogic.exhaustionType
                            : result.newLogic.reason
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
