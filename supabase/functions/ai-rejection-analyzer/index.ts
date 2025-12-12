import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RejectionData {
  symbol: string;
  rejection_reason: string;
  filters_status: any;
  trend_data: any;
}

interface AIValidationResult {
  isValid: boolean;
  issues: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rejection } = await req.json() as { rejection: RejectionData };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a detailed prompt for the AI to analyze the rejection
    const systemPrompt = `You are an expert trading signal analyzer. Your job is to validate whether a signal rejection was correct based on the technical data provided.

IMPORTANT VALIDATION RULES:
1. ADX Filter: ADX should be >= 20 for signal generation. If ADX < 20, rejection is VALID.
2. Momentum Confirmation: Momentum state should be "confirmed" or at least "building". If "none" or "mixed" with low confidence, rejection may be VALID.
3. StochRSI Extremes: 
   - For LONG signals: If 4h StochRSI K > 90, need strong uptrend + no bearish divergence + StochRSI rising
   - For SHORT signals: If 4h StochRSI K < 10, need strong downtrend + no bullish divergence + StochRSI falling
4. Multi-Timeframe Alignment: 4h and 1h trends should align with the intended trade direction
5. Quality Score: Should be >= 60 for signal generation
6. Reversal Risk: If reversal risk > 50%, rejection is usually VALID unless ADX is very strong (>35)

Analyze the provided data and determine if the rejection reason is VALID or if there might be an issue with the logic.

Return a JSON object with:
- isValid: boolean (true if rejection appears correct)
- issues: string[] (list of any concerns or discrepancies found)
- confidence: "high" | "medium" | "low" (how confident you are in your assessment)
- summary: string (brief 1-2 sentence summary)`;

    const userPrompt = `Analyze this signal rejection:

Symbol: ${rejection.symbol}
Rejection Reason: ${rejection.rejection_reason}

Filters Status:
${JSON.stringify(rejection.filters_status, null, 2)}

Trend Data:
${JSON.stringify(rejection.trend_data, null, 2)}

Based on the rules, is this rejection VALID or are there potential issues?`;

    console.log(`🤖 AI analyzing rejection for ${rejection.symbol}: ${rejection.rejection_reason}`);

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "validate_rejection",
              description: "Validate whether a signal rejection was correct",
              parameters: {
                type: "object",
                properties: {
                  isValid: {
                    type: "boolean",
                    description: "True if the rejection appears to be correct based on the rules",
                  },
                  issues: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of any concerns or discrepancies found in the rejection logic",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "How confident the AI is in its assessment",
                  },
                  summary: {
                    type: "string",
                    description: "Brief 1-2 sentence summary of the analysis",
                  },
                },
                required: ["isValid", "issues", "confidence", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "validate_rejection" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("AI rate limited");
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.warn("AI payment required");
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract the tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response");
      return new Response(
        JSON.stringify({ error: "Invalid AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: AIValidationResult = JSON.parse(toolCall.function.arguments);
    
    console.log(`✅ AI analysis complete for ${rejection.symbol}: isValid=${result.isValid}, confidence=${result.confidence}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI rejection analyzer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
