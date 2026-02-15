import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Layers, TrendingUp, TrendingDown, Target } from "lucide-react";
import { usePositions } from "@/hooks/usePositions";
import { useRealtimePricesContext } from "@/contexts/RealtimePricesContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatPrice } from "@/lib/utils";

export const PositionsSummary = () => {
  const { positions } = usePositions();
  const { priceVersion, getPrice } = useRealtimePricesContext();

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
      const livePrice = getPrice(position.symbol);
      const currentPrice = livePrice
        ? parseFloat(livePrice.price)
        : position.current_price ?? position.entry_price ?? 0;
      const entryPrice = position.entry_price ?? 0;
      const qty = position.quantity ?? 0;

      // Skip if we don't have valid prices
      if (!currentPrice || !entryPrice || !qty) return;

      // Calculate unrealized P&L (same as PortfolioMetrics)
      const pnl = position.side === "BUY"
        ? (currentPrice - entryPrice) * qty
        : (entryPrice - currentPrice) * qty;
      totalUnrealizedPnl += pnl;

      // Calculate trailing stop status
      if (trailingEnabled) {
        const pnlPercent = position.side === "BUY"
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
  }, [positions, priceVersion, riskParams, getPrice]);

  const metrics = [
    {
      label: "Active Positions",
      value: summary.totalPositions.toString(),
      icon: Layers,
      color: "text-primary",
    },
    {
      label: "Unrealized P&L",
      value: `${summary.totalUnrealizedPnl >= 0 ? "+" : "-"}${formatPrice(Math.abs(summary.totalUnrealizedPnl), 2, '$')}`,
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
      label: "Profitable (Pre-Trailing)",
      value: summary.trailingPending.toString(),
      icon: Target,
      color: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-3 border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">{metric.label}</p>
              <p className={`text-lg font-bold font-mono ${metric.color}`}>
                {metric.value}
              </p>
            </div>
            <metric.icon className={`h-4 w-4 ${metric.color} opacity-50`} />
          </div>
        </Card>
      ))}
    </div>
  );
};
