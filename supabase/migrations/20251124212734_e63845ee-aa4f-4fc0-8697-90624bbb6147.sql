
-- Create function to initialize risk parameters for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_risk_parameters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.risk_parameters (
    user_id,
    portfolio_value,
    max_open_trades,
    max_risk_per_trade_percent,
    max_trades_per_symbol,
    daily_loss_limit_percent,
    consecutive_loss_threshold,
    position_size_reduction_percent,
    min_confidence_threshold,
    min_trend_consistency,
    is_trading_enabled,
    paper_trading_mode,
    auto_execute_signals,
    email_notifications_enabled,
    sms_notifications_enabled,
    trailing_stop_enabled,
    trailing_stop_activation_percent,
    trailing_stop_distance_multiplier,
    auto_rebalance_enabled,
    rebalance_loss_threshold_percent,
    max_positions_to_close_per_cycle,
    enable_pullback_signals,
    pullback_position_size_percent,
    enable_early_reversal_signals,
    early_reversal_position_size_percent,
    standard_tp_multiplier,
    divergence_tp_multiplier,
    divergence_sl_multiplier,
    current_open_trades,
    consecutive_losses,
    daily_realized_loss,
    last_loss_reset_date
  )
  VALUES (
    NEW.id,
    10000,              -- Default $10k portfolio
    5,                  -- Max 5 open trades
    1.5,                -- 1.5% risk per trade
    1,                  -- 1 trade per symbol
    5.0,                -- 5% daily loss limit
    3,                  -- Stop after 3 consecutive losses
    50,                 -- 50% position size reduction after losses
    60,                 -- 60% minimum confidence threshold
    50,                 -- 50% minimum trend consistency
    true,               -- Trading enabled by default
    true,               -- Paper trading mode (safe default)
    true,               -- Auto-execute signals
    true,               -- Email notifications enabled
    true,               -- SMS notifications enabled
    true,               -- Trailing stop enabled
    1.0,                -- 1% trailing stop activation
    1.5,                -- 1.5x ATR distance multiplier
    false,              -- Auto rebalance disabled by default
    1.0,                -- 1% rebalance loss threshold
    3,                  -- Max 3 positions to close per rebalance cycle
    true,               -- Pullback signals enabled
    50,                 -- 50% position size for pullbacks
    true,               -- Early reversal signals enabled
    40,                 -- 40% position size for early reversals
    2.5,                -- 2.5x take profit for standard signals
    2.0,                -- 2.0x take profit for divergence signals
    0.67,               -- 0.67x stop loss for divergence signals
    0,                  -- No open trades initially
    0,                  -- No consecutive losses
    0,                  -- No daily losses
    CURRENT_DATE        -- Reset date
  );
  RETURN NEW;
END;
$$;

-- Create trigger to auto-initialize risk parameters for new users
DROP TRIGGER IF EXISTS on_auth_user_created_risk_params ON auth.users;
CREATE TRIGGER on_auth_user_created_risk_params
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_risk_parameters();
