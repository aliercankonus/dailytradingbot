import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get risk parameters to check paper trading mode
    const { data: riskParams, error: riskError } = await supabase
      .from('risk_parameters')
      .select('paper_trading_mode, portfolio_value')
      .single();

    if (riskError) throw riskError;

    // If in paper trading mode, return the database portfolio value
    if (riskParams.paper_trading_mode) {
      return new Response(
        JSON.stringify({
          success: true,
          balance: riskParams.portfolio_value,
          currency: 'USDT',
          isPaperTrading: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch real Binance balance
    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('Binance API credentials not configured');
    }

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Create signature using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureData = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(queryString)
    );
    const signature = Array.from(new Uint8Array(signatureData))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Binance API error:', error);
      throw new Error(`Binance API error: ${response.status}`);
    }

    const accountData = await response.json();
    
    // Calculate total balance in USDT
    let totalBalanceUSDT = 0;
    
    // Find USDT balance
    const usdtBalance = accountData.balances?.find((b: any) => b.asset === 'USDT');
    if (usdtBalance) {
      totalBalanceUSDT += parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
    }

    // For other assets, we'd need to convert to USDT using current prices
    // For now, we'll just return USDT balance
    
    return new Response(
      JSON.stringify({
        success: true,
        balance: totalBalanceUSDT,
        currency: 'USDT',
        isPaperTrading: false,
        accountData: {
          canTrade: accountData.canTrade,
          canWithdraw: accountData.canWithdraw,
          canDeposit: accountData.canDeposit,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Binance balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});