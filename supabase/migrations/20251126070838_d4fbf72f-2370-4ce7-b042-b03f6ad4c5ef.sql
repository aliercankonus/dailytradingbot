-- Add composite indexes for faster user-specific queries

-- Optimize positions query: user_id + status (used heavily in PortfolioMetrics and usePositions)
CREATE INDEX IF NOT EXISTS idx_positions_user_status ON positions(user_id, status);

-- Optimize trades query: user_id + status (used heavily in PortfolioMetrics for P&L calculation)
CREATE INDEX IF NOT EXISTS idx_trades_user_status ON trades(user_id, status);

-- Optimize trades ordering by execution date
CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON trades(executed_at DESC);

-- Optimize closed trades filtering with profit_loss
CREATE INDEX IF NOT EXISTS idx_trades_closed_pnl ON trades(status, profit_loss) WHERE status = 'closed';