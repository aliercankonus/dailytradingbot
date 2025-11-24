
-- Create portfolio performance history table for daily snapshots
CREATE TABLE IF NOT EXISTS public.portfolio_performance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Portfolio values
  portfolio_value NUMERIC NOT NULL,
  initial_portfolio_value NUMERIC NOT NULL,
  
  -- P&L metrics
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  total_return_percent NUMERIC NOT NULL DEFAULT 0,
  
  -- Trade statistics
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  
  -- Position metrics
  open_positions INTEGER NOT NULL DEFAULT 0,
  max_open_positions INTEGER NOT NULL DEFAULT 0,
  
  -- Performance metrics
  avg_win NUMERIC DEFAULT 0,
  avg_loss NUMERIC DEFAULT 0,
  profit_factor NUMERIC DEFAULT 0,
  largest_win NUMERIC DEFAULT 0,
  largest_loss NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  
  -- Risk metrics
  daily_loss NUMERIC DEFAULT 0,
  consecutive_losses INTEGER DEFAULT 0,
  
  -- Trading mode at snapshot time
  paper_trading_mode BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one snapshot per user per day
  UNIQUE(user_id, snapshot_date)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date 
  ON public.portfolio_performance_history(user_id, snapshot_date DESC);

-- Enable Row Level Security
ALTER TABLE public.portfolio_performance_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own performance history
CREATE POLICY "Users can view their own performance history"
  ON public.portfolio_performance_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own performance snapshots
CREATE POLICY "Users can insert their own performance snapshots"
  ON public.portfolio_performance_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Service role can insert for any user (for cron jobs)
CREATE POLICY "Service role can insert performance snapshots"
  ON public.portfolio_performance_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS Policy: Users can update their own performance history
CREATE POLICY "Users can update their own performance history"
  ON public.portfolio_performance_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE public.portfolio_performance_history IS 
  'Stores daily snapshots of portfolio performance metrics for historical tracking and analysis';
