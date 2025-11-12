import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketCondition, timeframe } = await req.json();
    console.log('AI Strategy Recommender called with:', { marketCondition, timeframe });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strategy performance data
    const { data: strategies, error: stratError } = await supabase
      .from('strategy_performance')
      .select('*')
      .order('total_profit', { ascending: false })
      .limit(10);

    if (stratError) {
      console.error('Error fetching strategies:', stratError);
      throw stratError;
    }

    // Fetch recent trades
    const { data: recentTrades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(20);

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
    }

    // Fetch custom strategies
    const { data: customStrategies, error: customError } = await supabase
      .from('custom_strategies')
      .select('*')
      .eq('is_active', true);

    if (customError) {
      console.error('Error fetching custom strategies:', customError);
    }

    // Calculate aggregate statistics
    const totalTrades = strategies?.reduce((sum, s) => sum + s.total_trades, 0) || 0;
    const avgWinRate = strategies?.length 
      ? strategies.reduce((sum, s) => sum + (s.winning_trades / (s.total_trades || 1)), 0) / strategies.length * 100
      : 0;
    const totalProfit = strategies?.reduce((sum, s) => sum + s.total_profit, 0) || 0;

    // Build context for AI
    const context = `
Market Condition: ${marketCondition || 'neutral'}
Timeframe: ${timeframe || 'all time'}

Current Portfolio Statistics:
- Total Strategies: ${strategies?.length || 0}
- Total Trades Executed: ${totalTrades}
- Average Win Rate: ${avgWinRate.toFixed(2)}%
- Total Profit: $${totalProfit.toFixed(2)}

Top Performing Strategies:
${strategies?.slice(0, 5).map(s => `
- ${s.strategy_name}: ${s.total_trades} trades, Win Rate: ${((s.winning_trades / (s.total_trades || 1)) * 100).toFixed(2)}%, Profit: $${s.total_profit.toFixed(2)}, Max Drawdown: ${s.max_drawdown}%
`).join('')}

Active Custom Strategies: ${customStrategies?.length || 0}
${customStrategies?.map(s => `
- ${s.name}: ${s.description}
  Entry conditions: ${JSON.stringify(s.entry_conditions)}
  Risk: SL ${s.risk_settings?.stopLossPercent}%, TP ${s.risk_settings?.takeProfitPercent}%
`).join('') || 'None'}

Recent Trading Activity:
${recentTrades?.slice(0, 10).map(t => `
- ${t.symbol}: ${t.side} at $${t.entry_price}, ${t.exit_price ? `Exit: $${t.exit_price}, P&L: $${t.profit_loss?.toFixed(2)}` : 'Still open'}
`).join('') || 'No recent trades'}
`;

    // Call Lovable AI for recommendations
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert quantitative trading analyst and strategy advisor. Analyze trading performance data and provide actionable recommendations for cryptocurrency trading strategies.

Your recommendations should:
1. Be specific and actionable
2. Consider current market conditions
3. Suggest concrete parameter adjustments (RSI levels, stop loss, take profit percentages)
4. Recommend which strategies to activate/deactivate
5. Identify patterns in winning vs losing trades
6. Suggest risk management improvements

Format your response as a JSON object with this structure:
{
  "summary": "Brief 2-3 sentence overview of current performance",
  "recommendations": [
    {
      "title": "Recommendation title",
      "description": "Detailed explanation",
      "priority": "high|medium|low",
      "action": "Specific action to take",
      "expectedImpact": "Expected result"
    }
  ],
  "strategyAdjustments": [
    {
      "strategyName": "Name of strategy",
      "parameter": "Parameter to adjust",
      "currentValue": "Current value",
      "suggestedValue": "Suggested new value",
      "reason": "Why this adjustment"
    }
  ],
  "marketInsight": "Analysis of how current market conditions should influence strategy selection"
}`
          },
          {
            role: 'user',
            content: context
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    console.log('AI response received');

    // Parse AI response
    let recommendations;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || aiContent.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      recommendations = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      recommendations = {
        summary: aiContent.substring(0, 500),
        recommendations: [],
        strategyAdjustments: [],
        marketInsight: "Unable to parse structured recommendations"
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        recommendations,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in ai-strategy-recommender:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
