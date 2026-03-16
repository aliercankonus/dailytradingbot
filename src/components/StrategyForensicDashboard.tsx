import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertTriangle, Shield, Target, BarChart3 } from "lucide-react";

interface StrategyRow {
  normalized_strategy: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  best_trade_pct: number;
  worst_trade_pct: number;
  db_name_variants: string[];
}

interface SideRow {
  normalized_strategy: string;
  side: string;
  trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_pct: number;
}

interface CloseReasonRow {
  normalized_strategy: string;
  close_reason: string;
  trades: number;
  total_pnl: number;
  avg_pnl_pct: number;
}

interface SymbolRow {
  normalized_strategy: string;
  symbol: string;
  side: string;
  trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_pct: number;
  worst_trade_pct: number;
  avg_peak_pct: number;
}

export function StrategyForensicDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase.rpc('get_strategy_forensic_report', { p_user_id: user.id, p_days: days })
      .then(({ data: result, error }) => {
        if (!error && result) setData(result);
        setLoading(false);
      });
  }, [user, days]);

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-2">Forensic rapor yükleniyor...</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-12 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-2">Forensic veri bulunamadı</p>
      </Card>
    );
  }

  const strategies: StrategyRow[] = data.by_normalized_strategy || [];
  const bySide: SideRow[] = data.by_strategy_and_side || [];
  const byCloseReason: CloseReasonRow[] = data.by_strategy_and_close_reason || [];
  const bySymbol: SymbolRow[] = data.by_strategy_side_symbol || [];

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Dönem:</span>
        {[30, 60, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2 py-0.5 text-xs rounded ${days === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {d}g
          </button>
        ))}
      </div>

      {/* Strategy Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {strategies.map((s) => {
          const pnlPositive = s.total_pnl >= 0;
          const wrGood = s.win_rate >= 50;
          return (
            <Card key={s.normalized_strategy} className="p-3 border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{s.normalized_strategy}</span>
                </div>
                <Badge variant={pnlPositive ? "default" : "destructive"} className="text-[10px]">
                  {pnlPositive ? '+' : ''}{s.total_pnl.toFixed(2)}$
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Trades</div>
                  <div className="text-sm font-mono font-bold text-foreground">{s.total_trades}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">WR</div>
                  <div className={`text-sm font-mono font-bold ${wrGood ? 'text-profit' : 'text-loss'}`}>
                    {s.win_rate}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Avg PnL</div>
                  <div className={`text-sm font-mono font-bold ${s.avg_pnl_pct >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {s.avg_pnl_pct >= 0 ? '+' : ''}{s.avg_pnl_pct}%
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                <div className="bg-profit/10 rounded p-1">
                  <span className="text-muted-foreground">Avg Win: </span>
                  <span className="text-profit font-mono">+{s.avg_win_pct ?? 0}%</span>
                </div>
                <div className="bg-loss/10 rounded p-1">
                  <span className="text-muted-foreground">Avg Loss: </span>
                  <span className="text-loss font-mono">{s.avg_loss_pct ?? 0}%</span>
                </div>
              </div>
              {s.worst_trade_pct < -1.5 && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-loss">
                  <AlertTriangle className="h-3 w-3" />
                  <span>SL Bleeding: En kötü trade {s.worst_trade_pct}%</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Side Breakdown */}
      <Card className="p-3 border-border">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          Side Bazlı Performans
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1 px-2">Strateji</th>
                <th className="text-left py-1 px-2">Side</th>
                <th className="text-right py-1 px-2">Trades</th>
                <th className="text-right py-1 px-2">WR</th>
                <th className="text-right py-1 px-2">PnL</th>
                <th className="text-right py-1 px-2">Avg%</th>
              </tr>
            </thead>
            <tbody>
              {bySide.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1 px-2 font-mono text-foreground">{row.normalized_strategy}</td>
                  <td className="py-1 px-2">
                    <Badge variant="outline" className="text-[9px]">
                      {row.side === 'buy' ? '🟢 BUY' : '🔴 SELL'}
                    </Badge>
                  </td>
                  <td className="text-right py-1 px-2 font-mono text-foreground">{row.trades}</td>
                  <td className={`text-right py-1 px-2 font-mono ${row.win_rate >= 50 ? 'text-profit' : 'text-loss'}`}>
                    {row.win_rate}%
                  </td>
                  <td className={`text-right py-1 px-2 font-mono ${row.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {row.total_pnl >= 0 ? '+' : ''}{row.total_pnl}$
                  </td>
                  <td className={`text-right py-1 px-2 font-mono ${row.avg_pnl_pct >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {row.avg_pnl_pct >= 0 ? '+' : ''}{row.avg_pnl_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Symbol × Side Heatmap (NEW) */}
      {bySymbol.length > 0 && (
        <Card className="p-3 border-border">
          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            Symbol × Side Risk Heatmap
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1 px-2">Strateji</th>
                  <th className="text-left py-1 px-2">Symbol</th>
                  <th className="text-left py-1 px-2">Side</th>
                  <th className="text-right py-1 px-2">Trades</th>
                  <th className="text-right py-1 px-2">WR</th>
                  <th className="text-right py-1 px-2">PnL</th>
                  <th className="text-right py-1 px-2">Worst</th>
                  <th className="text-right py-1 px-2">Avg Peak</th>
                  <th className="text-right py-1 px-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.slice(0, 20).map((row, i) => {
                  const giveback = row.avg_peak_pct > 0 && row.avg_pnl_pct < row.avg_peak_pct
                    ? ((1 - row.avg_pnl_pct / row.avg_peak_pct) * 100).toFixed(0)
                    : null;
                  const isHighRisk = row.total_pnl < -2 || row.win_rate < 35 || (row.worst_trade_pct && row.worst_trade_pct < -1.5);
                  return (
                    <tr key={i} className={`border-b border-border/50 ${isHighRisk ? 'bg-loss/5' : ''}`}>
                      <td className="py-1 px-2 font-mono text-foreground">{row.normalized_strategy}</td>
                      <td className="py-1 px-2 font-mono text-foreground">{row.symbol}</td>
                      <td className="py-1 px-2">
                        <Badge variant="outline" className="text-[9px]">
                          {row.side === 'buy' ? '🟢' : '🔴'} {row.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="text-right py-1 px-2 font-mono text-foreground">{row.trades}</td>
                      <td className={`text-right py-1 px-2 font-mono ${row.win_rate >= 50 ? 'text-profit' : 'text-loss'}`}>
                        {row.win_rate}%
                      </td>
                      <td className={`text-right py-1 px-2 font-mono ${row.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {row.total_pnl >= 0 ? '+' : ''}{row.total_pnl}$
                      </td>
                      <td className="text-right py-1 px-2 font-mono text-loss">
                        {row.worst_trade_pct}%
                      </td>
                      <td className="text-right py-1 px-2 font-mono text-muted-foreground">
                        {row.avg_peak_pct}%
                      </td>
                      <td className="text-right py-1 px-2">
                        {isHighRisk ? (
                          <span className="text-loss text-[9px] font-bold">⚠️ HIGH</span>
                        ) : giveback && parseInt(giveback) > 50 ? (
                          <span className="text-warning text-[9px]">📊 GIVEBACK {giveback}%</span>
                        ) : (
                          <span className="text-profit text-[9px]">✅ OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Close Reason Breakdown */}
      <Card className="p-3 border-border">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
          Close Reason & SL Bleeding Analizi
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1 px-2">Strateji</th>
                <th className="text-left py-1 px-2">Çıkış Sebebi</th>
                <th className="text-right py-1 px-2">Trades</th>
                <th className="text-right py-1 px-2">PnL</th>
                <th className="text-right py-1 px-2">Avg%</th>
                <th className="text-right py-1 px-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {byCloseReason.map((row, i) => {
                const isSL = row.close_reason === 'stop_loss' || row.close_reason === 'hard_pnl_floor';
                const isBleeding = isSL && row.avg_pnl_pct < -1.0;
                return (
                  <tr key={i} className={`border-b border-border/50 ${isBleeding ? 'bg-loss/5' : ''}`}>
                    <td className="py-1 px-2 font-mono text-foreground">{row.normalized_strategy}</td>
                    <td className="py-1 px-2">
                      <Badge
                        variant={isSL ? "destructive" : row.close_reason.includes('profit') || row.close_reason === 'take_profit' ? "default" : "outline"}
                        className="text-[9px]"
                      >
                        {row.close_reason}
                      </Badge>
                    </td>
                    <td className="text-right py-1 px-2 font-mono text-foreground">{row.trades}</td>
                    <td className={`text-right py-1 px-2 font-mono ${row.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {row.total_pnl >= 0 ? '+' : ''}{row.total_pnl}$
                    </td>
                    <td className={`text-right py-1 px-2 font-mono ${row.avg_pnl_pct >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {row.avg_pnl_pct >= 0 ? '+' : ''}{row.avg_pnl_pct}%
                    </td>
                    <td className="text-right py-1 px-2">
                      {isBleeding ? (
                        <span className="text-loss text-[9px] font-bold">⚠️ BLEEDING</span>
                      ) : isSL ? (
                        <span className="text-warning text-[9px]">📊 Monitor</span>
                      ) : (
                        <span className="text-profit text-[9px]">✅ OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
