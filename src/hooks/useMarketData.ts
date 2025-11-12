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
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  useEffect(() => {
    const symbolsList = symbols || ['BTCUSDT', 'ETHUSDT'];
    
    const connectWebSocket = () => {
      try {
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
        }

        const symbolsParam = encodeURIComponent(JSON.stringify(symbolsList));
        const wsUrl = `wss://ikrivrudkvvnksollslh.supabase.co/functions/v1/realtime-market-data?symbols=${symbolsParam}`;
        
        console.log('Connecting to market data WebSocket:', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('Market data WebSocket connected');
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
          console.error('WebSocket error:', event);
          setError('Failed to connect to market data');
          setConnected(false);
        };

        ws.onclose = () => {
          console.log('Market data WebSocket closed');
          setConnected(false);
          
          // Attempt reconnection
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            console.log(`Reconnecting... Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
            
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connectWebSocket();
            }, RECONNECT_DELAY);
          } else {
            setError('Unable to maintain connection to market data. Please refresh the page.');
          }
        };

        // Send periodic ping to keep connection alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Ping every 30 seconds

        return () => {
          clearInterval(pingInterval);
        };
      } catch (err) {
        console.error('Error setting up WebSocket:', err);
        setError('Failed to initialize market data connection');
        setLoading(false);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [symbols]);

  return { data, loading, error, connected };
};
