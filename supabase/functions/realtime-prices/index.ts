import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { 
  buildStreamUrl, 
  parseTickerMessage,
  BinanceTickerData 
} from "../_shared/binance.ts";
import { createLogger } from "../_shared/logging.ts";

const logger = createLogger("realtime-prices");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  logger.info("WebSocket upgrade request received");
  const { socket, response } = Deno.upgradeWebSocket(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing required environment variables");
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = headers.get("authorization");
  let userId: string | null = null;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  let binanceSocket: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;

  // Determine symbols to stream
  let symbols = ["btcusdt", "ethusdt"];
  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols");
    if (symbolsParam) {
      const parsed = JSON.parse(decodeURIComponent(symbolsParam));
      if (Array.isArray(parsed) && parsed.length > 0) {
        symbols = parsed.map((s: string) => s.toLowerCase());
        logger.info(`Using symbols from client: ${JSON.stringify(symbols)}`);
      }
    } else if (userId) {
      const { data: symbolsData } = await supabase
        .from("trading_symbols_config")
        .select("symbol")
        .eq("user_id", userId)
        .eq("is_active", true);

      // Always include symbols from any currently open positions for this user
      const { data: openPositions } = await supabase
        .from("positions")
        .select("symbol")
        .eq("user_id", userId)
        .eq("status", "active");

      const allSymbols: string[] = [];
      if (symbolsData && symbolsData.length > 0) {
        allSymbols.push(...symbolsData.map((s) => s.symbol));
      }
      if (openPositions && openPositions.length > 0) {
        allSymbols.push(...openPositions.map((p) => p.symbol));
      }

      if (allSymbols.length > 0) {
        // Normalize to lowercase and de-duplicate
        symbols = Array.from(new Set(allSymbols.map((s) => s.toLowerCase())));
        logger.info(`Fetched symbols for stream (config + open positions): ${JSON.stringify(symbols)}`);
      } else {
        logger.info("No active symbols found for user, using defaults");
      }
    }
  } catch (e) {
    logger.error(`Error determining symbols: ${e}`);
  }

  // Build stream URL using shared utility
  const binanceUrl = buildStreamUrl(symbols, 'ticker');

  const connectToBinance = () => {
    try {
      logger.info(`Connecting to Binance: ${binanceUrl}`);
      binanceSocket = new WebSocket(binanceUrl);

      binanceSocket.onopen = () => {
        logger.info("Connected to Binance WebSocket");
        reconnectAttempts = 0; // reset on successful connection
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
          // Parse using shared utility
          const formattedData = parseTickerMessage(data);
          if (formattedData && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(formattedData));
          }
        } catch (error) {
          logger.error(`Error processing Binance message: ${error}`);
        }
      };

      binanceSocket.onerror = (error) => {
        logger.error(`Binance WebSocket error: ${error}`);
      };

      binanceSocket.onclose = (event) => {
        logger.info(`Binance WebSocket closed (code: ${event.code}, reason: ${event.reason || "none"})`);

        if (socket.readyState !== WebSocket.OPEN) {
          logger.info("Client disconnected, skipping Binance reconnection");
          return;
        }

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s... up to 60s max
          const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 60000);
          logger.info(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s`);

          reconnectTimeout = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              connectToBinance();
            }
          }, delay);
        } else {
          logger.error("Max reconnection attempts reached");
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "error",
                message: "Connection to market data lost after multiple attempts. Please refresh.",
              }),
            );
          }
        }
      };
    } catch (error) {
      logger.error(`Error connecting to Binance: ${error}`);
    }
  };

  socket.onopen = () => {
    logger.info("Client WebSocket connected");
    connectToBinance();

    heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 30000);
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
      }
    } catch (error) {
      logger.error(`Error processing client message: ${error}`);
    }
  };

  socket.onclose = () => {
    logger.info("Client WebSocket disconnected - cleaning up resources");
    if (binanceSocket) {
      if (binanceSocket.readyState === WebSocket.OPEN || binanceSocket.readyState === WebSocket.CONNECTING) {
        binanceSocket.close();
      }
      binanceSocket = null;
    }
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
    logger.error(`Client WebSocket error: ${error}`);
    if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
      binanceSocket.close();
    }
  };

  return response;
});
