import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

interface TwilioResponse {
  sid?: string;
  error_message?: string;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'trade_executed' | 'stop_loss_hit' | 'take_profit_hit' | 'strategy_rotation' | 'trailing_stop_activated' | 'bot_health_critical' | 'bot_health_warning';
  userId?: string;
  tradeId?: string;
  symbol?: string;
  side?: string;
  price?: number;
  quantity?: number;
  profitLoss?: number;
  email?: string;
  // Strategy rotation fields
  fromStrategy?: string;
  toStrategy?: string;
  reason?: string;
  fromMetrics?: {
    winRate: number;
    profit: number;
    trades: number;
    maxDrawdown: number;
  };
  toMetrics?: {
    winRate: number;
    profit: number;
    trades: number;
    maxDrawdown: number;
  };
  marketCondition?: {
    volatility: number;
    trend: string;
    volume: number;
  };
  // Trailing stop fields
  oldStopLoss?: number;
  newStopLoss?: number;
  pnlPercent?: number;
  // Bot health critical fields
  lastActivityMinutesAgo?: number | null;
  signalsGenerated?: number;
  positionsOpened?: number;
  positionsClosed?: number;
  rejectionsLogged?: number;
  // Bot health warning fields (state prolonged)
  alertType?: string;
  state?: string;
  durationHours?: number;
  threshold?: number;
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

    // Get notification preferences
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('notification_phone, sms_notifications_enabled')
      .single();

    let subject = '';
    let message = '';
    let smsMessage = '';

    switch (payload.type) {
      case 'trade_executed':
        subject = `Trade Executed: ${payload.side!.toUpperCase()} ${payload.symbol}`;
        message = `
          <h2>Trade Executed Successfully</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Side:</strong> ${payload.side!.toUpperCase()}</p>
          <p><strong>Price:</strong> $${payload.price!.toFixed(4)}</p>
          <p><strong>Quantity:</strong> ${payload.quantity}</p>
          <p><strong>Total:</strong> $${(payload.price! * payload.quantity!).toFixed(4)}</p>
        `;
        smsMessage = `Trade Executed: ${payload.side!.toUpperCase()} ${payload.symbol} @ $${payload.price!.toFixed(4)} x${payload.quantity}`;
        break;
      
      case 'stop_loss_hit':
        subject = `🚨 Stop Loss Hit: ${payload.symbol}`;
        message = `
          <h2>⚠️ Stop Loss Triggered</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Exit Price:</strong> $${payload.price!.toFixed(4)}</p>
          <p><strong>Loss:</strong> <span style="color: #ef4444;">$${payload.profitLoss?.toFixed(2)}</span></p>
        `;
        smsMessage = `🚨 STOP LOSS HIT: ${payload.symbol} @ $${payload.price!.toFixed(4)}. Loss: $${payload.profitLoss?.toFixed(2)}`;
        break;
      
      case 'take_profit_hit':
        subject = `✅ Take Profit Hit: ${payload.symbol}`;
        message = `
          <h2>✅ Take Profit Achieved</h2>
          <p><strong>Symbol:</strong> ${payload.symbol}</p>
          <p><strong>Exit Price:</strong> $${payload.price!.toFixed(4)}</p>
          <p><strong>Profit:</strong> <span style="color: #10b981;">$${payload.profitLoss?.toFixed(2)}</span></p>
        `;
        smsMessage = `✅ TAKE PROFIT: ${payload.symbol} @ $${payload.price!.toFixed(4)}. Profit: $${payload.profitLoss?.toFixed(2)}`;
        break;
      
      case 'strategy_rotation':
        subject = `🔄 Strategy Rotation: ${payload.fromStrategy} → ${payload.toStrategy}`;
        const profitChangeNum = payload.toMetrics!.profit - payload.fromMetrics!.profit;
        const winRateChangeNum = payload.toMetrics!.winRate - payload.fromMetrics!.winRate;
        const profitChange = profitChangeNum.toFixed(2);
        const winRateChange = winRateChangeNum.toFixed(1);
        message = `
          <h2>🔄 Strategy Rotation Completed</h2>
          <p style="margin-bottom: 20px;">${payload.reason}</p>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h3 style="margin-top: 0; color: #ef4444;">Previous Strategy: ${payload.fromStrategy}</h3>
            <p><strong>Win Rate:</strong> ${payload.fromMetrics!.winRate.toFixed(1)}%</p>
            <p><strong>Total Profit:</strong> $${payload.fromMetrics!.profit.toFixed(2)}</p>
            <p><strong>Total Trades:</strong> ${payload.fromMetrics!.trades}</p>
            <p><strong>Max Drawdown:</strong> ${payload.fromMetrics!.maxDrawdown.toFixed(2)}%</p>
          </div>
          
          <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h3 style="margin-top: 0; color: #10b981;">New Strategy: ${payload.toStrategy}</h3>
            <p><strong>Win Rate:</strong> ${payload.toMetrics!.winRate.toFixed(1)}% <span style="color: ${winRateChangeNum >= 0 ? '#10b981' : '#ef4444'};">(${winRateChangeNum > 0 ? '+' : ''}${winRateChange}%)</span></p>
            <p><strong>Total Profit:</strong> $${payload.toMetrics!.profit.toFixed(2)} <span style="color: ${profitChangeNum >= 0 ? '#10b981' : '#ef4444'};">(${profitChangeNum > 0 ? '+' : ''}$${profitChange})</span></p>
            <p><strong>Total Trades:</strong> ${payload.toMetrics!.trades}</p>
            <p><strong>Max Drawdown:</strong> ${payload.toMetrics!.maxDrawdown.toFixed(2)}%</p>
          </div>
          
          <div style="background: #eff6ff; padding: 15px; border-radius: 8px;">
            <h3 style="margin-top: 0; color: #2563eb;">Market Conditions</h3>
            <p><strong>Trend:</strong> ${payload.marketCondition!.trend.toUpperCase()}</p>
            <p><strong>Volatility:</strong> ${payload.marketCondition!.volatility.toFixed(1)}</p>
            <p><strong>Volume:</strong> ${payload.marketCondition!.volume.toLocaleString()}</p>
          </div>
        `;
        smsMessage = `🔄 STRATEGY ROTATION: ${payload.fromStrategy} → ${payload.toStrategy}. Win rate: ${payload.toMetrics!.winRate.toFixed(1)}% (${winRateChangeNum > 0 ? '+' : ''}${winRateChange}%). Market: ${payload.marketCondition!.trend}`;
        break;

      case 'trailing_stop_activated':
        subject = `🛡️ Trailing Stop Activated: ${payload.symbol}`;
        const stopLossDiff = payload.side === 'BUY' 
          ? payload.newStopLoss! - payload.oldStopLoss!
          : payload.oldStopLoss! - payload.newStopLoss!;
        const stopLossImprovement = ((stopLossDiff / payload.oldStopLoss!) * 100).toFixed(2);
        
        message = `
          <h2>🛡️ Trailing Stop Loss Activated</h2>
          <p>Your profits are now being protected!</p>
          
          <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Symbol:</strong> ${payload.symbol}</p>
            <p><strong>Side:</strong> ${payload.side}</p>
            <p><strong>Current P&L:</strong> <span style="color: #10b981;">+${payload.pnlPercent!.toFixed(2)}%</span></p>
            <p><strong>Current Price:</strong> $${payload.price!.toFixed(2)}</p>
          </div>
          
          <div style="background: #eff6ff; padding: 15px; border-radius: 8px;">
            <h3 style="margin-top: 0;">Stop Loss Updated</h3>
            <p><strong>Previous Stop Loss:</strong> <span style="text-decoration: line-through;">$${payload.oldStopLoss!.toFixed(2)}</span></p>
            <p><strong>New Stop Loss:</strong> <span style="color: #2563eb; font-size: 1.2em;">$${payload.newStopLoss!.toFixed(2)}</span></p>
            <p><strong>Improvement:</strong> <span style="color: #10b981;">+${stopLossImprovement}%</span></p>
          </div>
          
          <p style="margin-top: 20px;">
            The trailing stop will continue to adjust automatically as the price moves in your favor, 
            locking in more profits while giving the position room to breathe.
          </p>
        `;
        smsMessage = `🛡️ TRAILING STOP: ${payload.symbol} ${payload.side} stop moved to $${payload.newStopLoss!.toFixed(2)} (was $${payload.oldStopLoss!.toFixed(2)}). P&L: +${payload.pnlPercent!.toFixed(2)}%`;
        break;

      case 'bot_health_critical':
        subject = `🚨 CRITICAL: Trading Bot Inactive for ${payload.lastActivityMinutesAgo || 60}+ Minutes`;
        const activityDetails = payload.lastActivityMinutesAgo 
          ? `Last activity was ${payload.lastActivityMinutesAgo} minutes ago.`
          : 'No activity detected in the last 60+ minutes.';
        
        message = `
          <h2>🚨 Bot Health Critical Alert</h2>
          <p style="color: #ef4444; font-size: 1.1em;"><strong>${activityDetails}</strong></p>
          <p>Your trading bot may have stopped processing or encountered an issue.</p>
          
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #991b1b;">Activity in Last 60 Minutes</h3>
            <p><strong>Signals Generated:</strong> ${payload.signalsGenerated ?? 0}</p>
            <p><strong>Positions Opened:</strong> ${payload.positionsOpened ?? 0}</p>
            <p><strong>Positions Closed:</strong> ${payload.positionsClosed ?? 0}</p>
            <p><strong>Rejections Logged:</strong> ${payload.rejectionsLogged ?? 0}</p>
          </div>
          
          <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin-top: 15px;">
            <h3 style="margin-top: 0; color: #92400e;">Recommended Actions</h3>
            <ol>
              <li>Check your dashboard for any error indicators</li>
              <li>Verify your API keys are still valid</li>
              <li>Check if trading is still enabled in your settings</li>
              <li>Review the market conditions - the bot may be waiting for better opportunities</li>
            </ol>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
            This alert is sent when no bot activity (signals, trades, or rejections) is detected for more than 60 minutes while trading is enabled.
          </p>
        `;
        smsMessage = `🚨 CRITICAL: Trading bot inactive for ${payload.lastActivityMinutesAgo || 60}+ min. Check your dashboard immediately!`;
        break;

      case 'bot_health_warning':
        subject = `⚠️ WARNING: Bot stuck in ${payload.state} for ${payload.durationHours?.toFixed(1) || '?'}h`;
        const stateDisplay = payload.state?.replace(/_/g, ' ') || 'unknown state';
        const reasonDisplay = (payload as any).reason || 'No specific reason provided';
        
        message = `
          <h2>⚠️ Bot No-Trade State Alert</h2>
          <p style="font-size: 1.1em;">Your trading bot has been in a no-trade state for an extended period.</p>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #92400e;">Current State: ${stateDisplay}</h3>
            <p><strong>Duration:</strong> ${payload.durationHours?.toFixed(1) || '?'} hours</p>
            <p><strong>Threshold:</strong> ${payload.threshold || '?'} hours</p>
            <p><strong>Reason:</strong> ${reasonDisplay}</p>
          </div>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 15px;">
            <h3 style="margin-top: 0;">What This Means</h3>
            <p>This is <strong>not necessarily an error</strong>. The bot may be correctly waiting for better market conditions.</p>
            <ul>
              <li><strong>EXTREME_OVERBOUGHT:</strong> All symbols at StochRSI K > 95 — waiting for cooldown</li>
              <li><strong>EXTREME_OVERSOLD:</strong> All symbols at StochRSI K < 5 — waiting for bounce</li>
              <li><strong>COUNTER_TREND_ONLY:</strong> Only counter-trend entries available — blocked for safety</li>
              <li><strong>NO_ENERGY:</strong> ADX too low — no trending energy in the market</li>
              <li><strong>MIXED_BLOCK:</strong> Various gates blocking different symbols</li>
            </ul>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
            This alert triggers when the same no-trade state persists beyond configured thresholds. 
            Review market conditions to verify this is expected behavior.
          </p>
        `;
        smsMessage = `⚠️ WARNING: Bot stuck in ${stateDisplay} for ${payload.durationHours?.toFixed(1) || '?'}h. Check market conditions.`;
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

    // Send SMS notification for critical events (stop loss, take profit, strategy rotation, bot health critical)
    let smsResponse;
    if (
      riskParams?.sms_notifications_enabled &&
      riskParams?.notification_phone &&
      twilioAccountSid &&
      twilioAuthToken &&
      twilioPhoneNumber &&
      (payload.type === 'stop_loss_hit' || payload.type === 'take_profit_hit' || payload.type === 'strategy_rotation' || payload.type === 'bot_health_critical')
    ) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', riskParams.notification_phone);
        formData.append('From', twilioPhoneNumber);
        formData.append('Body', smsMessage);

        const twilioResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!twilioResponse.ok) {
          const errorData = await twilioResponse.json();
          console.error('Twilio error:', errorData);
          throw new Error(`Twilio error: ${errorData.message}`);
        }

        smsResponse = await twilioResponse.json();
        console.log('SMS sent:', smsResponse);
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError);
        // Don't fail the entire notification if SMS fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailResponse, smsResponse }),
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
