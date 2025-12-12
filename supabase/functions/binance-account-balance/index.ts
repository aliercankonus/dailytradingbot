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

    // Try to get user from auth header (optional)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (!userError && user) {
          userId = user.id;
        }
      } catch (_e) {
        // Ignore auth errors and continue in paper mode fallback
      }
    }

    // Get risk parameters to check paper trading mode
    let riskQuery = supabase
      .from('risk_parameters')
      .select('paper_trading_mode, portfolio_value')
      .limit(1);
    if (userId) {
      // Prefer user-specific settings when available
      // deno-lint-ignore no-unused-vars
      const _ = null; // keep TS happy about block scope
      // @ts-ignore - dynamic query building
      riskQuery = riskQuery.eq('user_id', userId);
    }
    const { data: riskParams, error: riskError } = await (riskQuery as any).maybeSingle();

    if (riskError) throw riskError;

    // If no risk params found or in paper trading mode, return default/database value
    if (!riskParams || riskParams.paper_trading_mode) {
      return new Response(
        JSON.stringify({
          success: true,
          balance: riskParams?.portfolio_value || 10000,
          currency: 'USDT',
          isPaperTrading: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch real Binance balance - get user-specific credentials from vault
    let apiKey = Deno.env.get('BINANCE_API_KEY');
    let apiSecret = Deno.env.get('BINANCE_API_SECRET');

    // If user is authenticated, try to get their personal API keys from vault
    if (userId) {
      const { data: credentials, error: credError } = await supabase.rpc('get_user_binance_credentials', {
        p_user_id: userId
      });
      
      if (!credError && credentials && credentials.length > 0 && credentials[0].api_key && credentials[0].api_secret) {
        apiKey = credentials[0].api_key;
        apiSecret = credentials[0].api_secret;
        console.log('Using user-specific encrypted Binance credentials from vault');
      }
    }

    if (!apiKey || !apiSecret) {
      console.warn('Binance API credentials not configured, returning paper balance');
      return new Response(
        JSON.stringify({
          success: true,
          balance: riskParams?.portfolio_value || 10000,
          currency: 'USDT',
          isPaperTrading: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const errorText = await response.text();
      console.error('Binance API error:', errorText);
      // Fallback to paper balance on API errors
      return new Response(
        JSON.stringify({
          success: true,
          balance: riskParams?.portfolio_value || 10000,
          currency: 'USDT',
          isPaperTrading: true,
          note: 'Fell back to paper balance due to Binance API error'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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