import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= CENTRALIZED ADX THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, execute-trade, monitor-positions
const ADX_THRESHOLDS = {
  VERY_WEAK: 12,    // Essentially no trend, avoid trading
  WEAK: 18,         // Weak trend, mixed momentum allowed with caution
  MINIMUM: 20,      // Hard gate for any signal generation
  MODERATE: 22,     // Momentum confirmation threshold
  STRONG: 25,       // Strong trend, reduced reversal weight
  VERY_STRONG: 30,  // Very strong trend, momentum continuation valid
  EXCEPTIONAL: 35,  // Exceptional trend, relaxed quality thresholds
  EXTREME: 40,      // Extreme trend, maximum confidence bonus
} as const;

// ============= CENTRALIZED STOCHRSI THRESHOLDS =============
// CRITICAL: Keep these aligned across all edge functions to prevent silent drift!
// Changes here should be mirrored in: strategy-analyzer, calculate-trend, execute-trade, monitor-positions
const STOCHRSI_THRESHOLDS = {
  EXTREME_OVERSOLD: 10,    // Extremely oversold, strong bounce risk for SHORT
  DEEPLY_OVERSOLD: 15,     // Deeply oversold zone
  OVERSOLD: 20,            // Standard oversold threshold
  OVERSOLD_ZONE: 25,       // Entering oversold territory
  NEUTRAL_LOW: 30,         // Lower neutral boundary
  NEUTRAL_HIGH: 70,        // Upper neutral boundary
  OVERBOUGHT_ZONE: 75,     // Entering overbought territory
  OVERBOUGHT: 80,          // Standard overbought threshold
  DEEPLY_OVERBOUGHT: 85,   // Deeply overbought zone
  EXTREME_OVERBOUGHT: 90,  // Extremely overbought, strong pullback risk for LONG
} as const;

interface SignalAnalysisRequest {
  symbol: string;
  userId?: string;
  signalType: "long" | "short";
  trendData: {
    trend: string;
    confidence: number;
    trendConsistency: number;
    adx: number;
    rsi: number;
    macdHistogram: number;
    stochRSI: { k: number; d: number; signal: string };
    bollingerBands: { percentB: number; squeeze: boolean };
    momentum: { confirms: boolean; divergence: boolean };
    volumeConfirms: boolean;
  };
  strategyName: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

interface AIAnalysisResult {
  recommendation: "strong_entry" | "normal_entry" | "caution" | "avoid";
  confidenceAdjustment: number; // -20 to +20
  positionSizeMultiplier: number; // 0.5 to 1.5
  reasoning: string;
  keyFactors: string[];
  riskLevel: "low" | "medium" | "high";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const request: SignalAnalysisRequest = await req.json();
    const { symbol, signalType, trendData, strategyName, entryPrice, stopLoss, takeProfit } = request;

    console.log(`🤖 AI Signal Analysis for ${symbol} ${signalType.toUpperCase()} via ${strategyName}`);

    // Build comprehensive prompt for AI analysis
    const systemPrompt = `You are an expert algorithmic trading analyst specializing in cryptocurrency markets. 
Your role is to evaluate trading signals and provide risk-adjusted recommendations.
Always respond with valid JSON matching the exact schema provided.
Be conservative - protect capital is priority #1.`;

    const analysisPrompt = `Analyze this ${signalType.toUpperCase()} signal for ${symbol}:

**Technical Indicators:**
- Trend: ${trendData.trend} (${trendData.confidence}% confidence)
- Trend Consistency: ${trendData.trendConsistency}%
- ADX (Trend Strength): ${trendData.adx}
- RSI: ${trendData.rsi}
- MACD Histogram: ${trendData.macdHistogram > 0 ? '+' : ''}${trendData.macdHistogram.toFixed(4)}
- StochRSI: K=${trendData.stochRSI.k}, D=${trendData.stochRSI.d}, Signal=${trendData.stochRSI.signal}
- Bollinger %B: ${trendData.bollingerBands.percentB}% ${trendData.bollingerBands.squeeze ? '(SQUEEZE)' : ''}
- Momentum Confirmed: ${trendData.momentum.confirms}
- Momentum Divergence: ${trendData.momentum.divergence}
- Volume Confirms: ${trendData.volumeConfirms}

**Trade Setup:**
- Strategy: ${strategyName}
- Entry: $${entryPrice}
- Stop Loss: $${stopLoss} (${(((signalType === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice) / entryPrice) * 100).toFixed(2)}% risk)
- Take Profit: $${takeProfit} (${(((signalType === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit) / entryPrice) * 100).toFixed(2)}% target)

Evaluate the signal quality and provide your analysis.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: analysisPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_signal_analysis",
              description: "Provide structured analysis of the trading signal",
              parameters: {
                type: "object",
                properties: {
                  recommendation: {
                    type: "string",
                    enum: ["strong_entry", "normal_entry", "caution", "avoid"],
                    description: "Overall recommendation for the trade"
                  },
                  confidenceAdjustment: {
                    type: "number",
                    description: "Adjustment to confidence score (-20 to +20)"
                  },
                  positionSizeMultiplier: {
                    type: "number",
                    description: "Multiplier for position size (0.5 to 1.5)"
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of the analysis (max 100 words)"
                  },
                  keyFactors: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 key factors influencing the decision"
                  },
                  riskLevel: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Overall risk level assessment"
                  }
                },
                required: ["recommendation", "confidenceAdjustment", "positionSizeMultiplier", "reasoning", "keyFactors", "riskLevel"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "provide_signal_analysis" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("AI rate limit - using fallback analysis");
        return new Response(
          JSON.stringify(getFallbackAnalysis(trendData, signalType)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.warn("AI credits exhausted - using fallback analysis");
        return new Response(
          JSON.stringify(getFallbackAnalysis(trendData, signalType)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify(getFallbackAnalysis(trendData, signalType)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.warn("AI response missing tool call - using fallback");
      return new Response(
        JSON.stringify(getFallbackAnalysis(trendData, signalType)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysis: AIAnalysisResult = JSON.parse(toolCall.function.arguments);
    
    // Clamp values to valid ranges
    analysis.confidenceAdjustment = Math.max(-20, Math.min(20, analysis.confidenceAdjustment));
    analysis.positionSizeMultiplier = Math.max(0.5, Math.min(1.5, analysis.positionSizeMultiplier));

    console.log(`🤖 AI Analysis for ${symbol}: ${analysis.recommendation} (conf adj: ${analysis.confidenceAdjustment > 0 ? '+' : ''}${analysis.confidenceAdjustment}, size: ${analysis.positionSizeMultiplier}x)`);
    console.log(`   Risk: ${analysis.riskLevel} | Factors: ${analysis.keyFactors.join(', ')}`);

    // Save analysis to database for dashboard visibility
    if (request.userId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase.from("ai_signal_analysis").insert({
          user_id: request.userId,
          symbol,
          signal_type: signalType,
          strategy_name: strategyName,
          recommendation: analysis.recommendation,
          confidence_adjustment: analysis.confidenceAdjustment,
          position_size_multiplier: analysis.positionSizeMultiplier,
          risk_level: analysis.riskLevel,
          key_factors: analysis.keyFactors,
          trend_data: trendData,
          entry_price: entryPrice,
          stop_loss: stopLoss,
          take_profit: takeProfit
        });
        console.log(`📊 AI analysis saved to database for ${symbol}`);
      } catch (dbError) {
        console.error("Failed to save AI analysis to database:", dbError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        symbol,
        signalType,
        analysis,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI signal analyzer error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Analysis failed",
        fallback: true
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback analysis when AI is unavailable
function getFallbackAnalysis(trendData: SignalAnalysisRequest['trendData'], signalType: string): { success: boolean; analysis: AIAnalysisResult; fallback: boolean } {
  const keyFactors: string[] = [];
  let confidenceAdj = 0;
  let sizeMultiplier = 1.0;
  let riskLevel: "low" | "medium" | "high" = "medium";

  // ADX analysis - Uses centralized ADX_THRESHOLDS
  if (trendData.adx >= ADX_THRESHOLDS.VERY_STRONG) {
    keyFactors.push(`Strong trend (ADX ≥${ADX_THRESHOLDS.VERY_STRONG})`);
    confidenceAdj += 5;
  } else if (trendData.adx < ADX_THRESHOLDS.MINIMUM) {
    keyFactors.push(`Weak trend (ADX <${ADX_THRESHOLDS.MINIMUM})`);
    confidenceAdj -= 5;
    sizeMultiplier *= 0.8;
  }

  // Momentum confirmation
  if (trendData.momentum.confirms) {
    keyFactors.push("Momentum confirmed");
    confidenceAdj += 5;
  } else {
    keyFactors.push("Momentum not confirmed");
    confidenceAdj -= 5;
    sizeMultiplier *= 0.9;
  }

  // Divergence warning
  if (trendData.momentum.divergence) {
    keyFactors.push("⚠️ Divergence detected");
    confidenceAdj -= 10;
    sizeMultiplier *= 0.7;
    riskLevel = "high";
  }

  // StochRSI extremes
  const isLong = signalType === "long";
  if (isLong && trendData.stochRSI.signal === "overbought") {
    keyFactors.push("StochRSI overbought (risky for LONG)");
    confidenceAdj -= 5;
    riskLevel = "high";
  } else if (!isLong && trendData.stochRSI.signal === "oversold") {
    keyFactors.push("StochRSI oversold (risky for SHORT)");
    confidenceAdj -= 5;
    riskLevel = "high";
  }

  // Volume confirmation
  if (trendData.volumeConfirms) {
    keyFactors.push("Volume confirms trend");
    confidenceAdj += 3;
  }

  // Bollinger squeeze
  if (trendData.bollingerBands.squeeze) {
    keyFactors.push("Bollinger squeeze (breakout potential)");
    sizeMultiplier *= 1.1;
  }

  // Determine recommendation
  let recommendation: AIAnalysisResult['recommendation'] = "normal_entry";
  if (confidenceAdj >= 10 && !trendData.momentum.divergence) {
    recommendation = "strong_entry";
    riskLevel = "low";
  } else if (confidenceAdj <= -10 || trendData.momentum.divergence) {
    recommendation = "caution";
  }

  return {
    success: true,
    fallback: true,
    analysis: {
      recommendation,
      confidenceAdjustment: Math.max(-20, Math.min(20, confidenceAdj)),
      positionSizeMultiplier: Math.max(0.5, Math.min(1.5, sizeMultiplier)),
      reasoning: "Fallback analysis based on technical indicators due to AI service unavailability.",
      keyFactors: keyFactors.slice(0, 5),
      riskLevel
    }
  };
}