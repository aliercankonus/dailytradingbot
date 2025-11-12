-- Create strategy rotation configuration table
CREATE TABLE IF NOT EXISTS public.strategy_rotation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean DEFAULT false,
  rotation_interval_minutes integer DEFAULT 60,
  performance_threshold_percent numeric DEFAULT 5.0,
  min_trades_required integer DEFAULT 10,
  market_condition_weight numeric DEFAULT 0.5,
  performance_weight numeric DEFAULT 0.5,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create strategy rotation history table
CREATE TABLE IF NOT EXISTS public.strategy_rotation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_strategy_id uuid,
  to_strategy_id uuid,
  from_strategy_name text NOT NULL,
  to_strategy_name text NOT NULL,
  reason text NOT NULL,
  market_condition jsonb,
  performance_metrics jsonb,
  rotated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.strategy_rotation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_rotation_history ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read access to rotation config"
  ON public.strategy_rotation_config FOR SELECT
  USING (true);

CREATE POLICY "Allow public update access to rotation config"
  ON public.strategy_rotation_config FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert access to rotation config"
  ON public.strategy_rotation_config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public read access to rotation history"
  ON public.strategy_rotation_history FOR SELECT
  USING (true);

-- Insert default configuration
INSERT INTO public.strategy_rotation_config (enabled, rotation_interval_minutes)
VALUES (false, 60)
ON CONFLICT DO NOTHING;