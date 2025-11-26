import { useState, useEffect, useRef } from 'react';

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
  const pingIntervalRef = useRef<number | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000;
  const CONNECTION_TIMEOUT = 10000;
  const PING_INTERVAL = 30000;

  useEffect(() => {
    const symbolsList = symbols && symbols.length > 0 ? symbols : [];
    
    const connectWebSocket = () => {
      try {
        // Clear any existing timeouts
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
        }

        const symbolsParam = encodeURIComponent(JSON.stringify(symbolsList));
        const wsUrl = `wss://ikrivrudkvvnksollslh.supabase.co/functions/v1/realtime-market-data?symbols=${symbolsParam}`;
        
        console.log(`[MarketData] Connecting (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS}):`, wsUrl);
        
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
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;

          // Start ping interval to keep connection alive
          pingIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, PING_INTERVAL);
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
          const errorMessage = reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS 
            ? 'Unable to connect to market data. Please check your connection.'
            : 'Connection error - reconnecting...';
          setError(errorMessage);
          setConnected(false);
        };

        ws.onclose = (event) => {
          console.log(`[MarketData] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
          setConnected(false);
          
          // Clean up intervals
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
          }
          
          // Attempt reconnection with exponential backoff
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
            console.log(`[MarketData] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
            
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else {
            setError('Connection lost. Please refresh the page to reconnect.');
            setLoading(false);
          }
        };

      } catch (err) {
        console.error('[MarketData] Error setting up WebSocket:', err);
        setError('Failed to initialize market data connection');
        setLoading(false);
        setConnected(false);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      console.log('[MarketData] Cleaning up WebSocket connection');
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [symbols]);

  return { data, loading, error, connected };
};
