
-- Index for time-based filtering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_signal_rejection_checked_at
ON signal_rejection_log (checked_at DESC);

-- Composite index for symbol + time filtering
CREATE INDEX IF NOT EXISTS idx_signal_rejection_symbol_checked_at
ON signal_rejection_log (symbol, checked_at DESC);

-- Index for user_id + checked_at (used by useBlockedSignals with user_id filter)
CREATE INDEX IF NOT EXISTS idx_signal_rejection_user_checked_at
ON signal_rejection_log (user_id, checked_at DESC);
