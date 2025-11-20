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

  const getRejectionDetails = (rejection: SignalRejection) => {
    const details = [];
    const fs = rejection.filters_status;
    
    // Higher timeframes not aligned
    if (rejection.rejection_reason.includes('timeframes NOT aligned') || rejection.rejection_reason.includes('timeframe')) {
      details.push(`4H: ${fs.trend4h || 'N/A'} | 1H: ${fs.trend1h || 'N/A'}`);
    }
    
    // Pullback issues
    if (rejection.rejection_reason.includes('pullback') || fs.inPullback === false) {
      details.push(`Retracement: ${fs.pullbackPercent !== undefined ? fs.pullbackPercent.toFixed(1) + '%' : 'N/A'}`);
    }
    
    // Momentum issues
    if (rejection.rejection_reason.includes('momentum') || fs.momentumConfirms === false) {
      details.push(
        `15m: ${fs.consecutive15mBullish || 0}🟢/${fs.consecutive15mBearish || 0}🔴`,
        `30m: ${fs.consecutive30mBullish || 0}🟢/${fs.consecutive30mBearish || 0}🔴`
      );
    }
    
    // Ranging market
    if (rejection.rejection_reason.includes('ranging') || fs.isRanging === true) {
      details.push(`Market: Ranging`);
    }
    
    return details.length > 0 ? details.join(' | ') : 'No specific data';
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
                  <div className="text-xs font-medium">
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
