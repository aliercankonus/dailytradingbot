import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, Timer } from "lucide-react";
import { useLtfMicroMomentum, type LtfMicroData } from "@/hooks/useLtfMicroMomentum";
import { Skeleton } from "@/components/ui/skeleton";

function directionIcon(dir: string) {
  if (dir === 'bullish') return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (dir === 'bearish') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function timingBadge(score: number) {
  if (score > 80) return <Badge variant="default" className="bg-emerald-600 text-xs">Excellent</Badge>;
  if (score > 70) return <Badge variant="default" className="bg-green-600 text-xs">Good</Badge>;
  if (score >= 30) return <Badge variant="secondary" className="text-xs">Neutral</Badge>;
  return <Badge variant="destructive" className="text-xs">Poor</Badge>;
}

function multiplierLabel(score: number, alignment: number) {
  if (score > 80 && alignment > 0) return "×1.20";
  if (score > 70 && alignment > 0) return "×1.10";
  if (score < 30) return "×0.50";
  return "×1.00";
}

function SymbolRow({ data }: { data: LtfMicroData }) {
  const mult = multiplierLabel(data.entryTimingScore, data.ltfAlignment);
  const multColor = mult === "×1.20" ? "text-emerald-500" : mult === "×1.10" ? "text-green-500" : mult === "×0.50" ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center py-2 border-b border-border/40 last:border-b-0 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{data.symbol.replace('USDT', '')}</span>
        {data.isReverting1m && <AlertTriangle className="h-3 w-3 text-amber-500" />}
        {data.isAccelerating5m && <Zap className="h-3 w-3 text-yellow-500" />}
      </div>

      {/* 5m / 1m scores */}
      <div className="flex items-center gap-1 min-w-[80px]">
        {directionIcon(data.direction5m)}
        <span className="tabular-nums text-xs">{data.score5m.toFixed(0)}</span>
        <span className="text-muted-foreground text-xs">/</span>
        {directionIcon(data.direction1m)}
        <span className="tabular-nums text-xs">{data.score1m.toFixed(0)}</span>
      </div>

      {/* Alignment */}
      <div className="min-w-[50px] text-center">
        <span className={`tabular-nums text-xs ${data.ltfAlignment > 0 ? 'text-green-500' : data.ltfAlignment < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {data.ltfAlignment > 0 ? '+' : ''}{data.ltfAlignment.toFixed(2)}
        </span>
      </div>

      {/* Timing score bar */}
      <div className="min-w-[90px] flex items-center gap-1.5">
        <Progress value={data.entryTimingScore} className="h-2 flex-1" />
        <span className="tabular-nums text-xs w-6 text-right">{data.entryTimingScore.toFixed(0)}</span>
      </div>

      {/* Timing badge */}
      {timingBadge(data.entryTimingScore)}

      {/* Multiplier */}
      <span className={`tabular-nums text-xs font-semibold min-w-[36px] text-right ${multColor}`}>
        {mult}
      </span>
    </div>
  );
}

export default function LtfMicroMomentumWidget() {
  const { data, isLoading, error } = useLtfMicroMomentum();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="h-4 w-4" />
            LTF Micro Momentum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="h-4 w-4" />
            LTF Micro Momentum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No LTF micro data available</p>
        </CardContent>
      </Card>
    );
  }

  // Sort by trade impact: abs(multiplier - 1) descending
  // Symbols with largest position adjustments (boosts or penalties) appear first
  const getMultiplierValue = (d: LtfMicroData) => {
    if (d.entryTimingScore > 80 && d.ltfAlignment > 0) return 1.20;
    if (d.entryTimingScore > 70 && d.ltfAlignment > 0) return 1.10;
    if (d.entryTimingScore < 30) return 0.50;
    if (d.ltfAlignment < 0) return 0.75;
    return 1.00;
  };
  const sorted = [...data].sort((a, b) => Math.abs(getMultiplierValue(b) - 1) - Math.abs(getMultiplierValue(a) - 1));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Timer className="h-4 w-4" />
          LTF Micro Momentum
          <Badge variant="outline" className="ml-auto text-xs">{data.length} symbols</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-xs text-muted-foreground pb-1 border-b border-border mb-1">
          <span>Symbol</span>
          <span className="min-w-[80px]">5m / 1m</span>
          <span className="min-w-[50px] text-center">Align</span>
          <span className="min-w-[90px]">Timing</span>
          <span>Grade</span>
          <span className="min-w-[36px] text-right">Mult</span>
        </div>
        {sorted.map(d => <SymbolRow key={d.symbol} data={d} />)}
      </CardContent>
    </Card>
  );
}
