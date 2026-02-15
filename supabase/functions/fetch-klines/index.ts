import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchKlines } from "../_shared/binance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { symbols, interval = "1h", limit = 100 } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "symbols array is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Cap at 10 symbols to prevent abuse
    const cappedSymbols = symbols.slice(0, 10);

    const results = await Promise.all(
      cappedSymbols.map(async (symbol: string) => {
        try {
          const klines = await fetchKlines(symbol, interval, limit);
          return { symbol, klines };
        } catch {
          return { symbol, klines: [] };
        }
      })
    );

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
