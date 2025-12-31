-- Phase 6: Database Schema Updates for Smart Trading System

-- Track market regime history for each symbol
CREATE TABLE public.market_regime_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('TRENDING', 'RANGING', 'TRANSITIONING', 'EXHAUSTED')),
  trend_direction TEXT CHECK (trend_direction IN ('bullish', 'bearish', 'neutral')),
  adx DECIMAL,
  adx_slope DECIMAL,
  trend_strength DECIMAL,
  bb_squeeze BOOLEAN DEFAULT false,
  bb_width DECIMAL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track momentum state for smarter entries
CREATE TABLE public.momentum_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  momentum_score DECIMAL NOT NULL,
  trend_direction TEXT NOT NULL,
  ema_spread_roc DECIMAL,
  rsi_momentum DECIMAL,
  macd_slope DECIMAL,
  is_accelerating BOOLEAN DEFAULT false,
  is_exhausted BOOLEAN DEFAULT false,
  overextension_atr DECIMAL,
  pullback_depth DECIMAL,
  timeframe_alignment JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track entry quality for learning
CREATE TABLE public.entry_quality_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  position_id UUID REFERENCES public.positions(id),
  symbol TEXT NOT NULL,
  entry_score INTEGER NOT NULL,
  momentum_score DECIMAL,
  pullback_depth DECIMAL,
  volume_confirmation BOOLEAN,
  regime TEXT,
  timeframe_alignment_score INTEGER,
  stochrsi_position TEXT,
  macd_expanding BOOLEAN,
  entry_factors JSONB,
  outcome TEXT,
  pnl_percent DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns to risk_parameters for regime-aware trading
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS regime_aware_trading BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS min_momentum_score DECIMAL DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_overextension_atr DECIMAL DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS min_pullback_depth DECIMAL DEFAULT 0.382,
ADD COLUMN IF NOT EXISTS require_volume_confirmation BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS exhaustion_block_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS min_entry_quality_score INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS trending_regime_min_adx DECIMAL DEFAULT 25,
ADD COLUMN IF NOT EXISTS ranging_regime_max_adx DECIMAL DEFAULT 20;

-- Enable RLS on new tables
ALTER TABLE public.market_regime_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.momentum_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_quality_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for market_regime_history
CREATE POLICY "Users can view their own regime history" ON public.market_regime_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert regime history" ON public.market_regime_history
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can delete old regime history" ON public.market_regime_history
  FOR DELETE USING (true);

-- RLS policies for momentum_analysis
CREATE POLICY "Users can view their own momentum analysis" ON public.momentum_analysis
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert momentum analysis" ON public.momentum_analysis
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can delete old momentum analysis" ON public.momentum_analysis
  FOR DELETE USING (true);

-- RLS policies for entry_quality_log
CREATE POLICY "Users can view their own entry quality logs" ON public.entry_quality_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert entry quality logs" ON public.entry_quality_log
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update entry quality logs" ON public.entry_quality_log
  FOR UPDATE USING (true);

-- Create index for faster queries
CREATE INDEX idx_market_regime_symbol_time ON public.market_regime_history(symbol, recorded_at DESC);
CREATE INDEX idx_momentum_analysis_symbol_time ON public.momentum_analysis(symbol, recorded_at DESC);
CREATE INDEX idx_entry_quality_position ON public.entry_quality_log(position_id);