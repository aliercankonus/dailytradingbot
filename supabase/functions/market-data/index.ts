import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { get24hrTicker } from "../_shared/binance.ts";
import { createLogger } from "../_shared/logging.ts";

const logger = createLogger("market-data");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols } = await req.json();
    logger.info(`Fetching market data for symbols: ${JSON.stringify(symbols)}`);

    // Default symbols if none provided
    const cryptoSymbols = symbols || ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];

    // Fetch ticker data using shared Binance utilities
    const tickerPromises = cryptoSymbols.map(async (symbol: string) => {
      try {
        return await get24hrTicker(symbol);
      } catch (error) {
        logger.forSymbol(symbol).error(`Failed to fetch ticker: ${error}`);
        return null;
      }
    });

    const tickerData = await Promise.all(tickerPromises);
    const validTickers = tickerData.filter((ticker) => ticker !== null);

    logger.info(`Successfully fetched ${validTickers.length} tickers`);

    return new Response(
      JSON.stringify({
        success: true,
        data: validTickers,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    logger.error(`Error in market-data function: ${error}`);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
