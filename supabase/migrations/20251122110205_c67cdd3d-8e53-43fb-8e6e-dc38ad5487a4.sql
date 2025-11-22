-- Add close_reason column to positions table to track exit type
ALTER TABLE positions ADD COLUMN close_reason TEXT;

-- Add comment for clarity
COMMENT ON COLUMN positions.close_reason IS 'Reason for position closure: take_profit, stop_loss, trailing_stop_loss, trend_reversal_bullish, trend_reversal_bearish, manual';