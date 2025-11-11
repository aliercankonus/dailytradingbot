import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols } = await req.json();
    console.log('Fetching market data for symbols:', symbols);

    // Default symbols if none provided
    const cryptoSymbols = symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
    
    // Fetch ticker data from Binance public API
    const tickerPromises = cryptoSymbols.map(async (symbol: string) => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      if (!response.ok) {
        console.error(`Failed to fetch data for ${symbol}:`, response.status);
        return null;
      }
      return response.json();
    });

    const tickerData = await Promise.all(tickerPromises);
    const validTickers = tickerData.filter(ticker => ticker !== null);

    console.log(`Successfully fetched ${validTickers.length} tickers`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: validTickers,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in market-data function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
