import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let binanceSocket: WebSocket | null = null;
  const symbols = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "adausdt"];
  const streams = symbols.map(s => `${s}@ticker`).join('/');

  socket.onopen = () => {
    console.log("Client WebSocket connected");
    
    // Connect to Binance WebSocket for real-time price updates
    binanceSocket = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${streams}`
    );

    binanceSocket.onopen = () => {
      console.log("Connected to Binance WebSocket");
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
            timestamp: ticker.E
          };
          
          socket.send(JSON.stringify(formattedData));
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
    };
  };

  socket.onclose = () => {
    console.log("Client WebSocket disconnected");
    if (binanceSocket) {
      binanceSocket.close();
    }
  };

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);
    if (binanceSocket) {
      binanceSocket.close();
    }
  };

  return response;
});
