import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'ikrivrudkvvnksollslh';
    const wsUrl = `wss://${projectId}.supabase.co/functions/v1/realtime-prices`;
    
    let ws: WebSocket;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const data: RealtimePrice = JSON.parse(event.data);
            setPrices((prev) => {
              const newPrices = new Map(prev);
              newPrices.set(data.symbol, data);
              return newPrices;
            });
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('WebSocket connection error');
          setConnected(false);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnected(false);
          
          // Reconnect after 5 seconds
          setTimeout(connect, 5000);
        };
      } catch (err) {
        console.error('Error creating WebSocket:', err);
        setError('Failed to create WebSocket connection');
      }
    };

    connect();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const getPrice = useCallback((symbol: string) => {
    return prices.get(symbol);
  }, [prices]);

  return { prices, connected, error, getPrice };
};
