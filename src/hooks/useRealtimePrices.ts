import { useState, useEffect, useCallback, useRef } from 'react';

export interface RealtimePrice {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  volume: string;
  timestamp: number;
}

export const useRealtimePrices = () => {
  const [prices, setPrices] = useState<Map<string, RealtimePrice>>(new Map());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  useEffect(() => {
    const projectId = 'ikrivrudkvvnksollslh';
    const wsUrl = `wss://${projectId}.supabase.co/functions/v1/realtime-prices`;
    
    const connect = () => {
      try {
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
        }

        console.log('Connecting to realtime prices:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected to realtime prices');
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle different message types
            if (data.type === 'connected') {
              console.log('Successfully connected to realtime prices');
            } else if (data.type === 'error') {
              console.error('Error from server:', data.message);
              setError(data.message);
            } else if (data.type === 'heartbeat') {
              // Respond to heartbeat
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
              }
            } else if (data.symbol) {
              // Price update
              setPrices((prev) => {
                const newPrices = new Map(prev);
                newPrices.set(data.symbol, data);
                return newPrices;
              });
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setError('WebSocket connection error');
          setConnected(false);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected from realtime prices');
          setConnected(false);
          
          // Attempt reconnection
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            console.log(`Reconnecting... Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
            
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect();
            }, RECONNECT_DELAY);
          } else {
            setError('Unable to maintain connection. Please refresh the page.');
          }
        };
      } catch (err) {
        console.error('Error creating WebSocket:', err);
        setError('Failed to create WebSocket connection');
      }
    };

    connect();

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const getPrice = useCallback((symbol: string) => {
    return prices.get(symbol);
  }, [prices]);

  return { prices, connected, error, getPrice };
};
