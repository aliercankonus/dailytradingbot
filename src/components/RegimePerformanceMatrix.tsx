import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grid3X3 } from "lucide-react";

interface BacktestTrade {
  symbol: string;
  side: string;
  netPnlPercent: number;
  strategyName?: string;
  regime?: string;
}

interface MatrixCell {
  trades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

interface RegimePerformanceMatrixProps {
  trades: BacktestTrade[];
}

const REGIME_ORDER = ['TREND_EXPANSION', 'TREND_EXHAUSTION', 'BREAKOUT_SETUP', 'RANGE_COMPRESSION', 'UNKNOWN'];
const REGIME_SHORT: Record<string, string> = {
  TREND_EXPANSION: 'Expansion',
  TREND_EXHAUSTION: 'Exhaustion',
  BREAKOUT_SETUP: 'Breakout',
  RANGE_COMPRESSION: 'Compress',
  UNKNOWN: 'Unknown',
};
const REGIME_EMOJI: Record<string, string> = {
  TREND_EXPANSION: '🚀',
  TREND_EXHAUSTION: '⚠️',
  BREAKOUT_SETUP: '💥',
  RANGE_COMPRESSION: '📦',
  UNKNOWN: '❓',
};

export const RegimePerformanceMatrix = ({ trades }: RegimePerformanceMatrixProps) => {
  if (!trades || trades.length === 0) return null;

  // Build strategy × regime matrix
  const matrix: Record<string, Record<string, MatrixCell>> = {};
  const strategies = new Set<string>();
  const regimes = new Set<string>();

  for (const t of trades) {
    const strategy = t.strategyName || 'UNKNOWN';
    const regime = t.regime || 'UNKNOWN';
    strategies.add(strategy);
    regimes.add(regime);

    if (!matrix[strategy]) matrix[strategy] = {};
    if (!matrix[strategy][regime]) {
      matrix[strategy][regime] = { trades: 0, wins: 0, winRate: 0, totalPnl: 0, avgPnl: 0 };
    }
    const cell = matrix[strategy][regime];
    cell.trades++;
    cell.totalPnl += t.netPnlPercent;
    if (t.netPnlPercent > 0) cell.wins++;
  }

  // Calculate derived metrics
  for (const strategy of Object.keys(matrix)) {
    for (const regime of Object.keys(matrix[strategy])) {
      const cell = matrix[strategy][regime];
      cell.winRate = cell.trades > 0 ? Math.round((cell.wins / cell.trades) * 1000) / 10 : 0;
      cell.avgPnl = cell.trades > 0 ? Math.round((cell.totalPnl / cell.trades) * 1000) / 1000 : 0;
      cell.totalPnl = Math.round(cell.totalPnl * 1000) / 1000;
    }
  }

  // Sort regimes by REGIME_ORDER, then alphabetical for unknowns
  const sortedRegimes = [...regimes].sort((a, b) => {
    const ai = REGIME_ORDER.indexOf(a);
    const bi = REGIME_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // Sort strategies by total trades desc
  const sortedStrategies = [...strategies].sort((a, b) => {
    const aTotal = Object.values(matrix[a] || {}).reduce((s, c) => s + c.trades, 0);
    const bTotal = Object.values(matrix[b] || {}).reduce((s, c) => s + c.trades, 0);
    return bTotal - aTotal;
  });

  // Find best cell for highlighting
  let bestPnl = -Infinity;
  let bestKey = '';
  for (const s of sortedStrategies) {
    for (const r of sortedRegimes) {
      const cell = matrix[s]?.[r];
      if (cell && cell.trades >= 2 && cell.totalPnl > bestPnl) {
        bestPnl = cell.totalPnl;
        bestKey = `${s}-${r}`;
      }
    }
  }

  const getCellBg = (cell: MatrixCell | undefined, key: string) => {
    if (!cell || cell.trades === 0) return '';
    if (key === bestKey) return 'bg-success/15 ring-1 ring-success/30';
    if (cell.avgPnl > 0.1) return 'bg-success/8';
    if (cell.avgPnl < -0.1) return 'bg-destructive/8';
    return 'bg-muted/30';
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Strateji × Regime Performans Matrisi</CardTitle>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Hangi strateji hangi market regime'de en iyi performans gösteriyor
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium sticky left-0 bg-card z-10 min-w-[120px]">
                  Strateji
                </th>
                {sortedRegimes.map(regime => (
                  <th key={regime} className="text-center py-2 px-1.5 text-muted-foreground font-medium min-w-[90px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{REGIME_EMOJI[regime] || '📊'}</span>
                      <span>{REGIME_SHORT[regime] || regime.replace(/_/g, ' ')}</span>
                    </div>
                  </th>
                ))}
                <th className="text-center py-2 px-2 text-muted-foreground font-medium border-l border-border min-w-[70px]">
                  Toplam
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStrategies.map(strategy => {
                const strategyTotal = Object.values(matrix[strategy] || {}).reduce((s, c) => s + c.trades, 0);
                const strategyWins = Object.values(matrix[strategy] || {}).reduce((s, c) => s + c.wins, 0);
                const strategyPnl = Object.values(matrix[strategy] || {}).reduce((s, c) => s + c.totalPnl, 0);
                const strategyWR = strategyTotal > 0 ? Math.round((strategyWins / strategyTotal) * 1000) / 10 : 0;

                return (
                  <tr key={strategy} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 px-2 font-mono font-medium text-foreground sticky left-0 bg-card z-10">
                      <span className="text-[10px]">{strategy}</span>
                    </td>
                    {sortedRegimes.map(regime => {
                      const cell = matrix[strategy]?.[regime];
                      const key = `${strategy}-${regime}`;
                      return (
                        <td key={regime} className={`py-1.5 px-1.5 text-center rounded-sm ${getCellBg(cell, key)}`}>
                          {cell && cell.trades > 0 ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-foreground">{cell.trades}T</div>
                              <div className={`font-medium ${cell.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>
                                {cell.winRate}%
                              </div>
                              <div className={`text-[9px] ${cell.avgPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {cell.avgPnl >= 0 ? '+' : ''}{cell.avgPnl}%
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center border-l border-border">
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{strategyTotal}T</div>
                        <div className={`font-medium ${strategyWR >= 50 ? 'text-success' : 'text-destructive'}`}>
                          {strategyWR}%
                        </div>
                        <div className={`text-[9px] ${strategyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {strategyPnl >= 0 ? '+' : ''}{Math.round(strategyPnl * 1000) / 1000}%
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Regime totals row */}
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-muted/20 z-10">
                  Toplam
                </td>
                {sortedRegimes.map(regime => {
                  const total = sortedStrategies.reduce((s, st) => s + (matrix[st]?.[regime]?.trades || 0), 0);
                  const wins = sortedStrategies.reduce((s, st) => s + (matrix[st]?.[regime]?.wins || 0), 0);
                  const pnl = sortedStrategies.reduce((s, st) => s + (matrix[st]?.[regime]?.totalPnl || 0), 0);
                  const wr = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
                  return (
                    <td key={regime} className="py-1.5 px-1.5 text-center">
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{total}</div>
                        <div className={`font-medium ${wr >= 50 ? 'text-success' : 'text-destructive'}`}>{wr}%</div>
                        <div className={`text-[9px] ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pnl >= 0 ? '+' : ''}{Math.round(pnl * 1000) / 1000}%
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td className="py-1.5 px-2 text-center border-l border-border">
                  <Badge variant="outline" className="text-[9px]">{trades.length}</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-[9px] text-muted-foreground">
          <span>T = Trade sayısı</span>
          <span>% = Win Rate</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-success/15 ring-1 ring-success/30" />
            En iyi hücre
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-success/8" />
            Pozitif
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-destructive/8" />
            Negatif
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
