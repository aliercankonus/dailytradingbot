import { useState, useEffect, useRef, useMemo } from 'react';
import { useWebSocketMonitor } from '@/contexts/WebSocketMonitorContext';

export interface MarketData {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  timestamp?: string;
}

export const useMarketData = (symbols?: string[]) => {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 2000;
  const CONNECTION_TIMEOUT = 15000;
  
  const monitor = useWebSocketMonitor();
  const connectionId = useRef(`market-data-${Date.now()}`);

  // Stabilize symbols array
  const symbolsKey = useMemo(() => JSON.stringify(symbols?.sort()), [symbols]);

  // Register connection on mount only
  useEffect(() => {
    monitor.registerConnection(connectionId.current, 'Market Data');
    return () => monitor.unregisterConnection(connectionId.current);
  }, []);

  useEffect(() => {
    const symbolsList = symbols && symbols.length > 0 ? symbols : [];
    let cancelled = false;
    
    const connectWebSocket = () => {
      if (cancelled || isConnectingRef.current) return;
      
      try {
          isConnectingRef.current = true;
          
          // Clear any existing timeouts
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
          }

        // Close existing connection properly
        if (wsRef.current) {
          const oldWs = wsRef.current;
          wsRef.current = null;
          if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
            oldWs.close();
          }
        }

        const symbolsParam = encodeURIComponent(JSON.stringify(symbolsList));
        const wsUrl = `wss://ikrivrudkvvnksollslh.supabase.co/functions/v1/realtime-market-data?symbols=${symbolsParam}`;
        
        console.log(`[MarketData] Connecting (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Set connection timeout
        connectionTimeoutRef.current = window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.error('[MarketData] Connection timeout');
            ws.close();
            setError('Connection timeout - retrying...');
            setConnected(false);
          }
        }, CONNECTION_TIMEOUT);

        ws.onopen = () => {
          console.log('[MarketData] WebSocket connected successfully');
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
          }
          isConnectingRef.current = false;
          monitor.updateConnectionStatus(connectionId.current, 'connected');
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'connected') {
              console.log('Successfully connected to market data stream');
              setLoading(false);
            } else if (message.type === 'price_update') {
              // Update the data for the specific symbol
              setData(prevData => {
                const existingIndex = prevData.findIndex(d => d.symbol === message.data.symbol);
                
                if (existingIndex >= 0) {
                  // Update existing symbol
                  const newData = [...prevData];
                  newData[existingIndex] = message.data;
                  return newData;
                } else {
                  // Add new symbol
                  return [...prevData, message.data];
                }
              });
              setLoading(false);
            } else if (message.type === 'error') {
              console.error('Market data error:', message.message);
              setError(message.message);
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('[MarketData] WebSocket error:', event);
          isConnectingRef.current = false;
          const errorMessage = reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS 
            ? 'Unable to connect to market data. Please check your connection.'
            : 'Connection error - reconnecting...';
          monitor.recordError(connectionId.current, errorMessage);
          setError(errorMessage);
          setConnected(false);
        };

        ws.onclose = (event) => {
          console.log(`[MarketData] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
          isConnectingRef.current = false;
          monitor.updateConnectionStatus(connectionId.current, 'disconnected');
          setConnected(false);
          
          // Clean up intervals
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
          }
          
          if (cancelled) return;
          
          // Only reconnect if not normal closure
          if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
            console.log(`[MarketData] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
            monitor.recordReconnectAttempt(connectionId.current);
            monitor.updateConnectionStatus(connectionId.current, 'reconnecting');
            
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setError('Connection lost. Please refresh the page to reconnect.');
            setLoading(false);
          }
        };

      } catch (err) {
        console.error('[MarketData] Error setting up WebSocket:', err);
        isConnectingRef.current = false;
        setError('Failed to initialize market data connection');
        setLoading(false);
        setConnected(false);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      cancelled = true;
      isConnectingRef.current = false;
      console.log('[MarketData] Cleaning up WebSocket connection');
      
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounted');
        }
      }
    };
  }, [symbolsKey]);

  return { data, loading, error, connected };
};
