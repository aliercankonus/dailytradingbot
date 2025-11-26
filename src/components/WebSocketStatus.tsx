import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface WebSocketStatusProps {
  connected: boolean;
  error?: string | null;
  showText?: boolean;
}

export const WebSocketStatus = ({ connected, error, showText = true }: WebSocketStatusProps) => {
  if (error) {
    return (
      <Badge variant="destructive" className="gap-2" title={error}>
        <WifiOff className="h-3 w-3" />
        {showText && <span>Error</span>}
      </Badge>
    );
  }

  if (connected) {
    return (
      <Badge variant="default" className="gap-2 bg-success" title="Connected to live data">
        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
        {showText && <span>Live</span>}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-2" title="Connecting to server...">
      <RefreshCw className="h-3 w-3 animate-spin" />
      {showText && <span>Connecting...</span>}
    </Badge>
  );
};
