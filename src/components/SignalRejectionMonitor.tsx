import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Activity, 
  Zap, 
  Target,
  Clock,
  Filter,
  BarChart3,
  ArrowUpCircle,
  ArrowDownCircle,
  Ban,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { useBlockedSignals, BlockedSignal, MoveZoneDetails } from "@/hooks/useBlockedSignals";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo } from "react";

type PageSize = 10 | 25 | 50;
type TimeRange = "15m" | "30m" | "1h";
type GateFilter = "all" | "momentum" | "regime" | "direction" | "htf" | "adx";

// Gate classification for filtering
const classifyGate = (reason: string): GateFilter => {
  const r = reason.toLowerCase();
  if (r.includes("momentum") || r.includes("macd")) return "momentum";
  if (r.includes("regime") || r.includes("ranging")) return "regime";
  if (r.includes("direction") || r.includes("no_clear")) return "direction";
  if (r.includes("htf") || r.includes("4h") || r.includes("aligned")) return "htf";
  if (r.includes("adx")) return "adx";
  return "all";
};

// Gate severity for visual styling
type GateSeverity = "veto" | "block" | "reduce" | "info";

const getGateSeverity = (reason: string, fs: BlockedSignal["filters_status"]): GateSeverity => {
  const r = reason.toLowerCase();
  // Vetoes (absolute blocks)
  if (r.includes("tier_0") || r.includes("deep_") || r.includes("veto") || r.includes("hard_floor")) return "veto";
  // Hard blocks
  if (r.includes("no_clear_direction") || r.includes("momentum_direction") || r.includes("adx_too_low")) return "block";
  // Size reductions (soft gates)
  if (fs?.positionMultiplier && fs.positionMultiplier < 1.0) return "reduce";
  if (r.includes("reduce") || r.includes("soft") || r.includes("zone")) return "reduce";
  return "info";
};

const getSeverityStyles = (severity: GateSeverity) => {
  switch (severity) {
    case "veto": return { badge: "bg-red-500/20 text-red-400 border-red-500/40", row: "border-l-2 border-l-red-500" };
    case "block": return { badge: "bg-orange-500/20 text-orange-400 border-orange-500/40", row: "border-l-2 border-l-orange-500" };
    case "reduce": return { badge: "bg-amber-500/20 text-amber-400 border-amber-500/40", row: "border-l-2 border-l-amber-500" };
    case "info": return { badge: "bg-blue-500/20 text-blue-400 border-blue-500/40", row: "border-l-2 border-l-blue-500" };
  }
};

// MR Status derivation
type MRStatus = "NONE" | "EXTREME" | "MODERATE" | "STRONG";

const deriveMRStatus = (fs: BlockedSignal["filters_status"]): MRStatus => {
  if (!fs?.meanReversionDetected) return "NONE";
  const score = fs?.meanReversionScore ?? 0;
  if (score >= 80) return "EXTREME";
  if (score >= 60) return "STRONG";
  if (score >= 40) return "MODERATE";
  return "NONE";
};

// Bypass eligibility check
const checkBypassEligible = (fs: BlockedSignal["filters_status"]): boolean => {
  // Check if any override was active
  if (fs?.squeezeCheck?.wouldPass) return true;
  if (fs?.earlyIgnitionCheck?.wouldPass) return true;
  if (fs?.meanReversionAllowed) return true;
  if (fs?.overrideReason) return true;
  return false;
};

// Extract values with proper precision
const extractNumeric = (value: unknown, decimals: number = 1): string => {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || isNaN(num)) return "-";
  return num.toFixed(decimals);
};

const ADXSlopeIndicator = ({ slope }: { slope: number | undefined }) => {
  if (slope === undefined || typeof slope !== "number") return <span className="text-muted-foreground">-</span>;
  
  const isRising = slope > 0.05;
  const isDeclining = slope < -0.05;
  
  return (
    <div className="flex items-center gap-1">
      {isRising ? (
        <TrendingUp className="h-3 w-3 text-green-400" />
      ) : isDeclining ? (
        <TrendingDown className="h-3 w-3 text-red-400" />
      ) : (
        <Minus className="h-3 w-3 text-yellow-400" />
      )}
      <span className={`font-mono text-xs ${isRising ? "text-green-400" : isDeclining ? "text-red-400" : "text-yellow-400"}`}>
        {slope >= 0 ? "+" : ""}{slope.toFixed(2)}
      </span>
    </div>
  );
};

const MomentumIndicator = ({ score, direction }: { score: number | undefined; direction: string | undefined }) => {
  if (score === undefined || typeof score !== "number") return <span className="text-muted-foreground">-</span>;
  
  const isBullish = score > 15 || direction === "bullish";
  const isBearish = score < -15 || direction === "bearish";
  
  return (
    <div className="flex items-center gap-1">
      {isBullish ? (
        <ArrowUpCircle className="h-3 w-3 text-green-400" />
      ) : isBearish ? (
        <ArrowDownCircle className="h-3 w-3 text-red-400" />
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={`font-mono text-xs ${isBullish ? "text-green-400" : isBearish ? "text-red-400" : "text-muted-foreground"}`}>
        {score}
      </span>
    </div>
  );
};

const StochRSIDisplay = ({ fs, td }: { fs: BlockedSignal["filters_status"]; td: BlockedSignal["trend_data"] }) => {
  // Extract StochRSI values from multiple possible locations with proper typing
  const stochRsi4h = td?.stochasticRsi?.["4h"] as { k?: number } | undefined;
  const stochRsi1h = td?.stochasticRsi?.["1h"] as { k?: number } | undefined;
  const fsStochRsi4h = fs?.stochRsi4h as { k?: number } | undefined;
  const fsStochRsi1h = fs?.stochRsi1h as { k?: number } | undefined;
  
  // Safely extract and coerce to number
  const rawK4h = fs?.stochRsiK4h ?? fsStochRsi4h?.k ?? stochRsi4h?.k;
  const rawK1h = fs?.stochRsiK ?? fsStochRsi1h?.k ?? stochRsi1h?.k;
  
  const k4h = typeof rawK4h === 'number' ? rawK4h : typeof rawK4h === 'string' ? parseFloat(rawK4h) : null;
  const k1h = typeof rawK1h === 'number' ? rawK1h : typeof rawK1h === 'string' ? parseFloat(rawK1h) : null;
  
  const validK4h = k4h !== null && !isNaN(k4h) ? k4h : null;
  const validK1h = k1h !== null && !isNaN(k1h) ? k1h : null;
  
  if (validK4h === null && validK1h === null) return <span className="text-muted-foreground">-</span>;
  
  const formatK = (k: number, tf: string) => {
    const isExtreme = k <= 10 || k >= 90;
    const isWarning = k <= 20 || k >= 80;
    return (
      <span className={`font-mono ${isExtreme ? "text-red-400" : isWarning ? "text-amber-400" : "text-foreground"}`}>
        {tf}: {k.toFixed(1)}
      </span>
    );
  };
  
  return (
    <div className="flex flex-col text-[10px]">
      {validK4h !== null && formatK(validK4h, "4H")}
      {validK1h !== null && formatK(validK1h, "1H")}
    </div>
  );
};

const MRStatusBadge = ({ status }: { status: MRStatus }) => {
  const styles = {
    NONE: "bg-muted/30 text-muted-foreground",
    MODERATE: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    STRONG: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    EXTREME: "bg-pink-500/20 text-pink-400 border-pink-500/40 ring-1 ring-pink-500/30",
  };
  
  if (status === "NONE") {
    return <span className="text-[10px] text-muted-foreground">-</span>;
  }
  
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${styles[status]}`}>
      {status}
    </Badge>
  );
};

const BypassBadge = ({ eligible }: { eligible: boolean }) => {
  return eligible ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
  );
};

const DirectionBadge = ({ direction }: { direction: string | undefined }) => {
  if (!direction) return <span className="text-muted-foreground">-</span>;
  
  const isLong = direction.toLowerCase() === "long";
  const isShort = direction.toLowerCase() === "short";
  
  return (
    <Badge 
      variant="outline" 
      className={`text-[9px] px-1.5 py-0 ${
        isLong ? "bg-green-500/20 text-green-400 border-green-500/40" : 
        isShort ? "bg-red-500/20 text-red-400 border-red-500/40" : 
        "bg-muted/30 text-muted-foreground"
      }`}
    >
      {direction.toUpperCase()}
    </Badge>
  );
};

export const SignalRejectionMonitor = () => {
  const { data: blockedSignals, isLoading } = useBlockedSignals(100);
  const [timeRange, setTimeRange] = useState<TimeRange>("30m");
  const [gateFilter, setGateFilter] = useState<GateFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  
  // Filter signals by time range
  const filteredByTime = useMemo(() => {
    if (!blockedSignals) return [];
    
    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
    };
    
    return blockedSignals.filter(s => {
      const checkedAt = new Date(s.checked_at).getTime();
      return now - checkedAt <= ranges[timeRange];
    });
  }, [blockedSignals, timeRange]);
  
  // Filter by gate type
  const filteredSignals = useMemo(() => {
    if (gateFilter === "all") return filteredByTime;
    return filteredByTime.filter(s => classifyGate(s.rejection_reason) === gateFilter);
  }, [filteredByTime, gateFilter]);
  
  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredSignals.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedSignals = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredSignals.slice(startIndex, startIndex + pageSize);
  }, [filteredSignals, safeCurrentPage, pageSize]);
  
  // Reset to page 1 when filters or page size change
  useMemo(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [filteredSignals.length, currentPage, totalPages, pageSize]);
  
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value) as PageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };
  
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, safeCurrentPage - 1); i <= Math.min(totalPages - 1, safeCurrentPage + 1); i++) {
        pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };
  
  // Statistics
  const stats = useMemo(() => {
    const total = filteredByTime.length;
    const byGate = {
      momentum: filteredByTime.filter(s => classifyGate(s.rejection_reason) === "momentum").length,
      direction: filteredByTime.filter(s => classifyGate(s.rejection_reason) === "direction").length,
      adx: filteredByTime.filter(s => classifyGate(s.rejection_reason) === "adx").length,
      htf: filteredByTime.filter(s => classifyGate(s.rejection_reason) === "htf").length,
      regime: filteredByTime.filter(s => classifyGate(s.rejection_reason) === "regime").length,
    };
    const vetoes = filteredByTime.filter(s => getGateSeverity(s.rejection_reason, s.filters_status) === "veto").length;
    const blocks = filteredByTime.filter(s => getGateSeverity(s.rejection_reason, s.filters_status) === "block").length;
    const reductions = filteredByTime.filter(s => getGateSeverity(s.rejection_reason, s.filters_status) === "reduce").length;
    
    return { total, byGate, vetoes, blocks, reductions };
  }, [filteredByTime]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Signal Rejection Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading rejection data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Signal Rejection Monitor
            </CardTitle>
            <CardDescription>Comprehensive view of blocked signals with gate attribution</CardDescription>
          </div>
          
          {/* Statistics Badges */}
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                    <Ban className="h-3 w-3 mr-1" />
                    {stats.vetoes} Vetoes
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Absolute blocks (Tier 0, no exceptions)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
                    <XCircle className="h-3 w-3 mr-1" />
                    {stats.blocks} Blocks
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Hard gate rejections</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                    <Activity className="h-3 w-3 mr-1" />
                    {stats.reductions} Reduced
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Position size reductions (soft gates)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-4 pt-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <TabsList className="h-7">
                <TabsTrigger value="15m" className="text-xs px-2 py-1">15m</TabsTrigger>
                <TabsTrigger value="30m" className="text-xs px-2 py-1">30m</TabsTrigger>
                <TabsTrigger value="1h" className="text-xs px-2 py-1">1h</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Tabs value={gateFilter} onValueChange={(v) => setGateFilter(v as GateFilter)}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2 py-1">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="momentum" className="text-xs px-2 py-1">Momentum ({stats.byGate.momentum})</TabsTrigger>
                <TabsTrigger value="direction" className="text-xs px-2 py-1">Direction ({stats.byGate.direction})</TabsTrigger>
                <TabsTrigger value="adx" className="text-xs px-2 py-1">ADX ({stats.byGate.adx})</TabsTrigger>
                <TabsTrigger value="htf" className="text-xs px-2 py-1">HTF ({stats.byGate.htf})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredSignals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No rejections in the selected time range and filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Symbol</TableHead>
                    <TableHead className="w-[180px]">Gate</TableHead>
                    <TableHead className="w-[70px]">Direction</TableHead>
                    <TableHead className="w-[60px]">ADX</TableHead>
                    <TableHead className="w-[80px]">ADX Slope</TableHead>
                    <TableHead className="w-[80px]">Momentum</TableHead>
                    <TableHead className="w-[80px]">StochRSI</TableHead>
                    <TableHead className="w-[70px]">MR Status</TableHead>
                    <TableHead className="w-[50px] text-center">Bypass</TableHead>
                    <TableHead className="w-[80px]">Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSignals.map((signal) => {
                    const fs = signal.filters_status;
                    const td = signal.trend_data;
                    const severity = getGateSeverity(signal.rejection_reason, fs);
                    const styles = getSeverityStyles(severity);
                    const mrStatus = deriveMRStatus(fs);
                    const bypassEligible = checkBypassEligible(fs);
                    
                    // Extract values with fallbacks
                    const adx = fs?.adx ?? td?.volatility?.adx;
                    const adxSlope = fs?.adxSlope ?? td?.volatility?.adxSlope;
                    const momentumScore = fs?.momentumScore ?? 0;
                    const momentumDirection = fs?.momentumDirection ?? td?.momentum?.direction;
                    const direction = fs?.derivedDirection ?? fs?.direction ?? td?.direction;
                    
                    return (
                      <TableRow key={signal.id} className={styles.row}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{signal.symbol}</span>
                            <Badge variant="outline" className={`text-[8px] px-1 py-0 w-fit ${styles.badge}`}>
                              {severity.toUpperCase()}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs truncate max-w-[170px] block cursor-help">
                                  {signal.rejection_reason?.replace(/\s*\([^)]*\)/g, '').slice(0, 50)}
                                  {signal.rejection_reason && signal.rejection_reason.length > 50 && "..."}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[300px]">
                                <p className="text-xs">{signal.rejection_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <DirectionBadge direction={direction} />
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono text-xs ${
                            adx && adx >= 25 ? "text-green-400" : 
                            adx && adx >= 20 ? "text-yellow-400" : 
                            "text-red-400"
                          }`}>
                            {extractNumeric(adx, 1)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ADXSlopeIndicator slope={adxSlope} />
                        </TableCell>
                        <TableCell>
                          <MomentumIndicator score={momentumScore} direction={momentumDirection} />
                        </TableCell>
                        <TableCell>
                          <StochRSIDisplay fs={fs} td={td} />
                        </TableCell>
                        <TableCell>
                          <MRStatusBadge status={mrStatus} />
                        </TableCell>
                        <TableCell className="text-center">
                          <BypassBadge eligible={bypassEligible} />
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(signal.checked_at), { addSuffix: true })}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">
                  Showing {((safeCurrentPage - 1) * pageSize) + 1}-{Math.min(safeCurrentPage * pageSize, filteredSignals.length)} of {filteredSignals.length} rejections
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Per page:</span>
                  <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="h-7 w-[70px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={safeCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {getPageNumbers().map((page, idx) => (
                      <PaginationItem key={idx}>
                        {page === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={safeCurrentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={safeCurrentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SignalRejectionMonitor;
