import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TestResult {
  symbol: string;
  signalType: 'long' | 'short' | 'hold';
  trend: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  confidenceScore: number;
  reason: string;
  entryConditions: Array<{
    condition: string;
    currentValue: string;
    met: boolean;
  }>;
  exitConditions: Array<{
    condition: string;
    currentValue: string;
    met: boolean;
  }>;
  indicatorValues: Record<string, string>;
  marketData: {
    price: string;
    change: string;
    volume: string;
  };
}

interface TestSummary {
  totalSymbolsTested: number;
  signalsGenerated: number;
  longSignals: number;
  shortSignals: number;
  holdSignals: number;
  averageConfidence: string;
}

interface StrategyTestResultsProps {
  strategyName: string;
  results: TestResult[];
  summary: TestSummary;
  timestamp: string;
}

export const StrategyTestResults = ({
  strategyName,
  results,
  summary,
  timestamp,
}: StrategyTestResultsProps) => {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Test Summary - {strategyName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Symbols Tested</p>
              <p className="text-2xl font-bold text-foreground">{summary.totalSymbolsTested}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signals Generated</p>
              <p className="text-2xl font-bold text-primary">{summary.signalsGenerated}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Confidence</p>
              <p className="text-2xl font-bold text-foreground">{summary.averageConfidence}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Long Signals</p>
              <p className="text-2xl font-bold text-green-600">{summary.longSignals}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Short Signals</p>
              <p className="text-2xl font-bold text-red-600">{summary.shortSignals}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Hold</p>
              <p className="text-2xl font-bold text-muted-foreground">{summary.holdSignals}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Tested at: {new Date(timestamp).toLocaleString()}</p>
        </CardContent>
      </Card>

      {/* Individual Results */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-4">
          {results.map((result, idx) => (
            <Card key={idx} className={result.signalType !== 'hold' ? 'border-primary/50' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{result.symbol}</CardTitle>
                    {result.signalType === 'long' && (
                      <Badge className="bg-green-600">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        LONG
                      </Badge>
                    )}
                    {result.signalType === 'short' && (
                      <Badge className="bg-red-600">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        SHORT
                      </Badge>
                    )}
                    {result.signalType === 'hold' && (
                      <Badge variant="secondary">
                        <Minus className="h-3 w-3 mr-1" />
                        HOLD
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline">
                    Confidence: {result.confidenceScore}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Market Data */}
                <div className="grid grid-cols-3 gap-4 p-3 bg-secondary/20 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Price</p>
                    <p className="font-mono text-sm font-semibold">${result.marketData.price}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Change</p>
                    <p className={`font-mono text-sm font-semibold ${
                      parseFloat(result.marketData.change) > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {result.marketData.change}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <p className="font-mono text-xs">{result.marketData.volume}</p>
                  </div>
                </div>

                {/* Signal Details */}
                {result.signalType !== 'hold' && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-secondary/20 rounded-lg">
                    <div>
                      <p className="text-xs text-muted-foreground">Entry Price</p>
                      <p className="font-mono text-sm font-semibold">${result.entryPrice}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Stop Loss</p>
                      <p className="font-mono text-sm text-red-600">${result.stopLoss}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Take Profit</p>
                      <p className="font-mono text-sm text-green-600">${result.takeProfit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Trend</p>
                      <p className="text-sm font-semibold capitalize">{result.trend}</p>
                    </div>
                  </div>
                )}

                {/* Reason */}
                <div className="p-3 bg-secondary/20 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Analysis</p>
                  <p className="text-sm">{result.reason}</p>
                </div>

                {/* Entry Conditions */}
                <div>
                  <p className="text-sm font-semibold mb-2">Entry Conditions</p>
                  <div className="space-y-2">
                    {result.entryConditions.map((cond, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 bg-secondary/20 rounded text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {cond.met ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-mono text-xs">{cond.condition}</span>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          Current: {cond.currentValue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exit Conditions */}
                {result.exitConditions.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Exit Conditions</p>
                    <div className="space-y-2">
                      {result.exitConditions.map((cond, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 bg-secondary/20 rounded text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {cond.met ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-mono text-xs">{cond.condition}</span>
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            Current: {cond.currentValue}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Indicator Values */}
                <div>
                  <p className="text-sm font-semibold mb-2">Indicator Values</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(result.indicatorValues).map(([key, value]) => (
                      <div key={key} className="p-2 bg-secondary/20 rounded">
                        <p className="text-xs text-muted-foreground">{key}</p>
                        <p className="font-mono text-sm font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
