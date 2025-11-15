import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  let binanceSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;

  const symbols = ["btcusdt", "ethusdt", "solusdt", "bnbusdt"];
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

      binanceSocket.onclose = () => {
        console.log("Binance WebSocket closed");

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
    console.log("Client WebSocket disconnected");

    // Clean up Binance connection
    if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
      binanceSocket.close();
    }

    // Clear intervals and timeouts
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
    }
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
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
