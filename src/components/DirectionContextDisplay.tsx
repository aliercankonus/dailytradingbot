import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Layers, 
  Zap, 
  Activity, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Shield,
  Gauge,
  Info
} from "lucide-react";

interface DirectionContext {
  proposedDirection: "long" | "short" | null;
  evidenceType: "HTF_CONSENSUS" | "MOMENTUM" | "ORDER_FLOW" | "PRICE_ACTION" | "STOCHRSI" | "EXHAUSTION" | "WEIGHTED_SUM" | "NONE";
  tier: number;
  tierSource: string;
  confidence: number;
  positionMultiplier: number;
  isCounterTrend: boolean;
  riskClass: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  evidenceStrength: "WEAK" | "MODERATE" | "STRONG" | "VERY_STRONG";
  conflictsWith: string[];
}

interface DirectionContextDisplayProps {
  directionContext?: DirectionContext;
  compact?: boolean;
}

const EVIDENCE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  HTF_CONSENSUS: { icon: Layers, color: "text-blue-400", label: "HTF Consensus" },
  MOMENTUM: { icon: Zap, color: "text-purple-400", label: "Momentum" },
  ORDER_FLOW: { icon: Activity, color: "text-cyan-400", label: "Order Flow" },
  PRICE_ACTION: { icon: Target, color: "text-orange-400", label: "Price Action" },
  STOCHRSI: { icon: Gauge, color: "text-pink-400", label: "StochRSI" },
  EXHAUSTION: { icon: AlertTriangle, color: "text-red-400", label: "Exhaustion" },
  WEIGHTED_SUM: { icon: Layers, color: "text-emerald-400", label: "Weighted Sum" },
  NONE: { icon: Info, color: "text-muted-foreground", label: "None" },
};

const RISK_CLASS_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  LOW: { color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  MEDIUM: { color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" },
  HIGH: { color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  EXTREME: { color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
};

const EVIDENCE_STRENGTH_CONFIG: Record<string, { width: string; color: string }> = {
  WEAK: { width: "25%", color: "bg-red-500" },
  MODERATE: { width: "50%", color: "bg-yellow-500" },
  STRONG: { width: "75%", color: "bg-green-500" },
  VERY_STRONG: { width: "100%", color: "bg-emerald-400" },
};

const getTierLabel = (tier: number): string => {
  if (tier === 0) return "Tier 0 (HTF Consensus)";
  if (tier === 0.25) return "Tier 0.25 (Exhaustion Reversal)";
  if (tier === 0.5) return "Tier 0.5 (Momentum Override)";
  if (tier === 1) return "Tier 1 (Price Action)";
  if (tier === 2) return "Tier 2 (4H Strong)";
  if (tier === 3) return "Tier 3 (1H Opposition)";
  if (tier === 4) return "Tier 4 (Momentum Direction)";
  if (tier === 5) return "Tier 5 (Order Flow Direction)";
  if (tier === 6) return "Tier 6 (4H Moderate)";
  if (tier === 7) return "Tier 7 (1H Strong)";
  if (tier === 8) return "Tier 8 (StochRSI Extreme)";
  if (tier === 9) return "Tier 9 (HTF Weak)";
  if (tier === 10) return "Tier 10 (Momentum+OF Fallback)";
  if (tier === 11) return "Tier 11 (Exhaustion Escape)";
  if (tier === 12) return "Tier 12 (No Direction)";
  return `Tier ${tier}`;
};

export function DirectionContextDisplay({ directionContext, compact = false }: DirectionContextDisplayProps) {
  if (!directionContext) return null;

  const {
    proposedDirection,
    evidenceType,
    tier,
    tierSource,
    confidence,
    positionMultiplier,
    isCounterTrend,
    riskClass,
    evidenceStrength,
    conflictsWith,
  } = directionContext;

  const evidenceConfig = EVIDENCE_TYPE_CONFIG[evidenceType] || EVIDENCE_TYPE_CONFIG.NONE;
  const riskConfig = RISK_CLASS_CONFIG[riskClass] || RISK_CLASS_CONFIG.EXTREME;
  const strengthConfig = EVIDENCE_STRENGTH_CONFIG[evidenceStrength] || EVIDENCE_STRENGTH_CONFIG.WEAK;
  const EvidenceIcon = evidenceConfig.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 text-[10px] cursor-help">
              <EvidenceIcon className={`h-3 w-3 ${evidenceConfig.color}`} />
              <span className="font-mono text-muted-foreground">T{tier}</span>
              <Badge 
                variant="outline" 
                className={`text-[9px] px-1 py-0 ${riskConfig.color} ${riskConfig.borderColor}`}
              >
                {riskClass}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px]">
            <div className="space-y-1 text-xs">
              <p className="font-medium">{getTierLabel(tier)}</p>
              <p>Evidence: {evidenceConfig.label}</p>
              <p>Strength: {evidenceStrength}</p>
              {tierSource && <p className="font-mono text-[10px] text-muted-foreground">{tierSource}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={`space-y-2 p-2 rounded-md border ${riskConfig.bgColor} ${riskConfig.borderColor}`}>
      {/* Header: Tier & Evidence Type */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">Direction Context</span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskConfig.color} ${riskConfig.borderColor}`}>
          {riskClass} Risk
        </Badge>
      </div>

      {/* Tier Source */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-1.5 bg-muted/30 rounded">
          <div className="text-[9px] text-muted-foreground mb-0.5">Tier</div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono font-semibold">{tier}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px] max-w-[200px]">
                  <p>{getTierLabel(tier)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        <div className="p-1.5 bg-muted/30 rounded">
          <div className="text-[9px] text-muted-foreground mb-0.5">Evidence</div>
          <div className="flex items-center gap-1">
            <EvidenceIcon className={`h-3 w-3 ${evidenceConfig.color}`} />
            <span className="text-xs font-medium">{evidenceConfig.label}</span>
          </div>
        </div>
      </div>

      {/* Evidence Strength Bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">Evidence Strength</span>
          <span className="font-medium">{evidenceStrength}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${strengthConfig.color}`}
            style={{ width: strengthConfig.width }}
          />
        </div>
      </div>

      {/* Proposed Direction & Multiplier */}
      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Direction:</span>
          {proposedDirection ? (
            <Badge 
              variant="outline" 
              className={`text-[9px] px-1.5 py-0 ${
                proposedDirection === "long" 
                  ? "text-green-400 border-green-500/30" 
                  : "text-red-400 border-red-500/30"
              }`}
            >
              <span className="flex items-center gap-1">
                {proposedDirection === "long" ? (
                  <TrendingUp className="h-2.5 w-2.5" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" />
                )}
                {proposedDirection.toUpperCase()}
              </span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-muted/50">
              None
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Size:</span>
          <span className="font-mono font-medium">{positionMultiplier?.toFixed(2) || "1.00"}x</span>
        </div>
      </div>

      {/* Counter-Trend & Confidence */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Confidence:</span>
          <span className={`font-mono font-medium ${
            confidence >= 60 ? "text-green-400" : 
            confidence >= 40 ? "text-yellow-400" : 
            "text-red-400"
          }`}>
            {confidence?.toFixed(0) || 0}%
          </span>
        </div>
        
        {isCounterTrend && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-orange-400 border-orange-500/30">
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
            Counter-Trend
          </Badge>
        )}
      </div>

      {/* Tier Source (detailed) */}
      {tierSource && (
        <div className="text-[9px] text-muted-foreground pt-1 border-t border-border/30">
          <span className="font-mono">{tierSource}</span>
        </div>
      )}

      {/* Conflicts */}
      {conflictsWith && conflictsWith.length > 0 && (
        <div className="pt-1 border-t border-border/30">
          <div className="text-[9px] text-muted-foreground mb-1">Conflicts with:</div>
          <div className="flex flex-wrap gap-1">
            {conflictsWith.slice(0, 4).map((conflict, idx) => (
              <Badge 
                key={idx} 
                variant="outline" 
                className="text-[8px] px-1 py-0 text-orange-400 border-orange-500/30"
              >
                {conflict}
              </Badge>
            ))}
            {conflictsWith.length > 4 && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">
                +{conflictsWith.length - 4} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DirectionContextDisplay;
