import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWebSocketMonitor } from '@/contexts/WebSocketMonitorContext';

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

export const useRealtimePrices = (symbols?: string[]) => {
  const [prices, setPrices] = useState<Map<string, RealtimePrice>>(() => new Map());
  
  const [priceVersion, setPriceVersion] = useState(0); // Force re-renders
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const pendingUpdatesRef = useRef<Map<string, RealtimePrice>>(new Map());
  const updateTimerRef = useRef<number | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 2000;
  const CONNECTION_TIMEOUT = 15000;
  const UPDATE_BATCH_DELAY = 100; // Batch updates every 100ms
  
  const monitor = useWebSocketMonitor();
  const connectionId = useRef(`realtime-prices-${Date.now()}`);

  // Stabilize symbols array to prevent unnecessary reconnections
  const symbolsKey = useMemo(() => JSON.stringify(symbols?.sort()), [symbols]);

  // Register connection on mount only
  useEffect(() => {
    monitor.registerConnection(connectionId.current, 'Realtime Prices');
    return () => monitor.unregisterConnection(connectionId.current);
  }, []);

  // Batch price updates for performance
  const flushPendingUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.size > 0) {
      // CRITICAL FIX: Snapshot pending updates BEFORE clearing to prevent race condition
      const updates = new Map(pendingUpdatesRef.current);
      pendingUpdatesRef.current.clear(); // Clear immediately before async state update
      
      console.log('[RealtimePrices] Flushing', updates.size, 'pending price updates');
      setPrices((prev) => {
        const newPrices = new Map(prev);
        updates.forEach((price, symbol) => {
          newPrices.set(symbol, price);
          (newPrices as any)[symbol] = price; // allow prices[symbol] access
        });
        console.log('[RealtimePrices] Updated prices map, now has', newPrices.size, 'symbols');
        return newPrices;
      });
      setPriceVersion(v => v + 1); // Force re-render
    }
    updateTimerRef.current = null;
  }, []);

  const schedulePriceUpdate = useCallback((symbol: string, data: RealtimePrice) => {
    pendingUpdatesRef.current.set(symbol, data);
    
    if (updateTimerRef.current === null) {
      updateTimerRef.current = window.setTimeout(flushPendingUpdates, UPDATE_BATCH_DELAY);
    }
  }, [flushPendingUpdates]);

  useEffect(() => {
    const projectId = 'ikrivrudkvvnksollslh';

    let cancelled = false;

    const setupAndConnect = async () => {
      if (isConnectingRef.current) {
        console.log('[RealtimePrices] Connection already in progress, skipping');
        return;
      }

      try {
        isConnectingRef.current = true;
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        const params = new URLSearchParams();
        if (symbols && symbols.length > 0) {
          params.set('symbols', encodeURIComponent(JSON.stringify(symbols)));
        }
        if (token) {
          params.set('token', token);
        }
        const qs = params.toString() ? `?${params.toString()}` : '';
        const wsUrl = `wss://${projectId}.supabase.co/functions/v1/realtime-prices${qs}`;

        const connect = () => {
          if (cancelled) return;
          
          try {
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

            console.log(`[RealtimePrices] Connecting (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // Set connection timeout
            connectionTimeoutRef.current = window.setTimeout(() => {
              if (ws.readyState !== WebSocket.OPEN) {
                console.error('[RealtimePrices] Connection timeout');
                ws.close();
                setError('Connection timeout - retrying...');
                setConnected(false);
              }
            }, CONNECTION_TIMEOUT);

            ws.onopen = () => {
                console.log('[RealtimePrices] WebSocket connected successfully');
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
                const data = JSON.parse(event.data);
                console.log('[RealtimePrices] Received message:', data.type || 'price_update', data.symbol);
                
                if (data.type === 'connected') {
                  console.log('[RealtimePrices] Successfully connected to realtime prices');
                } else if (data.type === 'error') {
                  console.error('[RealtimePrices] Error from server:', data.message);
                  setError(data.message);
                } else if (data.type === 'heartbeat') {
                  // Heartbeat received, no response needed
                } else if (data.symbol) {
                  // Use batched updates for better performance
                  console.log('[RealtimePrices] Scheduling price update for', data.symbol, 'price:', data.price);
                  schedulePriceUpdate(data.symbol, data);
                }
              } catch (err) {
                console.error('[RealtimePrices] Error parsing WebSocket message:', err);
              }
            };

            ws.onerror = (event) => {
                console.error('[RealtimePrices] WebSocket error:', event);
                isConnectingRef.current = false;
                const errorMessage = reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS 
                    ? 'Unable to connect to price feed. Please check your connection.'
                    : 'Connection error - reconnecting...';
                monitor.recordError(connectionId.current, errorMessage);
                setError(errorMessage);
                setConnected(false);
            };

            ws.onclose = (event) => {
              console.log(`[RealtimePrices] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
              isConnectingRef.current = false;
              monitor.updateConnectionStatus(connectionId.current, 'disconnected');
              setConnected(false);
              
              // Clean up intervals
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
              }
              
              if (cancelled) return;
              
              // Only reconnect if not a normal closure
              if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
                console.log(`[RealtimePrices] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                monitor.recordReconnectAttempt(connectionId.current);
                monitor.updateConnectionStatus(connectionId.current, 'reconnecting');
                
                reconnectTimeoutRef.current = window.setTimeout(() => {
                  connect();
                }, delay);
              } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
                setError('Connection lost. Please refresh the page to reconnect.');
              }
            };
          } catch (err) {
            console.error('Error creating WebSocket:', err);
            isConnectingRef.current = false;
            setError('Failed to create WebSocket connection');
          }
        };

        connect();
      } catch (e) {
        console.error('Error preparing realtime prices connection', e);
        isConnectingRef.current = false;
        setError('Failed to prepare realtime prices connection');
      }
    };

    setupAndConnect();

    return () => {
      cancelled = true;
      isConnectingRef.current = false;
      console.log('[RealtimePrices] Cleaning up WebSocket connection');
      
      // Flush any pending updates before cleanup
      if (updateTimerRef.current !== null) {
        clearTimeout(updateTimerRef.current);
        flushPendingUpdates();
      }
      
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
  }, [symbolsKey, flushPendingUpdates]);

  const getPrice = useCallback((symbol: string) => {
    return prices.get(symbol);
  }, [prices]);

  return { prices, priceVersion, connected, error, getPrice };
};
