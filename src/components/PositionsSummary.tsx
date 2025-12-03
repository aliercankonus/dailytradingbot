import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Layers, TrendingUp, TrendingDown, Target } from "lucide-react";
import { usePositions } from "@/hooks/usePositions";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const PositionsSummary = () => {
  const { positions } = usePositions();
  const { prices, priceVersion } = useRealtimePricesContext();

  // Fetch risk parameters directly for trailing stop settings
  const { data: riskParams } = useQuery({
    queryKey: ["risk-params-trailing"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("risk_parameters")
        .select("trailing_stop_enabled, trailing_stop_activation_percent")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const summary = useMemo(() => {
    let totalUnrealizedPnl = 0;
    let trailingActive = 0;
    let trailingPending = 0;

    const activationThreshold = riskParams?.trailing_stop_activation_percent ?? 1.0;
    const trailingEnabled = riskParams?.trailing_stop_enabled ?? true;

    positions.forEach((position) => {
      const wsPrice = prices.get(position.symbol);
      const entryPrice = Number(position.entry_price) || 0;
      const dbPrice = Number(position.current_price) || entryPrice;
      const currentPrice = Number(wsPrice ?? dbPrice) || 0;
      const qty = Number(position.quantity) || 0;

      // Skip if we don't have valid prices
      if (!currentPrice || !entryPrice || !qty) return;

      const side = position.side?.toLowerCase();

      // Calculate unrealized P&L
      const pnl = side === "buy"
        ? (currentPrice - entryPrice) * qty
        : (entryPrice - currentPrice) * qty;
      totalUnrealizedPnl += pnl;

      // Calculate trailing stop status
      if (trailingEnabled) {
        const pnlPercent = side === "buy"
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - currentPrice) / entryPrice) * 100;

        if (pnlPercent >= activationThreshold) {
          trailingActive++;
        } else if (pnlPercent > 0) {
          trailingPending++;
        }
      }
    });

    return {
      totalPositions: positions.length,
      totalUnrealizedPnl,
      trailingActive,
      trailingPending,
    };
  }, [positions, prices, priceVersion, riskParams]);

  const metrics = [
    {
      label: "Active Positions",
      value: summary.totalPositions.toString(),
      icon: Layers,
      color: "text-primary",
    },
    {
      label: "Unrealized P&L",
      value: `${summary.totalUnrealizedPnl >= 0 ? "+" : ""}$${summary.totalUnrealizedPnl.toFixed(2)}`,
      icon: summary.totalUnrealizedPnl >= 0 ? TrendingUp : TrendingDown,
      color: summary.totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss",
    },
    {
      label: "Trailing Active",
      value: summary.trailingActive.toString(),
      icon: Target,
      color: "text-profit",
    },
    {
      label: "Trailing Pending",
      value: summary.trailingPending.toString(),
      icon: Target,
      color: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-4 bg-card/50 border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className={`text-xl font-bold font-mono ${metric.color}`}>
                {metric.value}
              </p>
            </div>
            <metric.icon className={`h-5 w-5 ${metric.color} opacity-70`} />
          </div>
        </Card>
      ))}
    </div>
  );
};
