import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingDown, TrendingUp, Activity, Minimize2 } from "lucide-react";
import { useSignalRejections } from "@/hooks/useSignalRejections";
import { formatDistanceToNow } from "date-fns";

interface SignalRejection {
  id: string;
  symbol: string;
  checked_at: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}

export const SignalRejectionReasons = () => {
  const { rejections, loading } = useSignalRejections();

  const getReasonIcon = (reason: string) => {
    if (reason.includes('timeframe')) return <TrendingDown className="h-4 w-4" />;
    if (reason.includes('momentum')) return <Activity className="h-4 w-4" />;
    if (reason.includes('ranging')) return <Minimize2 className="h-4 w-4" />;
    if (reason.includes('pullback')) return <TrendingUp className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };

  const getFilterDetails = (filtersStatus: any) => {
    const details = [];
    
    if (filtersStatus?.aligned === false) {
      details.push(`4h: ${filtersStatus.trend4h}, 1h: ${filtersStatus.trend1h}`);
    }
    
    if (filtersStatus?.momentumConfirms === false) {
      details.push(
        `15m: ${filtersStatus.consecutive15mBullish || 0}bull/${filtersStatus.consecutive15mBearish || 0}bear`,
        `30m: ${filtersStatus.consecutive30mBullish || 0}bull/${filtersStatus.consecutive30mBearish || 0}bear`
      );
    }
    
    if (filtersStatus?.inPullback === false && filtersStatus.pullbackPercent !== undefined) {
      details.push(`Pullback: ${filtersStatus.pullbackPercent.toFixed(1)}%`);
    }
    
    return details.length > 0 ? details.join(' | ') : filtersStatus?.required || 'Check filters';
  };

  const getRejectionDetails = (rejection: SignalRejection) => {
    const details = [];
    const fs = rejection.filters_status;
    
    if (!fs) return 'No data';
    
    // Timeframes not aligned with no divergence opportunity
    if (rejection.rejection_reason.includes('timeframes not aligned, no divergence opportunity')) {
      if (fs.trend4h || fs.trend1h) {
        details.push(`4h: ${fs.trend4h || 'unknown'}, 1h: ${fs.trend1h || 'unknown'}`);
      }
      
      // Add divergence result
      const divergenceStatus = fs.divergenceAllowed === false ? 'no divergence' : 'divergence allowed';
      details.push(divergenceStatus);
      
      // Add ranging market status if present
      if (fs.isRanging === true) {
        details.push('ranging market');
      }
    }
    // Other timeframe alignment issues
    else if (rejection.rejection_reason.includes('timeframes NOT aligned') || rejection.rejection_reason.includes('timeframe')) {
      if (fs.trend4h || fs.trend1h) {
        details.push(`4H: ${fs.trend4h || 'unknown'} | 1H: ${fs.trend1h || 'unknown'}`);
      }
    }
    
    // Pullback issues
    if (rejection.rejection_reason.includes('pullback')) {
      if (fs.pullbackPercent !== undefined && fs.pullbackPercent !== null) {
        details.push(`Retracement: ${fs.pullbackPercent.toFixed(1)}%`);
      }
    }
    
    // Momentum issues
    if (rejection.rejection_reason.includes('momentum')) {
      const m15Bullish = fs.consecutive15mBullish || 0;
      const m15Bearish = fs.consecutive15mBearish || 0;
      const m30Bullish = fs.consecutive30mBullish || 0;
      const m30Bearish = fs.consecutive30mBearish || 0;
      
      details.push(`15m: ${m15Bullish}🟢/${m15Bearish}🔴 | 30m: ${m30Bullish}🟢/${m30Bearish}🔴`);
    }
    
    // Ranging market
    if (rejection.rejection_reason.includes('ranging') && fs.isRanging === true) {
      details.push(`Market: Ranging`);
    }
    
    return details.length > 0 ? details.join(' | ') : 'No specific values';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>Loading rejection data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (rejections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signal Rejection Reasons</CardTitle>
          <CardDescription>No signals rejected in the last 30 minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            All symbols are either generating signals or haven't been analyzed yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          Signal Rejection Reasons (Last 30 Minutes)
        </CardTitle>
        <CardDescription>
          Why signals are not being generated for each symbol
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Filter Details</TableHead>
              <TableHead>Rejection Values</TableHead>
              <TableHead>Last Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rejections.map((rejection) => (
              <TableRow key={rejection.id}>
                <TableCell className="font-medium">{rejection.symbol}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getReasonIcon(rejection.rejection_reason)}
                    <span className="text-sm">{rejection.rejection_reason}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">
                    {getFilterDetails(rejection.filters_status)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-medium text-destructive">
                    {getRejectionDetails(rejection)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {formatDistanceToNow(new Date(rejection.checked_at), { addSuffix: true })}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
