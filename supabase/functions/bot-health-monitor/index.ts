import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Health check thresholds
const HEALTH_CHECK_CONFIG = {
  // Time thresholds (in minutes)
  WARNING_THRESHOLD_MINUTES: 30,    // Warn if no activity for 30 min
  CRITICAL_THRESHOLD_MINUTES: 60,   // Critical if no activity for 1 hour
  
  // What counts as "activity"
  CHECK_SIGNALS: true,              // Check trading_signals table
  CHECK_POSITIONS: true,            // Check positions table for opens/closes
  CHECK_REJECTIONS: true,           // Check signal_rejection_log
  
  // Notification settings
  SEND_CRITICAL_ALERTS: true,       // Send email alerts on critical status
  ALERT_COOLDOWN_MINUTES: 60,       // Don't send alerts more often than this
  
  // Logging
  LOG_HEALTHY: true,                // Log even when healthy
  LOG_DETAILS: true,                // Log detailed activity counts
};

interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  lastActivityMinutesAgo: number | null;
  signalsGenerated: number;
  positionsOpened: number;
  positionsClosed: number;
  rejectionsLogged: number;
  botEnabled: boolean;
  message: string;
  alertSent?: boolean;
}

// Track last alert time to prevent spam (in-memory, resets on cold start)
const lastAlertSent: Record<string, number> = {};

async function sendCriticalAlert(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  healthStatus: HealthStatus
): Promise<boolean> {
  const now = Date.now();
  const lastSent = lastAlertSent[userId] || 0;
  const cooldownMs = HEALTH_CHECK_CONFIG.ALERT_COOLDOWN_MINUTES * 60 * 1000;
  
  // Check cooldown
  if (now - lastSent < cooldownMs) {
    console.log(`[BOT_HEALTH] Alert cooldown active for user ${userId.substring(0, 8)}, skipping notification`);
    return false;
  }

  try {
    // Get user's notification email from risk_parameters or profiles
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('notification_email, email_notifications_enabled')
      .eq('user_id', userId)
      .single();

    // Only send if email notifications are enabled
    if (!riskParams?.email_notifications_enabled) {
      console.log(`[BOT_HEALTH] Email notifications disabled for user ${userId.substring(0, 8)}`);
      return false;
    }

    let email = riskParams?.notification_email;
    
    // Fall back to profile email if no notification email set
    if (!email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();
      email = profile?.email;
    }

    if (!email) {
      console.warn(`[BOT_HEALTH] No email found for user ${userId.substring(0, 8)}, cannot send alert`);
      return false;
    }

    // Call send-notification function
    const notificationPayload = {
      type: 'bot_health_critical',
      userId,
      email,
      lastActivityMinutesAgo: healthStatus.lastActivityMinutesAgo,
      signalsGenerated: healthStatus.signalsGenerated,
      positionsOpened: healthStatus.positionsOpened,
      positionsClosed: healthStatus.positionsClosed,
      rejectionsLogged: healthStatus.rejectionsLogged,
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BOT_HEALTH] Failed to send notification: ${errorText}`);
      return false;
    }

    // Update cooldown tracker
    lastAlertSent[userId] = now;
    console.log(`[BOT_HEALTH] ✅ Critical alert sent to ${email} for user ${userId.substring(0, 8)}`);
    return true;

  } catch (error) {
    console.error(`[BOT_HEALTH] Error sending critical alert:`, error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[BOT_HEALTH] Starting health check...');

  try {
    // Get all users with trading enabled
    const { data: riskParams, error: riskError } = await supabase
      .from('risk_parameters')
      .select('user_id, is_trading_enabled, updated_at')
      .eq('is_trading_enabled', true);

    if (riskError) {
      console.error('[BOT_HEALTH] Error fetching risk parameters:', riskError);
      throw riskError;
    }

    if (!riskParams || riskParams.length === 0) {
      console.log('[BOT_HEALTH] No users have trading enabled - skipping health check');
      return new Response(
        JSON.stringify({ 
          status: 'skipped', 
          message: 'No users have trading enabled',
          usersChecked: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const healthResults: Record<string, HealthStatus> = {};
    const warningThreshold = new Date(Date.now() - HEALTH_CHECK_CONFIG.WARNING_THRESHOLD_MINUTES * 60 * 1000);
    const criticalThreshold = new Date(Date.now() - HEALTH_CHECK_CONFIG.CRITICAL_THRESHOLD_MINUTES * 60 * 1000);

    for (const user of riskParams) {
      const userId = user.user_id;
      const userIdShort = userId.substring(0, 8);

      // Check recent signals
      const { data: recentSignals, error: signalError } = await supabase
        .from('trading_signals')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', criticalThreshold.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (signalError) {
        console.error(`[BOT_HEALTH user=${userIdShort}] Error fetching signals:`, signalError);
      }

      // Check recent position opens
      const { data: recentOpens, error: openError } = await supabase
        .from('positions')
        .select('opened_at')
        .eq('user_id', userId)
        .gte('opened_at', criticalThreshold.toISOString())
        .order('opened_at', { ascending: false })
        .limit(10);

      if (openError) {
        console.error(`[BOT_HEALTH user=${userIdShort}] Error fetching position opens:`, openError);
      }

      // Check recent position closes
      const { data: recentCloses, error: closeError } = await supabase
        .from('positions')
        .select('closed_at')
        .eq('user_id', userId)
        .not('closed_at', 'is', null)
        .gte('closed_at', criticalThreshold.toISOString())
        .order('closed_at', { ascending: false })
        .limit(10);

      if (closeError) {
        console.error(`[BOT_HEALTH user=${userIdShort}] Error fetching position closes:`, closeError);
      }

      // Check recent rejections (proves bot is running even if no signals generated)
      const { data: recentRejections, error: rejectError } = await supabase
        .from('signal_rejection_log')
        .select('checked_at')
        .eq('user_id', userId)
        .gte('checked_at', criticalThreshold.toISOString())
        .order('checked_at', { ascending: false })
        .limit(10);

      if (rejectError) {
        console.error(`[BOT_HEALTH user=${userIdShort}] Error fetching rejections:`, rejectError);
      }

      // Calculate activity counts
      const signalsCount = recentSignals?.length || 0;
      const opensCount = recentOpens?.length || 0;
      const closesCount = recentCloses?.length || 0;
      const rejectionsCount = recentRejections?.length || 0;

      // Find most recent activity timestamp
      const allTimestamps: Date[] = [];
      
      if (recentSignals?.length) {
        allTimestamps.push(new Date(recentSignals[0].created_at));
      }
      if (recentOpens?.length) {
        allTimestamps.push(new Date(recentOpens[0].opened_at));
      }
      if (recentCloses?.length) {
        allTimestamps.push(new Date(recentCloses[0].closed_at));
      }
      if (recentRejections?.length) {
        allTimestamps.push(new Date(recentRejections[0].checked_at));
      }

      let lastActivityMinutesAgo: number | null = null;
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      let message = '';

      if (allTimestamps.length === 0) {
        // No activity at all in the critical window
        status = 'critical';
        lastActivityMinutesAgo = null;
        message = `🚨 CRITICAL: No bot activity detected in last ${HEALTH_CHECK_CONFIG.CRITICAL_THRESHOLD_MINUTES} minutes!`;
      } else {
        // Find the most recent timestamp
        const mostRecent = new Date(Math.max(...allTimestamps.map(d => d.getTime())));
        lastActivityMinutesAgo = Math.round((Date.now() - mostRecent.getTime()) / (60 * 1000));

        if (mostRecent < criticalThreshold) {
          status = 'critical';
          message = `🚨 CRITICAL: Last activity was ${lastActivityMinutesAgo} minutes ago!`;
        } else if (mostRecent < warningThreshold) {
          status = 'warning';
          message = `⚠️ WARNING: Last activity was ${lastActivityMinutesAgo} minutes ago`;
        } else {
          status = 'healthy';
          message = `✅ Healthy: Last activity ${lastActivityMinutesAgo} minutes ago`;
        }
      }

      // Store result
      const healthResult: HealthStatus = {
        status,
        lastActivityMinutesAgo,
        signalsGenerated: signalsCount,
        positionsOpened: opensCount,
        positionsClosed: closesCount,
        rejectionsLogged: rejectionsCount,
        botEnabled: true,
        message,
      };

      // Log based on status
      if (status === 'critical') {
        console.error(`[BOT_HEALTH user=${userIdShort}] ${message}`);
        console.error(`[BOT_HEALTH user=${userIdShort}]    Activity in last ${HEALTH_CHECK_CONFIG.CRITICAL_THRESHOLD_MINUTES}min: signals=${signalsCount}, opens=${opensCount}, closes=${closesCount}, rejections=${rejectionsCount}`);
        
        // Send critical alert notification
        if (HEALTH_CHECK_CONFIG.SEND_CRITICAL_ALERTS) {
          const alertSent = await sendCriticalAlert(supabaseUrl, supabaseKey, userId, healthResult);
          healthResult.alertSent = alertSent;
        }
        
      } else if (status === 'warning') {
        console.warn(`[BOT_HEALTH user=${userIdShort}] ${message}`);
        if (HEALTH_CHECK_CONFIG.LOG_DETAILS) {
          console.warn(`[BOT_HEALTH user=${userIdShort}]    Activity: signals=${signalsCount}, opens=${opensCount}, closes=${closesCount}, rejections=${rejectionsCount}`);
        }
      } else if (HEALTH_CHECK_CONFIG.LOG_HEALTHY) {
        console.log(`[BOT_HEALTH user=${userIdShort}] ${message}`);
        if (HEALTH_CHECK_CONFIG.LOG_DETAILS) {
          console.log(`[BOT_HEALTH user=${userIdShort}]    Activity: signals=${signalsCount}, opens=${opensCount}, closes=${closesCount}, rejections=${rejectionsCount}`);
        }
      }

      healthResults[userId] = healthResult;
    }

    // Summary
    const criticalCount = Object.values(healthResults).filter(r => r.status === 'critical').length;
    const warningCount = Object.values(healthResults).filter(r => r.status === 'warning').length;
    const healthyCount = Object.values(healthResults).filter(r => r.status === 'healthy').length;
    const alertsSentCount = Object.values(healthResults).filter(r => r.alertSent === true).length;

    const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

    console.log(`[BOT_HEALTH] Summary: ${healthyCount} healthy, ${warningCount} warning, ${criticalCount} critical, ${alertsSentCount} alerts sent`);

    return new Response(
      JSON.stringify({
        status: overallStatus,
        usersChecked: riskParams.length,
        summary: {
          healthy: healthyCount,
          warning: warningCount,
          critical: criticalCount,
          alertsSent: alertsSentCount,
        },
        thresholds: {
          warningMinutes: HEALTH_CHECK_CONFIG.WARNING_THRESHOLD_MINUTES,
          criticalMinutes: HEALTH_CHECK_CONFIG.CRITICAL_THRESHOLD_MINUTES,
        },
        results: healthResults,
        checkedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[BOT_HEALTH] Health check failed:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});