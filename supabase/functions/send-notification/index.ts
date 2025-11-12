import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'trade_executed' | 'stop_loss_hit' | 'take_profit_hit';
  tradeId: string;
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  profitLoss?: number;
  email?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: NotificationRequest = await req.json();
    console.log('Notification request:', payload);

    let subject = '';
    let message = '';

    switch (payload.type) {
      case 'trade_executed':
        subject = `Trade Executed: ${payload.side.toUpperCase()} ${payload.symbol}`;
        message = `
          <h2>Trade Executed Successfully</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Side:</strong> ${payload.side.toUpperCase()}</p>
          <p><strong>Price:</strong> $${payload.price.toFixed(2)}</p>
          <p><strong>Quantity:</strong> ${payload.quantity}</p>
          <p><strong>Total:</strong> $${(payload.price * payload.quantity).toFixed(2)}</p>
        `;
        break;
      
      case 'stop_loss_hit':
        subject = `Stop Loss Hit: ${payload.symbol}`;
        message = `
          <h2>⚠️ Stop Loss Triggered</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Exit Price:</strong> $${payload.price.toFixed(2)}</p>
          <p><strong>Loss:</strong> <span style="color: #ef4444;">$${payload.profitLoss?.toFixed(2)}</span></p>
        `;
        break;
      
      case 'take_profit_hit':
        subject = `Take Profit Hit: ${payload.symbol}`;
        message = `
          <h2>✅ Take Profit Achieved</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Exit Price:</strong> $${payload.price.toFixed(2)}</p>
          <p><strong>Profit:</strong> <span style="color: #10b981;">$${payload.profitLoss?.toFixed(2)}</span></p>
        `;
        break;
    }

    // Default email if not provided
    const emailTo = payload.email || 'trader@example.com';

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "Trading Bot <onboarding@resend.dev>",
      to: [emailTo],
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              h2 { color: #2563eb; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              ${message}
              <div class="footer">
                <p>This is an automated notification from your Trading Bot. Trade ID: ${payload.tradeId}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log('Email sent:', emailResponse);

    // Store notification in database
    const { error: dbError } = await supabase
      .from('notifications')
      .insert({
        type: payload.type,
        trade_id: payload.tradeId,
        message: subject,
      });

    if (dbError) {
      console.error('Error storing notification:', dbError);
    }

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
