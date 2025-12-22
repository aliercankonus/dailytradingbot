import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { createLogger, logError } from "../_shared/logging.ts";

// Create logger instance
const logger = createLogger("close-trade");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.boot();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { positionId, closeAll, manualClose = false, closedByRebalancer = false, user_id: bodyUserId } = await req.json();
    
    // Determine user ID - support both direct user calls and service role calls
    let userId: string | null = null;
    
    // Check for Authorization header (direct user call)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (!userError && user) {
        userId = user.id;
      }
    }
    
    // If no user from auth header, check for service role call with user_id in body
    // This happens when position-rebalancer or monitor-positions calls close-trade
    if (!userId && bodyUserId) {
      // Verify this is a service role call by checking the key
      const serviceKey = req.headers.get('apikey') || req.headers.get('Authorization')?.replace('Bearer ', '');
      if (serviceKey === supabaseServiceKey) {
        userId = bodyUserId;
        logger.info(`Service role call for user ${userId}`);
      }
    }
    
    if (!userId) {
      logger.warn("Unauthorized - no valid user");
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized - no valid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userLogger = logger.forUser(userId);
    userLogger.info(`Close trade request: positionId=${positionId || 'N/A'}, closeAll=${closeAll}, manualClose=${manualClose}, closedByRebalancer=${closedByRebalancer}`);

    let closedCount = 0;

    if (closeAll) {
      // Close all active positions for this user
      const { data: positions, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', userId);

      if (fetchError) throw fetchError;

      if (!positions || positions.length === 0) {
        userLogger.info("No active positions to close");
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No active positions to close',
            closedCount: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const position of positions) {
        const result = await closePosition(supabase, position, manualClose, closedByRebalancer, userLogger);
        if (result.success) closedCount++;
      }

      userLogger.summary(`Closed ${closedCount} positions`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Closed ${closedCount} positions`,
          closedCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Close single position for this user
      if (!positionId) {
        userLogger.warn("Position ID is required");
        return new Response(
          JSON.stringify({ success: false, error: 'Position ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: position, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', positionId)
        .eq('status', 'active')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (!position) {
        userLogger.warn(`Position ${positionId} not found or already closed`);
        return new Response(
          JSON.stringify({ success: false, error: 'Position not found or already closed' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await closePosition(supabase, position, manualClose, closedByRebalancer, userLogger);
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userLogger.success(`Position closed for ${position.symbol}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Position closed for ${position.symbol}`,
          position: result.position
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    logError(logger, error, "closing trade");
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

interface CloseResult {
  success: boolean;
  error?: string;
  position?: any;
}

async function closePosition(
  supabase: any, 
  position: any, 
  manualClose: boolean = false, 
  closedByRebalancer: boolean = false,
  parentLogger: any
): Promise<CloseResult> {
  const posLogger = parentLogger.forSymbol(position.symbol);
  
  try {
    // Fetch latest price from Binance for accurate P&L calculation
    let currentPrice = position.current_price || position.entry_price;
    
    try {
      const binanceResponse = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${position.symbol}`
      );
      
      if (binanceResponse.ok) {
        const binanceData = await binanceResponse.json();
        
        if (binanceData.price) {
          const parsedPrice = parseFloat(binanceData.price);
          if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
            currentPrice = parsedPrice;
            posLogger.info(`Fetched fresh price: ${currentPrice}`);
          } else {
            posLogger.warn(`Invalid price from Binance: ${binanceData.price}`);
          }
        } else {
          posLogger.warn(`No price from Binance, using stored current_price`);
        }
      } else {
        posLogger.warn(`Binance API error: ${binanceResponse.status}`);
      }
    } catch (error) {
      posLogger.error(`Failed to fetch Binance price: ${error}`);
      posLogger.info(`Falling back to stored current_price: ${currentPrice}`);
    }
    
    // Final validation - must have valid price
    if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      currentPrice = position.entry_price;
      posLogger.warn(`Using entry_price as fallback: ${currentPrice}`);
    }
    
    // Validate entry price for P&L calculation
    const entryPrice = position.entry_price;
    if (!entryPrice || !Number.isFinite(entryPrice) || entryPrice <= 0) {
      posLogger.error(`Invalid entry price for position ${position.id}: ${entryPrice}`);
      return { success: false, error: 'Invalid entry price' };
    }
    
    // Validate quantity
    const quantity = position.quantity;
    if (!quantity || !Number.isFinite(quantity) || quantity <= 0) {
      posLogger.error(`Invalid quantity for position ${position.id}: ${quantity}`);
      return { success: false, error: 'Invalid quantity' };
    }
    
    // Recalculate P&L from current price to ensure accuracy
    const pnl = position.side === 'BUY'
      ? (currentPrice - entryPrice) * quantity
      : (entryPrice - currentPrice) * quantity;
    
    const pnlPercent = position.side === 'BUY'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    
    posLogger.trade(`P&L calculation: entry=${entryPrice}, exit=${currentPrice}, qty=${quantity}, pnl=$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

    // Determine close reason
    const closeReason = manualClose ? 'manual_close' : (closedByRebalancer ? 'rebalancer' : 'system');

    // Update position status to closed with final P&L and rebalancer flag
    // Use optimistic locking to prevent race conditions
    const { data: updatedPosition, error: updateError } = await supabase
      .from('positions')
      .update({
        status: 'closed',
        current_price: currentPrice,
        realized_pnl: pnl,
        realized_pnl_percent: pnlPercent,
        exit_price: currentPrice,
        closed_at: new Date().toISOString(),
        closed_by_rebalancer: closedByRebalancer,
        close_reason: closeReason,
      })
      .eq('id', position.id)
      .eq('status', 'active') // RACE CONDITION FIX: Only update if still active
      .select()
      .maybeSingle();

    if (updateError) {
      posLogger.error(`Failed to update position: ${updateError.message}`);
      return { success: false, error: updateError.message };
    }

    // Check if position was actually updated (might have been closed by another process)
    if (!updatedPosition) {
      posLogger.warn(`Position ${position.id} was already closed by another process`);
      return { success: true, position: null }; // Still success, just already closed
    }

    // Update risk parameters for this user - sync with actual active positions
    const { count: activeCount, error: countError } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', position.user_id)
      .eq('status', 'active');

    if (countError) {
      posLogger.error(`Failed to count active positions: ${countError.message}`);
    }

    // Get current risk parameters to update consecutive losses and peak P&L
    const { data: currentRiskParams, error: riskFetchError } = await supabase
      .from('risk_parameters')
      .select('consecutive_losses, daily_realized_loss, last_loss_reset_date, daily_peak_pnl, portfolio_value')
      .eq('user_id', position.user_id)
      .maybeSingle();

    if (riskFetchError) {
      posLogger.error(`Failed to fetch risk parameters: ${riskFetchError.message}`);
    }

    // Update consecutive losses based on trade outcome
    let newConsecutiveLosses = 0;
    let updatedDailyLoss = currentRiskParams?.daily_realized_loss || 0;
    let updatedDailyPeakPnl = currentRiskParams?.daily_peak_pnl || 0;

    // Calculate running daily P&L (gains - losses)
    const currentDailyPnl = pnl > 0 
      ? (updatedDailyPeakPnl + pnl) // Add profit
      : (updatedDailyPeakPnl - Math.abs(pnl)); // Subtract loss

    if (pnl < 0) {
      // Trade was a loss - increment consecutive losses and add to daily loss
      newConsecutiveLosses = (currentRiskParams?.consecutive_losses || 0) + 1;
      updatedDailyLoss += Math.abs(pnl); // Add absolute value of loss
      posLogger.risk(`Trade loss - consecutive losses: ${newConsecutiveLosses}, daily loss: $${updatedDailyLoss.toFixed(2)}`);
    } else {
      // Trade was a win or breakeven - reset consecutive losses to 0
      newConsecutiveLosses = 0;
      // Update peak daily P&L if current is higher
      if (currentDailyPnl > updatedDailyPeakPnl) {
        updatedDailyPeakPnl = currentDailyPnl;
        posLogger.success(`New daily peak P&L: $${updatedDailyPeakPnl.toFixed(2)}`);
      }
      posLogger.info(`Trade win/breakeven - resetting consecutive losses to 0`);
    }

    const { error: riskUpdateError } = await supabase
      .from('risk_parameters')
      .update({
        current_open_trades: activeCount ?? 0,
        consecutive_losses: newConsecutiveLosses,
        daily_realized_loss: updatedDailyLoss,
        daily_peak_pnl: updatedDailyPeakPnl
      })
      .eq('user_id', position.user_id);

    if (riskUpdateError) {
      posLogger.error(`Failed to update risk parameters: ${riskUpdateError.message}`);
      // Don't fail the close operation for this
    }

    posLogger.success(`Closed position ${position.id} with P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    
    return { success: true, position: updatedPosition };
  } catch (error) {
    posLogger.error(`Error in closePosition for ${position.id}: ${error}`);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
