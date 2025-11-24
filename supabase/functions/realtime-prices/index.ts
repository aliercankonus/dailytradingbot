import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  console.log("WebSocket upgrade request received");

  const { socket, response } = Deno.upgradeWebSocket(req);

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get user ID from authorization header
  const authHeader = headers.get("authorization");
  let userId: string | null = null;
  
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  let binanceSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;

  // Determine symbols to stream
  let symbols = ["btcusdt", "ethusdt"]; // Default fallback

  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols");

    if (symbolsParam) {
      const parsed = JSON.parse(decodeURIComponent(symbolsParam));
      if (Array.isArray(parsed) && parsed.length > 0) {
        symbols = parsed.map((s: string) => s.toLowerCase());
        console.log("Using symbols from client:", symbols);
      }
    } else if (userId) {
      const { data: symbolsData } = await supabase
        .from("trading_symbols_config")
        .select("symbol")
        .eq("user_id", userId)
        .eq("is_active", true);
      if (symbolsData && symbolsData.length > 0) {
        symbols = symbolsData.map((s) => s.symbol.toLowerCase());
        console.log("Fetched active symbols:", symbols);
      } else {
        console.log("No active symbols found for user, using defaults");
      }
    }
  } catch (e) {
    console.error("Error determining symbols:", e);
  }
  
  const streams = symbols.map((s) => `${s}@ticker`).join("/");

  const connectToBinance = () => {
    try {
      const binanceUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      console.log("Connecting to Binance:", binanceUrl);

      binanceSocket = new WebSocket(binanceUrl);

      binanceSocket.onopen = () => {
        console.log("Connected to Binance WebSocket");
        reconnectAttempts = 0;

        // Send connection success message
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "connected",
              message: "Successfully connected to market data stream",
            }),
          );
        }
      };

      binanceSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.stream && data.data) {
            const ticker = data.data;
            const formattedData = {
              symbol: ticker.s,
              price: ticker.c,
              priceChange: ticker.p,
              priceChangePercent: ticker.P,
              high: ticker.h,
              low: ticker.l,
              volume: ticker.v,
              timestamp: ticker.E,
            };

            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(formattedData));
            }
          }
        } catch (error) {
          console.error("Error processing Binance message:", error);
        }
      };

      binanceSocket.onerror = (error) => {
        console.error("Binance WebSocket error:", error);
      };

      binanceSocket.onclose = (event) => {
        console.log(`Binance WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);

        // Only attempt reconnection if client is still connected
        if (socket.readyState !== WebSocket.OPEN) {
          console.log("Client disconnected, skipping Binance reconnection");
          return;
        }

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
          console.error("Max reconnection attempts reached");
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "error",
                message: "Connection to market data lost. Please refresh.",
              }),
            );
          }
        }
      };
    } catch (error) {
      console.error("Error connecting to Binance:", error);
    }
  };

  socket.onopen = () => {
    console.log("Client WebSocket connected");
    connectToBinance();

    // Send heartbeat every 30 seconds to keep connection alive
    heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 30000);
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      // Handle pong response to heartbeat
      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  };

  socket.onclose = () => {
    console.log("Client WebSocket disconnected - cleaning up resources");

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

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);

    if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
      binanceSocket.close();
    }
  };

  return response;
});
