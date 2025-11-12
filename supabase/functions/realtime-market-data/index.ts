import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  console.log('WebSocket upgrade request received');

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let binanceSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;
  let reconnectTimeout: number | null = null;

  // Parse symbols from query params or use defaults
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get('symbols');
  const symbols = symbolsParam ? JSON.parse(symbolsParam) : ['BTCUSDT', 'ETHUSDT'];
  
  console.log('Subscribing to symbols:', symbols);

  const connectToBinance = () => {
    try {
      // Create streams parameter for multiple symbols
      const streams = symbols.map((s: string) => `${s.toLowerCase()}@ticker`).join('/');
      const binanceUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
      
      console.log('Connecting to Binance:', binanceUrl);
      
      binanceSocket = new WebSocket(binanceUrl);
      
      binanceSocket.onopen = () => {
        console.log('Connected to Binance WebSocket');
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
          
          // Binance sends data in a specific format
          if (data.data) {
            const tickerData = data.data;
            
            // Transform to our format
            const transformed = {
              type: 'price_update',
              data: {
                symbol: tickerData.s,
                lastPrice: tickerData.c,
                priceChange: tickerData.p,
                priceChangePercent: tickerData.P,
                highPrice: tickerData.h,
                lowPrice: tickerData.l,
                volume: tickerData.v,
                quoteVolume: tickerData.q,
                timestamp: new Date(tickerData.E).toISOString()
              }
            };
            
            // Forward to client
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(transformed));
            }
          }
        } catch (error) {
          console.error('Error processing Binance message:', error);
        }
      };

      binanceSocket.onerror = (error) => {
        console.error('Binance WebSocket error:', error);
      };

      binanceSocket.onclose = () => {
        console.log('Binance WebSocket closed');
        
        // Attempt reconnection
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
          
          reconnectTimeout = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              connectToBinance();
            }
          }, RECONNECT_DELAY);
        } else {
          console.error('Max reconnection attempts reached');
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Connection to market data lost. Please refresh.'
            }));
          }
        }
      };
    } catch (error) {
      console.error('Error connecting to Binance:', error);
    }
  };

  socket.onopen = () => {
    console.log('Client WebSocket opened');
    connectToBinance();
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('Received message from client:', message);
      
      // Handle client messages if needed (e.g., subscribe to new symbols)
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('Error processing client message:', error);
    }
  };

  socket.onerror = (error) => {
    console.error('Client WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('Client WebSocket closed');
    
    // Clean up Binance connection
    if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
      binanceSocket.close();
    }
    
    // Clear reconnect timeout
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
    }
  };

  return response;
});
