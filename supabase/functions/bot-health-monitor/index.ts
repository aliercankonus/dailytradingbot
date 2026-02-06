import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= 3-TIER ALERTING CONFIGURATION =============
const ALERT_CONFIG = {
  // TIER 1: CRITICAL - No heartbeat
  HEARTBEAT_MISSING_MINUTES: 30,
  
  // TIER 2: WARNING - State persistence thresholds (hours)
  STATE_THRESHOLDS: {
    EXTREME_OVERBOUGHT: 6,
    EXTREME_OVERSOLD: 6,
    COUNTER_TREND_ONLY: 8,
    NO_ENERGY: 8,
    MIXED_BLOCK: 12,
    PULLBACK_WAITING: 10,
  } as Record<string, number>,
  DEFAULT_STATE_THRESHOLD_HOURS: 12,
  
  // TIER 3: CRITICAL - Operational concern (immediate)
  OPERATIONAL_CONCERN_IMMEDIATE: true,
  
  // Alert cooldown (prevent spam)
  COOLDOWN_MINUTES: 60,
  
  // Heartbeat retention (cleanup old records)
  HEARTBEAT_RETENTION_HOURS: 24,
};

interface AlertResult {
  alertType: 'heartbeat_missing' | 'state_prolonged' | 'operational_concern';
  severity: 'critical' | 'warning';
  message: string;
  details: Record<string, unknown>;
  alertSent: boolean;
}

interface HealthCheckResult {
  userId: string;
  status: 'healthy' | 'warning' | 'critical';
  lastHeartbeat: string | null;
  minutesSinceHeartbeat: number | null;
  currentState: string | null;
  stateStartedAt: string | null;
  stateDurationHours: number | null;
  alerts: AlertResult[];
}

// Send alert email via send-notification function
async function sendHealthAlert(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  alert: AlertResult
): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get user's notification preferences
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('notification_email, email_notifications_enabled')
      .eq('user_id', userId)
      .single();
    
    if (!riskParams?.email_notifications_enabled) {
      console.log(`[HEALTH_MONITOR] Email notifications disabled for user ${userId.substring(0, 8)}`);
      return false;
    }
    
    let email = riskParams?.notification_email;
    
    // Fallback to profile email
    if (!email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();
      email = profile?.email;
    }
    
    if (!email) {
      console.warn(`[HEALTH_MONITOR] No email found for user ${userId.substring(0, 8)}`);
      return false;
    }
    
    // Prepare notification payload based on alert type
    const notificationPayload = {
      type: alert.alertType === 'heartbeat_missing' ? 'bot_health_critical' : 
            alert.alertType === 'operational_concern' ? 'bot_health_critical' : 
            'bot_health_warning',
      userId,
      email,
      alertType: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      ...alert.details,
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
      console.error(`[HEALTH_MONITOR] Failed to send notification: ${errorText}`);
      return false;
    }
    
    console.log(`[HEALTH_MONITOR] ✅ Alert sent to ${email}: ${alert.alertType}`);
    return true;
  } catch (error) {
    console.error(`[HEALTH_MONITOR] Error sending alert:`, error);
    return false;
  }
}

// Check if we're within cooldown period for this alert type
async function isWithinCooldown(
  supabase: any,
  userId: string,
  alertType: string
): Promise<boolean> {
  const cooldownTime = new Date(Date.now() - ALERT_CONFIG.COOLDOWN_MINUTES * 60 * 1000);
  
  const { data: recentAlert } = await supabase
    .from('bot_health_state')
    .select('alert_sent_at')
    .eq('user_id', userId)
    .eq('state_type', alertType)
    .eq('alert_sent', true)
    .gte('alert_sent_at', cooldownTime.toISOString())
    .order('alert_sent_at', { ascending: false })
    .limit(1);
  
  return recentAlert && recentAlert.length > 0;
}

// Update or create state tracking record
async function updateStateTracking(
  supabase: any,
  userId: string,
  stateType: string,
  state: string,
  details: Record<string, unknown>
): Promise<{ isNew: boolean; startedAt: string; durationHours: number }> {
  const now = new Date().toISOString();
  
  // Check for existing active state
  const { data: existingState } = await supabase
    .from('bot_health_state')
    .select('*')
    .eq('user_id', userId)
    .eq('state_type', stateType)
    .eq('state', state)
    .is('resolved_at', null)
    .single();
  
  if (existingState) {
    // Update last_seen_at
    await supabase
      .from('bot_health_state')
      .update({ last_seen_at: now, details })
      .eq('id', existingState.id);
    
    const startedAt = new Date(existingState.started_at);
    const durationHours = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);
    
    return { isNew: false, startedAt: existingState.started_at, durationHours };
  }
  
  // Resolve any previous states of this type
  await supabase
    .from('bot_health_state')
    .update({ resolved_at: now })
    .eq('user_id', userId)
    .eq('state_type', stateType)
    .is('resolved_at', null);
  
  // Create new state
  await supabase
    .from('bot_health_state')
    .insert({
      user_id: userId,
      state_type: stateType,
      state,
      started_at: now,
      last_seen_at: now,
      details,
    });
  
  return { isNew: true, startedAt: now, durationHours: 0 };
}

// Mark alert as sent
async function markAlertSent(
  supabase: any,
  userId: string,
  stateType: string,
  state: string
): Promise<void> {
  const now = new Date().toISOString();
  
  await supabase
    .from('bot_health_state')
    .update({ alert_sent: true, alert_sent_at: now })
    .eq('user_id', userId)
    .eq('state_type', stateType)
    .eq('state', state)
    .is('resolved_at', null);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[HEALTH_MONITOR] Starting 3-tier health check...');

  try {
    // Get all users with trading enabled
    const { data: riskParams, error: riskError } = await supabase
      .from('risk_parameters')
      .select('user_id, is_trading_enabled')
      .eq('is_trading_enabled', true);

    if (riskError) throw riskError;

    if (!riskParams || riskParams.length === 0) {
      console.log('[HEALTH_MONITOR] No users have trading enabled');
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'No active traders', usersChecked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: HealthCheckResult[] = [];
    let criticalCount = 0;
    let warningCount = 0;
    let alertsSentCount = 0;

    for (const user of riskParams) {
      const userId = user.user_id;
      const userIdShort = userId.substring(0, 8);
      const alerts: AlertResult[] = [];
      let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

      // ===== TIER 1: Check for missing heartbeat =====
      const heartbeatThreshold = new Date(Date.now() - ALERT_CONFIG.HEARTBEAT_MISSING_MINUTES * 60 * 1000);
      
      const { data: latestHeartbeat } = await supabase
        .from('bot_heartbeat')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      let lastHeartbeatTime: Date | null = null;
      let minutesSinceHeartbeat: number | null = null;

      if (latestHeartbeat && latestHeartbeat.length > 0) {
        lastHeartbeatTime = new Date(latestHeartbeat[0].recorded_at);
        minutesSinceHeartbeat = Math.round((Date.now() - lastHeartbeatTime.getTime()) / (1000 * 60));
        
        if (lastHeartbeatTime < heartbeatThreshold) {
          // TIER 1 ALERT: No heartbeat for 30+ minutes
          overallStatus = 'critical';
          
          const withinCooldown = await isWithinCooldown(supabase, userId, 'heartbeat_missing');
          if (!withinCooldown) {
            const alert: AlertResult = {
              alertType: 'heartbeat_missing',
              severity: 'critical',
              message: `Trading bot heartbeat missing for ${minutesSinceHeartbeat} minutes`,
              details: {
                lastActivityMinutesAgo: minutesSinceHeartbeat,
                lastHeartbeat: latestHeartbeat[0].recorded_at,
                signalsGenerated: latestHeartbeat[0].signals_generated,
                rejectionsLogged: latestHeartbeat[0].rejections_logged,
              },
              alertSent: false,
            };
            
            const sent = await sendHealthAlert(supabaseUrl, supabaseKey, userId, alert);
            alert.alertSent = sent;
            if (sent) {
              alertsSentCount++;
              await updateStateTracking(supabase, userId, 'heartbeat_missing', 'active', alert.details);
              await markAlertSent(supabase, userId, 'heartbeat_missing', 'active');
            }
            alerts.push(alert);
          }
          
          console.error(`[HEALTH_MONITOR user=${userIdShort}] 🚨 CRITICAL: No heartbeat for ${minutesSinceHeartbeat} min`);
          criticalCount++;
        }
      } else {
        // No heartbeat at all
        overallStatus = 'critical';
        console.error(`[HEALTH_MONITOR user=${userIdShort}] 🚨 CRITICAL: No heartbeat records found`);
        criticalCount++;
      }

      // ===== TIER 2: Check for prolonged no-trade state =====
      if (latestHeartbeat && latestHeartbeat.length > 0) {
        const currentState = latestHeartbeat[0].no_trade_state;
        
        if (currentState && currentState !== 'OPERATIONAL') {
          // Track this state
          const stateTracking = await updateStateTracking(
            supabase, 
            userId, 
            'no_trade_state', 
            currentState,
            { 
              reason: latestHeartbeat[0].no_trade_reason,
              symbolsScanned: latestHeartbeat[0].symbols_scanned,
            }
          );
          
          // Check if state exceeds threshold
          const threshold = ALERT_CONFIG.STATE_THRESHOLDS[currentState] || ALERT_CONFIG.DEFAULT_STATE_THRESHOLD_HOURS;
          
          if (stateTracking.durationHours >= threshold) {
            if (overallStatus === 'healthy') overallStatus = 'warning';
            
            const withinCooldown = await isWithinCooldown(supabase, userId, `state_${currentState}`);
            if (!withinCooldown) {
              const alert: AlertResult = {
                alertType: 'state_prolonged',
                severity: 'warning',
                message: `Bot stuck in ${currentState} for ${stateTracking.durationHours.toFixed(1)} hours`,
                details: {
                  state: currentState,
                  reason: latestHeartbeat[0].no_trade_reason,
                  startedAt: stateTracking.startedAt,
                  durationHours: stateTracking.durationHours,
                  threshold,
                },
                alertSent: false,
              };
              
              const sent = await sendHealthAlert(supabaseUrl, supabaseKey, userId, alert);
              alert.alertSent = sent;
              if (sent) {
                alertsSentCount++;
                await markAlertSent(supabase, userId, 'no_trade_state', currentState);
              }
              alerts.push(alert);
            }
            
            console.warn(`[HEALTH_MONITOR user=${userIdShort}] ⚠️ WARNING: ${currentState} for ${stateTracking.durationHours.toFixed(1)}h (threshold: ${threshold}h)`);
            warningCount++;
          }
          
          // ===== TIER 3: Check for OPERATIONAL_CONCERN =====
          if (currentState === 'OPERATIONAL_CONCERN' && ALERT_CONFIG.OPERATIONAL_CONCERN_IMMEDIATE) {
            overallStatus = 'critical';
            
            const withinCooldown = await isWithinCooldown(supabase, userId, 'operational_concern');
            if (!withinCooldown) {
              const alert: AlertResult = {
                alertType: 'operational_concern',
                severity: 'critical',
                message: 'Bot running but producing no signals AND no rejections - check data feeds',
                details: {
                  symbolsScanned: latestHeartbeat[0].symbols_scanned,
                  signalsGenerated: latestHeartbeat[0].signals_generated,
                  rejectionsLogged: latestHeartbeat[0].rejections_logged,
                  lastHeartbeat: latestHeartbeat[0].recorded_at,
                },
                alertSent: false,
              };
              
              const sent = await sendHealthAlert(supabaseUrl, supabaseKey, userId, alert);
              alert.alertSent = sent;
              if (sent) {
                alertsSentCount++;
                await markAlertSent(supabase, userId, 'operational_concern', 'active');
              }
              alerts.push(alert);
            }
            
            console.error(`[HEALTH_MONITOR user=${userIdShort}] 🚨 CRITICAL: OPERATIONAL_CONCERN - no signals AND no rejections`);
            criticalCount++;
          }
        } else {
          // State is OPERATIONAL - resolve any pending state alerts
          await supabase
            .from('bot_health_state')
            .update({ resolved_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('state_type', 'no_trade_state')
            .is('resolved_at', null);
        }
      }

      results.push({
        userId,
        status: overallStatus,
        lastHeartbeat: lastHeartbeatTime?.toISOString() || null,
        minutesSinceHeartbeat,
        currentState: latestHeartbeat?.[0]?.no_trade_state || null,
        stateStartedAt: null,
        stateDurationHours: null,
        alerts,
      });
    }

    // Cleanup old heartbeats (keep last 24 hours)
    const cleanupThreshold = new Date(Date.now() - ALERT_CONFIG.HEARTBEAT_RETENTION_HOURS * 60 * 60 * 1000);
    const { error: cleanupError } = await supabase
      .from('bot_heartbeat')
      .delete()
      .lt('recorded_at', cleanupThreshold.toISOString());
    
    if (cleanupError) {
      console.warn(`[HEALTH_MONITOR] Heartbeat cleanup failed: ${cleanupError.message}`);
    }

    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

    console.log(`[HEALTH_MONITOR] Summary: ${healthyCount} healthy, ${warningCount} warning, ${criticalCount} critical, ${alertsSentCount} alerts sent`);

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
          heartbeatMissingMinutes: ALERT_CONFIG.HEARTBEAT_MISSING_MINUTES,
          stateThresholds: ALERT_CONFIG.STATE_THRESHOLDS,
          cooldownMinutes: ALERT_CONFIG.COOLDOWN_MINUTES,
        },
        results,
        checkedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[HEALTH_MONITOR] Health check failed:', error);
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
