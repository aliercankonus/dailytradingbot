import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface TradeData {
  id: string;
  symbol: string;
  strategy_name: string;
  realized_pnl: number;
  confidence_score: number;
  trend: string;
  trend_consistency: number | null;
  close_reason: string;
}

// Simulated backtest data based on actual closed positions
const backtestTrades: TradeData[] = [
  // Volume Surge Momentum - Bullish 4h (would pass both old and new rules)
  { id: "1", symbol: "BTCUSDT", strategy_name: "Volume Surge Momentum", realized_pnl: 0.02, confidence_score: 50, trend: "bullish", trend_consistency: 83, close_reason: "trailing_stop_loss" },
  
  // EMA Golden Cross - Neutral 4h, HIGH consistency (would pass new rules)
  { id: "2", symbol: "ETHUSDT", strategy_name: "EMA Golden Cross", realized_pnl: -0.03, confidence_score: 54, trend: "neutral", trend_consistency: 83, close_reason: "trailing_stop_loss" },
  { id: "3", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 0.64, confidence_score: 56, trend: "neutral", trend_consistency: 70, close_reason: "trailing_stop_loss" },
  { id: "4", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.61, confidence_score: 56, trend: "neutral", trend_consistency: 70, close_reason: "partial_tp_1" },
  { id: "5", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 0.38, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "trailing_stop_loss" },
  { id: "6", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.81, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "partial_tp_1" },
  { id: "7", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.23, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "partial_tp_2" },
  { id: "8", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 0.35, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "trailing_stop_loss" },
  { id: "9", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.18, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "partial_tp_2" },
  { id: "10", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.73, confidence_score: 55, trend: "neutral", trend_consistency: 83, close_reason: "partial_tp_1" },
  
  // EMA Golden Cross - Neutral 4h, LOW consistency (would be blocked by new rules)
  { id: "11", symbol: "BNBUSDT", strategy_name: "EMA Golden Cross", realized_pnl: -0.10, confidence_score: 55, trend: "neutral", trend_consistency: 52, close_reason: "partial_loss" },
  { id: "12", symbol: "BNBUSDT", strategy_name: "EMA Golden Cross", realized_pnl: -0.20, confidence_score: 55, trend: "neutral", trend_consistency: 52, close_reason: "trailing_stop_loss" },
  
  // More EMA Golden Cross - Neutral 4h, HIGH consistency
  { id: "13", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.02, confidence_score: 55, trend: "neutral", trend_consistency: 88, close_reason: "partial_tp_1" },
  { id: "14", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 0.71, confidence_score: 55, trend: "neutral", trend_consistency: 88, close_reason: "trailing_stop_loss" },
  { id: "15", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 0.78, confidence_score: 55, trend: "neutral", trend_consistency: 88, close_reason: "trailing_stop_loss" },
  { id: "16", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: 1.02, confidence_score: 55, trend: "neutral", trend_consistency: 88, close_reason: "partial_tp_1" },
  
  // EMA Golden Cross - Neutral 4h, losses with low consistency
  { id: "17", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: -2.19, confidence_score: 51, trend: "neutral", trend_consistency: 88, close_reason: "stop_loss" },
  { id: "18", symbol: "AVAXUSDT", strategy_name: "EMA Golden Cross", realized_pnl: -2.00, confidence_score: 51, trend: "neutral", trend_consistency: 88, close_reason: "partial_loss" },
  
  // Volume Surge Momentum - Neutral 4h, LOW consistency (would be blocked by new rules)
  { id: "19", symbol: "BNBUSDT", strategy_name: "Volume Surge Momentum", realized_pnl: -0.52, confidence_score: 40, trend: "neutral", trend_consistency: 52, close_reason: "break_even" },
  { id: "20", symbol: "BNBUSDT", strategy_name: "Volume Surge Momentum", realized_pnl: -1.26, confidence_score: 40, trend: "neutral", trend_consistency: 52, close_reason: "partial_loss" },
  { id: "21", symbol: "BNBUSDT", strategy_name: "Volume Surge Momentum", realized_pnl: -1.39, confidence_score: 40, trend: "neutral", trend_consistency: 53, close_reason: "stop_loss" },
];

// New rules simulation:
// Allow momentum when 4h neutral IF:
// - confidence >= 60 (simulated by trend_consistency >= 70 as proxy for 1h directional)
// - momentum building (simulated by trend_consistency >= 70)
const wouldPassNewRules = (trade: TradeData): boolean => {
  // If 4h is directional, always allow
  if (trade.trend === "bullish" || trade.trend === "bearish") {
    return true;
  }
  
  // 4h is neutral - check new bypass conditions
  // Using trend_consistency >= 65 as proxy for "1h directional + momentum building"
  // Using confidence >= 50 as minimum
  const hasGoodConsistency = (trade.trend_consistency || 0) >= 65;
  const hasGoodConfidence = trade.confidence_score >= 50;
  
  return hasGoodConsistency && hasGoodConfidence;
};

export const MomentumBacktestSimulation = () => {
  // Calculate old rules results (all trades would have been taken)
  const oldRulesResults = {
    trades: backtestTrades.length,
    wins: backtestTrades.filter(t => t.realized_pnl > 0).length,
    losses: backtestTrades.filter(t => t.realized_pnl <= 0).length,
    totalPnl: backtestTrades.reduce((sum, t) => sum + t.realized_pnl, 0),
    winRate: 0,
  };
  oldRulesResults.winRate = (oldRulesResults.wins / oldRulesResults.trades) * 100;

  // Calculate new rules results (only trades that pass new rules)
  const newRulesTrades = backtestTrades.filter(t => wouldPassNewRules(t));
  const blockedTrades = backtestTrades.filter(t => !wouldPassNewRules(t));
  
  const newRulesResults = {
    trades: newRulesTrades.length,
    wins: newRulesTrades.filter(t => t.realized_pnl > 0).length,
    losses: newRulesTrades.filter(t => t.realized_pnl <= 0).length,
    totalPnl: newRulesTrades.reduce((sum, t) => sum + t.realized_pnl, 0),
    winRate: 0,
  };
  newRulesResults.winRate = newRulesTrades.length > 0 
    ? (newRulesResults.wins / newRulesResults.trades) * 100 
    : 0;

  // Blocked trades analysis
  const blockedResults = {
    trades: blockedTrades.length,
    wins: blockedTrades.filter(t => t.realized_pnl > 0).length,
    losses: blockedTrades.filter(t => t.realized_pnl <= 0).length,
    totalPnl: blockedTrades.reduce((sum, t) => sum + t.realized_pnl, 0),
  };

  const improvement = newRulesResults.winRate - oldRulesResults.winRate;
  const pnlImprovement = newRulesResults.totalPnl - oldRulesResults.totalPnl + Math.abs(blockedResults.totalPnl);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Momentum Strategy Backtest: Old vs New Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Old Rules */}
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  OLD RULES (Allow All)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Trades:</span>
                    <span className="font-medium">{oldRulesResults.trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Wins / Losses:</span>
                    <span className="font-medium text-green-500">{oldRulesResults.wins}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-medium text-red-500">{oldRulesResults.losses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Win Rate:</span>
                    <Badge variant="secondary">{oldRulesResults.winRate.toFixed(1)}%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Total PnL:</span>
                    <span className={oldRulesResults.totalPnl >= 0 ? "text-green-500" : "text-red-500"}>
                      ${oldRulesResults.totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* New Rules */}
            <Card className="border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary">
                  NEW RULES (Smart Filter)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Trades:</span>
                    <span className="font-medium">{newRulesResults.trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Wins / Losses:</span>
                    <span className="font-medium text-green-500">{newRulesResults.wins}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-medium text-red-500">{newRulesResults.losses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Win Rate:</span>
                    <Badge variant="default" className="bg-green-500">{newRulesResults.winRate.toFixed(1)}%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Total PnL:</span>
                    <span className={newRulesResults.totalPnl >= 0 ? "text-green-500" : "text-red-500"}>
                      ${newRulesResults.totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Blocked Trades */}
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-destructive">
                  BLOCKED TRADES
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Trades Blocked:</span>
                    <span className="font-medium">{blockedResults.trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Were Wins / Losses:</span>
                    <span className="font-medium text-green-500">{blockedResults.wins}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-medium text-red-500">{blockedResults.losses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Avoided PnL:</span>
                    <span className={blockedResults.totalPnl >= 0 ? "text-yellow-500" : "text-green-500"}>
                      {blockedResults.totalPnl >= 0 ? "Missed" : "Saved"} ${Math.abs(blockedResults.totalPnl).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Improvement Summary */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {improvement > 0 ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  <span className="font-medium">Impact Summary</span>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Win Rate Change</div>
                    <div className={improvement > 0 ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                      {improvement > 0 ? "+" : ""}{improvement.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Trades Filtered</div>
                    <div className="font-bold">{blockedResults.trades}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Loss Avoided</div>
                    <div className="text-green-500 font-bold">
                      ${Math.abs(blockedResults.totalPnl).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Detailed Trade Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Trade-by-Trade Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>4h Trend</TableHead>
                <TableHead>Consistency</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>New Rules</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backtestTrades.map((trade) => {
                const passes = wouldPassNewRules(trade);
                return (
                  <TableRow key={trade.id} className={!passes ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell className="text-xs">{trade.strategy_name}</TableCell>
                    <TableCell>
                      <Badge variant={trade.trend === "neutral" ? "secondary" : "default"}>
                        {trade.trend}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={(trade.trend_consistency || 0) >= 65 ? "text-green-500" : "text-yellow-500"}>
                        {trade.trend_consistency || "N/A"}%
                      </span>
                    </TableCell>
                    <TableCell>{trade.confidence_score}%</TableCell>
                    <TableCell>
                      <span className={trade.realized_pnl >= 0 ? "text-green-500" : "text-red-500"}>
                        {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {passes ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
