-- Add strategy_name column to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_name TEXT;

-- Add strategy_id column to trading_signals table to track which strategy generated the signal
ALTER TABLE trading_signals ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES custom_strategies(id);
ALTER TABLE trading_signals ADD COLUMN IF NOT EXISTS strategy_name TEXT;