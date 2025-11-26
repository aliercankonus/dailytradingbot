-- Add indexes to speed up position queries for users with many positions

-- Index for main query pattern: fetch active positions by user, sorted by opened_at
CREATE INDEX IF NOT EXISTS idx_positions_user_status_opened 
ON positions(user_id, status, opened_at DESC);

-- Index for symbol-specific queries: fetch positions by user, status, and symbol
CREATE INDEX IF NOT EXISTS idx_positions_user_status_symbol 
ON positions(user_id, status, symbol);