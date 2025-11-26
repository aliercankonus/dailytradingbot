import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [prices, setPrices] = useState<Map<string, RealtimePrice>>(new Map());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const pingTimestampRef = useRef<number | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000;
  const CONNECTION_TIMEOUT = 10000;
  const PING_INTERVAL = 30000;
  
  const monitor = useWebSocketMonitor();
  const connectionId = 'realtime-prices';

  useEffect(() => {
    const projectId = 'ikrivrudkvvnksollslh';

    // Register connection with monitor
    monitor.registerConnection(connectionId, 'Realtime Prices');

    let cancelled = false;

    const setupAndConnect = async () => {
      try {
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
          try {
            // Clear any existing timeouts
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
            }
            if (pingIntervalRef.current) {
              clearInterval(pingIntervalRef.current);
            }

            if (wsRef.current) {
              wsRef.current.close();
            }

            console.log(`[RealtimePrices] Connecting (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS}):`, wsUrl);
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
                setConnected(true);
                setError(null);
                reconnectAttemptsRef.current = 0;
                monitor.updateConnectionStatus(connectionId, 'connected');

                // Start ping interval to keep connection alive and measure latency
                pingIntervalRef.current = window.setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        pingTimestampRef.current = Date.now();
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, PING_INTERVAL);
            };

            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                
                // Record message for monitoring
                monitor.recordMessage(connectionId);
                
                // Measure latency from ping
                if (data.type === 'pong' && pingTimestampRef.current) {
                  const latency = Date.now() - pingTimestampRef.current;
                  monitor.recordLatency(connectionId, latency);
                  pingTimestampRef.current = null;
                }
                
                if (data.type === 'connected') {
                  console.log('Successfully connected to realtime prices');
                } else if (data.type === 'error') {
                  console.error('Error from server:', data.message);
                  monitor.recordError(connectionId, data.message);
                  setError(data.message);
                } else if (data.type === 'heartbeat') {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'pong' }));
                  }
                } else if (data.symbol) {
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
                console.error('[RealtimePrices] WebSocket error:', event);
                const errorMessage = reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS 
                    ? 'Unable to connect to price feed. Please check your connection.'
                    : 'Connection error - reconnecting...';
                setError(errorMessage);
                setConnected(false);
                monitor.recordError(connectionId, errorMessage);
                monitor.updateConnectionStatus(connectionId, 'disconnected');
            };

            ws.onclose = (event) => {
              console.log(`[RealtimePrices] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
              setConnected(false);
              monitor.updateConnectionStatus(connectionId, 'disconnected');
              
              // Clean up intervals
              if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
              }
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
              }
              
              if (cancelled) return;
              
              // Attempt reconnection with exponential backoff
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                monitor.recordReconnectAttempt(connectionId);
                monitor.updateConnectionStatus(connectionId, 'reconnecting');
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
                console.log(`[RealtimePrices] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                
                reconnectTimeoutRef.current = window.setTimeout(() => {
                  connect();
                }, delay);
              } else {
                const errorMsg = 'Connection lost. Please refresh the page to reconnect.';
                setError(errorMsg);
                monitor.recordError(connectionId, errorMsg);
              }
            };
          } catch (err) {
            console.error('Error creating WebSocket:', err);
            setError('Failed to create WebSocket connection');
          }
        };

        connect();
      } catch (e) {
        console.error('Error preparing realtime prices connection', e);
        setError('Failed to prepare realtime prices connection');
      }
    };

    setupAndConnect();

    return () => {
      cancelled = true;
      console.log('[RealtimePrices] Cleaning up WebSocket connection');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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
      monitor.unregisterConnection(connectionId);
    };
  }, [JSON.stringify(symbols), monitor]);

  const getPrice = useCallback((symbol: string) => {
    return prices.get(symbol);
  }, [prices]);

  return { prices, connected, error, getPrice };
};
