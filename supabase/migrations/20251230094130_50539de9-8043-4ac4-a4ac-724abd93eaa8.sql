-- Add columns for enhanced tracking and R-multiple calculations
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS initial_risk_amount DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS execution_slippage_percent DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS volume_relaxation_applied BOOLEAN DEFAULT FALSE;

ALTER TABLE positions_archive 
ADD COLUMN IF NOT EXISTS initial_risk_amount DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS execution_slippage_percent DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS volume_relaxation_applied BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN positions.initial_risk_amount IS 'Initial risk in USDT for R-multiple tracking: abs(entry_price - stop_loss) * quantity';
COMMENT ON COLUMN positions.execution_slippage_percent IS 'Post-execution slippage percentage from signal price to executed price';
COMMENT ON COLUMN positions.volume_relaxation_applied IS 'Whether volume relaxation was applied for trend-forming low-volume entries';