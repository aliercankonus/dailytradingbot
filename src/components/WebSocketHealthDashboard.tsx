import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWebSocketMonitor } from "@/contexts/WebSocketMonitorContext";
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock, 
  Zap, 
  MessageSquare,
  AlertTriangle 
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const WebSocketHealthDashboard = () => {
  const { connections } = useWebSocketMonitor();

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-muted-foreground';
    if (latency < 100) return 'text-green-500';
    if (latency < 300) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLatencyProgress = (latency: number | null) => {
    if (latency === null) return 0;
    // Scale: 0-500ms mapped to 0-100%
    return Math.min((latency / 500) * 100, 100);
  };

  const connectionsArray = Array.from(connections.values());
  const connectedCount = connectionsArray.filter(c => c.status === 'connected').length;
  const reconnectingCount = connectionsArray.filter(c => c.status === 'reconnecting').length;
  const totalMessages = connectionsArray.reduce((sum, c) => sum + c.messageCount, 0);
  const totalErrors = connectionsArray.reduce((sum, c) => sum + c.errorCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          WebSocket Connection Monitor
        </CardTitle>
        <CardDescription>
          Real-time health metrics for all WebSocket connections
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              Active Connections
            </div>
            <div className="text-2xl font-bold">{connectionsArray.length}</div>
            <div className="text-xs text-muted-foreground">
              {connectedCount} connected
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Reconnecting
            </div>
            <div className="text-2xl font-bold">{reconnectingCount}</div>
            <div className="text-xs text-muted-foreground">
              {reconnectingCount === 0 ? 'All stable' : 'In progress'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Total Messages
            </div>
            <div className="text-2xl font-bold">{totalMessages}</div>
            <div className="text-xs text-muted-foreground">
              All connections
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Total Errors
            </div>
            <div className={`text-2xl font-bold ${totalErrors > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {totalErrors}
            </div>
            <div className="text-xs text-muted-foreground">
              {totalErrors === 0 ? 'No errors' : 'See details'}
            </div>
          </div>
        </div>

        {/* Connection Details */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Connection Details</h3>
          {connectionsArray.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <WifiOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No active WebSocket connections</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connectionsArray.map((conn) => (
                <Card key={conn.id} className="p-4">
                  <div className="space-y-3">
                    {/* Connection Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{conn.name}</h4>
                        <Badge 
                          variant={
                            conn.status === 'connected' ? 'default' :
                            conn.status === 'reconnecting' ? 'secondary' :
                            'destructive'
                          }
                        >
                          {conn.status === 'connected' && <Wifi className="h-3 w-3 mr-1" />}
                          {conn.status === 'reconnecting' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
                          {conn.status === 'disconnected' && <WifiOff className="h-3 w-3 mr-1" />}
                          {conn.status}
                        </Badge>
                      </div>
                      {conn.status === 'connected' && (
                        <div className="flex items-center gap-1 text-xs text-green-500">
                          <Activity className="h-3 w-3" />
                          Live
                        </div>
                      )}
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <Clock className="h-3 w-3" />
                          Uptime
                        </div>
                        <div className="font-medium">
                          {conn.status === 'connected' ? formatUptime(conn.uptime) : 'N/A'}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <Zap className="h-3 w-3" />
                          Latency
                        </div>
                        <div className={`font-medium ${getLatencyColor(conn.latency)}`}>
                          {conn.latency !== null ? `${conn.latency}ms` : 'N/A'}
                        </div>
                        {conn.latency !== null && (
                          <Progress 
                            value={getLatencyProgress(conn.latency)} 
                            className="h-1 mt-1"
                          />
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <RefreshCw className="h-3 w-3" />
                          Reconnects
                        </div>
                        <div className="font-medium">
                          {conn.reconnectAttempts > 0 ? (
                            <span className="text-yellow-500">
                              {conn.reconnectAttempts} current
                            </span>
                          ) : (
                            `${conn.totalReconnects} total`
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <MessageSquare className="h-3 w-3" />
                          Messages
                        </div>
                        <div className="font-medium">
                          {conn.messageCount}
                          {conn.lastMessageAt && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({Math.floor((Date.now() - conn.lastMessageAt) / 1000)}s ago)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Errors */}
                    {conn.errorCount > 0 && (
                      <div className="pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <div>
                            <span className="font-medium text-red-500">
                              {conn.errorCount} error{conn.errorCount !== 1 ? 's' : ''}
                            </span>
                            {conn.lastError && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Last: {conn.lastError}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
