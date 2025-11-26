import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface WebSocketMetrics {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
  connectedAt: number | null;
  uptime: number;
  reconnectAttempts: number;
  totalReconnects: number;
  latency: number | null;
  lastMessageAt: number | null;
  messageCount: number;
  errorCount: number;
  lastError: string | null;
}

interface WebSocketMonitorContextType {
  connections: Map<string, WebSocketMetrics>;
  registerConnection: (id: string, name: string) => void;
  updateConnectionStatus: (id: string, status: WebSocketMetrics['status']) => void;
  recordReconnectAttempt: (id: string) => void;
  recordMessage: (id: string) => void;
  recordLatency: (id: string, latency: number) => void;
  recordError: (id: string, error: string) => void;
  unregisterConnection: (id: string) => void;
}

const WebSocketMonitorContext = createContext<WebSocketMonitorContextType | null>(null);

export const WebSocketMonitorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connections, setConnections] = useState<Map<string, WebSocketMetrics>>(new Map());

  const registerConnection = useCallback((id: string, name: string) => {
    setConnections(prev => {
      const next = new Map(prev);
      next.set(id, {
        id,
        name,
        status: 'disconnected',
        connectedAt: null,
        uptime: 0,
        reconnectAttempts: 0,
        totalReconnects: 0,
        latency: null,
        lastMessageAt: null,
        messageCount: 0,
        errorCount: 0,
        lastError: null,
      });
      return next;
    });
  }, []);

  const updateConnectionStatus = useCallback((id: string, status: WebSocketMetrics['status']) => {
    setConnections(prev => {
      const next = new Map(prev);
      const conn = next.get(id);
      if (conn) {
        next.set(id, {
          ...conn,
          status,
          connectedAt: status === 'connected' ? Date.now() : conn.connectedAt,
          reconnectAttempts: status === 'connected' ? 0 : conn.reconnectAttempts,
          totalReconnects: status === 'connected' && conn.status !== 'connected' 
            ? conn.totalReconnects + 1 
            : conn.totalReconnects,
        });
      }
      return next;
    });
  }, []);

  const recordReconnectAttempt = useCallback((id: string) => {
    setConnections(prev => {
      const next = new Map(prev);
      const conn = next.get(id);
      if (conn) {
        next.set(id, {
          ...conn,
          reconnectAttempts: conn.reconnectAttempts + 1,
        });
      }
      return next;
    });
  }, []);

  const recordMessage = useCallback((id: string) => {
    setConnections(prev => {
      const next = new Map(prev);
      const conn = next.get(id);
      if (conn) {
        next.set(id, {
          ...conn,
          lastMessageAt: Date.now(),
          messageCount: conn.messageCount + 1,
        });
      }
      return next;
    });
  }, []);

  const recordLatency = useCallback((id: string, latency: number) => {
    setConnections(prev => {
      const next = new Map(prev);
      const conn = next.get(id);
      if (conn) {
        next.set(id, {
          ...conn,
          latency,
        });
      }
      return next;
    });
  }, []);

  const recordError = useCallback((id: string, error: string) => {
    setConnections(prev => {
      const next = new Map(prev);
      const conn = next.get(id);
      if (conn) {
        next.set(id, {
          ...conn,
          errorCount: conn.errorCount + 1,
          lastError: error,
        });
      }
      return next;
    });
  }, []);

  const unregisterConnection = useCallback((id: string) => {
    setConnections(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Update uptime every second for connected connections
  useEffect(() => {
    const interval = setInterval(() => {
      setConnections(prev => {
        const next = new Map(prev);
        let hasUpdates = false;
        
        next.forEach((conn, id) => {
          if (conn.status === 'connected' && conn.connectedAt) {
            const uptime = Math.floor((Date.now() - conn.connectedAt) / 1000);
            if (uptime !== conn.uptime) {
              next.set(id, { ...conn, uptime });
              hasUpdates = true;
            }
          }
        });
        
        return hasUpdates ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <WebSocketMonitorContext.Provider
      value={{
        connections,
        registerConnection,
        updateConnectionStatus,
        recordReconnectAttempt,
        recordMessage,
        recordLatency,
        recordError,
        unregisterConnection,
      }}
    >
      {children}
    </WebSocketMonitorContext.Provider>
  );
};

export const useWebSocketMonitor = () => {
  const context = useContext(WebSocketMonitorContext);
  if (!context) {
    throw new Error('useWebSocketMonitor must be used within WebSocketMonitorProvider');
  }
  return context;
};
