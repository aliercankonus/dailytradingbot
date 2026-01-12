-- Create shadow mode signals table for validation tracking
CREATE TABLE public.shadow_mode_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  strategy_name TEXT,
  
  -- Gate attribution
  gate_blocked_by TEXT NOT NULL, -- Which gate would have blocked: 'macd_divergence', 'adx_exhaustion', 'stochrsi_extreme'
  old_gate_result TEXT NOT NULL, -- 'blocked' or 'passed'
  new_gate_result TEXT NOT NULL, -- 'blocked' or 'passed' with relaxed thresholds
  
  -- Gate details
  gate_details JSONB, -- Specific values that triggered the gate
  
  -- Signal context
  confidence_score NUMERIC,
  entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  trend TEXT,
  
  -- Position sizing
  old_position_multiplier NUMERIC DEFAULT 1.0,
  new_position_multiplier NUMERIC DEFAULT 1.0,
  
  -- Indicators at time of signal
  indicators JSONB,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  
  -- Outcome tracking (to be updated later)
  outcome_tracked BOOLEAN DEFAULT false,
  would_have_won BOOLEAN,
  simulated_pnl_percent NUMERIC,
  outcome_notes TEXT
);

-- Enable RLS
ALTER TABLE public.shadow_mode_signals ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own shadow signals" 
ON public.shadow_mode_signals 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert shadow signals" 
ON public.shadow_mode_signals 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update shadow signals" 
ON public.shadow_mode_signals 
FOR UPDATE 
USING (true);

-- Create indexes for efficient querying
CREATE INDEX idx_shadow_signals_user_created ON public.shadow_mode_signals(user_id, created_at DESC);
CREATE INDEX idx_shadow_signals_gate ON public.shadow_mode_signals(gate_blocked_by, created_at DESC);
CREATE INDEX idx_shadow_signals_expires ON public.shadow_mode_signals(expires_at);
CREATE INDEX idx_shadow_signals_symbol ON public.shadow_mode_signals(symbol, created_at DESC);

-- Add shadow mode enabled flag to risk_parameters
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS shadow_mode_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS shadow_mode_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();