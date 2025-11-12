import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketCondition {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  volume: number;
}

interface StrategyPerformance {
  id: string;
  strategy_name: string;
  status: string;
  total_trades: number;
  winning_trades: number;
  total_profit: number;
  max_drawdown: number;
  win_rate: number;
  score: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting strategy rotation evaluation...');

    // Get rotation configuration
    const { data: config, error: configError } = await supabase
      .from('strategy_rotation_config')
      .select('*')
      .single();

    if (configError || !config?.enabled) {
      console.log('Strategy rotation is disabled');
      return new Response(
        JSON.stringify({ message: 'Strategy rotation is disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get market data for market condition analysis
    const { data: marketData } = await supabase.functions.invoke('market-data', {
      body: { symbols: ['BTCUSDT'] }
    });

    const marketCondition: MarketCondition = analyzeMarketCondition(marketData);

    // Get all strategies with their performance
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategy_performance')
      .select('*');

    if (strategiesError || !strategies) {
      throw new Error('Failed to fetch strategies');
    }

    // Calculate scores for each strategy
    const scoredStrategies: StrategyPerformance[] = strategies
      .filter(s => s.total_trades >= config.min_trades_required)
      .map(strategy => {
        const winRate = strategy.total_trades > 0 
          ? (strategy.winning_trades / strategy.total_trades) * 100 
          : 0;

        // Performance score (0-100)
        const profitScore = Math.min(100, Math.max(0, strategy.total_profit / 100));
        const winRateScore = winRate;
        const drawdownPenalty = Math.abs(strategy.max_drawdown) / 2;
        const performanceScore = (profitScore + winRateScore - drawdownPenalty) / 2;

        // Market condition score (0-100)
        const marketScore = calculateMarketFitScore(strategy.strategy_name, marketCondition);

        // Weighted final score
        const finalScore = 
          (performanceScore * config.performance_weight) +
          (marketScore * config.market_condition_weight);

        return {
          ...strategy,
          win_rate: winRate,
          score: finalScore
        };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredStrategies.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No strategies meet minimum trade requirements' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get currently active strategy
    const currentActive = strategies.find(s => s.status === 'active');
    const bestStrategy = scoredStrategies[0];

    // Check if rotation is needed
    const shouldRotate = !currentActive || 
      (currentActive.id !== bestStrategy.id && 
       bestStrategy.score > (currentActive.score || 0) + config.performance_threshold_percent);

    if (shouldRotate && currentActive?.id !== bestStrategy.id) {
      console.log(`Rotating from ${currentActive?.strategy_name} to ${bestStrategy.strategy_name}`);

      // Deactivate current strategy
      if (currentActive) {
        await supabase
          .from('strategy_performance')
          .update({ status: 'standby' })
          .eq('id', currentActive.id);
      }

      // Activate best strategy
      await supabase
        .from('strategy_performance')
        .update({ status: 'active' })
        .eq('id', bestStrategy.id);

      // Record rotation history
      await supabase
        .from('strategy_rotation_history')
        .insert({
          from_strategy_id: currentActive?.id,
          to_strategy_id: bestStrategy.id,
          from_strategy_name: currentActive?.strategy_name || 'None',
          to_strategy_name: bestStrategy.strategy_name,
          reason: `Score improvement: ${bestStrategy.score.toFixed(2)} vs ${(currentActive?.score || 0).toFixed(2)}`,
          market_condition: marketCondition,
          performance_metrics: {
            from_win_rate: currentActive?.win_rate || 0,
            to_win_rate: bestStrategy.win_rate,
            from_profit: currentActive?.total_profit || 0,
            to_profit: bestStrategy.total_profit
          }
        });

      return new Response(
        JSON.stringify({
          rotated: true,
          from: currentActive?.strategy_name || 'None',
          to: bestStrategy.strategy_name,
          reason: `Better performance score: ${bestStrategy.score.toFixed(2)}`,
          market_condition: marketCondition
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        rotated: false,
        current_strategy: currentActive?.strategy_name,
        message: 'No rotation needed',
        top_strategies: scoredStrategies.slice(0, 3).map(s => ({
          name: s.strategy_name,
          score: s.score.toFixed(2)
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Strategy rotation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function analyzeMarketCondition(marketData: any): MarketCondition {
  // Simple market condition analysis
  const volatility = Math.random() * 100; // In real implementation, calculate from price data
  const trend = volatility > 60 ? 'bullish' : volatility < 40 ? 'bearish' : 'neutral';
  const volume = Math.random() * 1000000;

  return { volatility, trend, volume };
}

function calculateMarketFitScore(strategyName: string, condition: MarketCondition): number {
  const name = strategyName.toLowerCase();
  
  // Score strategies based on market conditions
  if (condition.trend === 'bullish') {
    if (name.includes('momentum') || name.includes('breakout')) return 90;
    if (name.includes('trend')) return 85;
    if (name.includes('mean reversion')) return 40;
  } else if (condition.trend === 'bearish') {
    if (name.includes('mean reversion')) return 90;
    if (name.includes('range')) return 80;
    if (name.includes('momentum')) return 30;
  } else { // neutral
    if (name.includes('range') || name.includes('scalping')) return 85;
    if (name.includes('mean reversion')) return 75;
  }

  return 50; // Default score
}
