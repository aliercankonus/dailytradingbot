-- Create enum for market trends
CREATE TYPE market_trend AS ENUM ('bullish', 'bearish', 'ranging');

-- Create enum for signal types
CREATE TYPE signal_type AS ENUM ('long', 'short', 'hold', 'exit');

-- Create trading signals table
CREATE TABLE public.trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  signal_type signal_type NOT NULL,
  trend market_trend NOT NULL,
  entry_price DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  risk_reward_ratio DECIMAL(5, 2),
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  indicators JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes'
);

-- Create strategy performance table
CREATE TABLE public.strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_profit DECIMAL(20, 8) DEFAULT 0,
  max_drawdown DECIMAL(10, 2) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial strategies
INSERT INTO public.strategy_performance (strategy_name, status, total_trades, winning_trades, total_profit) VALUES
  ('Mean Reversion', 'active', 24, 18, 124.50),
  ('Momentum Trading', 'active', 18, 14, 87.20),
  ('Grid Trading', 'standby', 12, 9, 52.10);

-- Create index for faster queries
CREATE INDEX idx_signals_symbol_created ON public.trading_signals(symbol, created_at DESC);
CREATE INDEX idx_signals_expires ON public.trading_signals(expires_at);

-- Enable RLS
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_performance ENABLE ROW LEVEL SECURITY;

-- Public read access (for now, since no auth yet)
CREATE POLICY "Allow public read access to signals"
  ON public.trading_signals FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to strategy performance"
  ON public.strategy_performance FOR SELECT
  USING (true);