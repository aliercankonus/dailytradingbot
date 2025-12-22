import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildStreamUrl, parseTickerMessage } from "../_shared/binance.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const HEARTBEAT_INTERVAL = 30000;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  console.log('[MarketData-Edge] WebSocket upgrade request received');

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let binanceSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;

  // Parse symbols from query params or use defaults
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get('symbols');
  const symbols: string[] = symbolsParam ? JSON.parse(symbolsParam) : ['BTCUSDT', 'ETHUSDT'];
  
  console.log('[MarketData-Edge] Subscribing to symbols:', symbols);

  const connectToBinance = () => {
    try {
      // Use shared utility to build stream URL
      const binanceUrl = buildStreamUrl(symbols);
      
      console.log('[MarketData-Edge] Connecting to Binance:', binanceUrl);
      
      binanceSocket = new WebSocket(binanceUrl);
      
      binanceSocket.onopen = () => {
        console.log('[MarketData-Edge] Connected to Binance WebSocket');
        reconnectAttempts = 0;
        
        // Send connection success message
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'connected',
            message: 'Successfully connected to market data stream',
            symbols
          }));
        }
      };

      binanceSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Binance sends data in a specific format for combined streams
          if (data.data) {
            // Use shared utility to parse ticker message (pass full object with stream/data)
            const tickerData = parseTickerMessage(data);
            
            if (tickerData) {
              // Transform to our format
              const transformed = {
                type: 'price_update',
                data: {
                  symbol: tickerData.symbol,
                  lastPrice: tickerData.price,
                  priceChange: tickerData.priceChange,
                  priceChangePercent: tickerData.priceChangePercent,
                  highPrice: tickerData.high,
                  lowPrice: tickerData.low,
                  volume: tickerData.volume,
                  quoteVolume: data.data.q, // Quote volume from raw data
                  timestamp: new Date(tickerData.timestamp).toISOString()
                }
              };
              
              // Forward to client
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(transformed));
              }
            }
          }
        } catch (error) {
          console.error('[MarketData-Edge] Error processing Binance message:', error);
        }
      };

      binanceSocket.onerror = (error) => {
        console.error('[MarketData-Edge] Binance WebSocket error:', error);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Temporary connection issue - reconnecting...'
          }));
        }
      };

      binanceSocket.onclose = (event) => {
        console.log(`[MarketData-Edge] Binance WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        
        // Don't reconnect if client has disconnected
        if (socket.readyState !== WebSocket.OPEN) {
          console.log('[MarketData-Edge] Client disconnected, skipping Binance reconnection');
          return;
        }
        
        // Attempt reconnection with exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 60000);
          console.log(`[MarketData-Edge] Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s`);
          
          reconnectTimeout = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              connectToBinance();
            }
          }, delay);
        } else {
          console.error('[MarketData-Edge] Max reconnection attempts reached');
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Connection to market data lost after multiple attempts. Please refresh.'
            }));
          }
        }
      };
    } catch (error) {
      console.error('[MarketData-Edge] Error connecting to Binance:', error);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Failed to establish connection to market data provider.'
        }));
      }
    }
  };

  socket.onopen = () => {
    console.log('[MarketData-Edge] Client WebSocket opened');
    connectToBinance();
    
    // Start heartbeat to keep connection alive
    heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL);
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // Handle client messages (e.g., ping/pong)
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('[MarketData-Edge] Error processing client message:', error);
    }
  };

  socket.onerror = (error) => {
    console.error('[MarketData-Edge] Client WebSocket error:', error);
    // Close Binance connection on client error
    if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
      binanceSocket.close();
    }
  };

  socket.onclose = () => {
    console.log('[MarketData-Edge] Client WebSocket closed - cleaning up resources');
    
    // Clean up Binance connection
    if (binanceSocket) {
      if (binanceSocket.readyState === WebSocket.OPEN || binanceSocket.readyState === WebSocket.CONNECTING) {
        binanceSocket.close();
      }
      binanceSocket = null;
    }
    
    // Clear intervals and timeouts
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  return response;
});
