-- Add columns for Mean Reversion Strategy support
-- Entry ATR storage for volatility-adjusted exits
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS entry_atr DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS entry_atr_percent DECIMAL(10, 4);

-- MAE (Max Adverse Excursion) tracking for analytics
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS max_adverse_excursion_atr DECIMAL(10, 4);

-- Also add to positions_archive for consistency
ALTER TABLE positions_archive 
ADD COLUMN IF NOT EXISTS entry_atr DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS entry_atr_percent DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS max_adverse_excursion_atr DECIMAL(10, 4);

-- Add comments for documentation
COMMENT ON COLUMN positions.entry_atr IS 'ATR value at time of trade entry, used for volatility-adjusted exits';
COMMENT ON COLUMN positions.entry_atr_percent IS 'ATR as percentage of entry price at time of trade entry';
COMMENT ON COLUMN positions.max_adverse_excursion_atr IS 'Maximum adverse price excursion in ATR units (for analytics)';