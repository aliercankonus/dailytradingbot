-- Create bot health state tracking table
CREATE TABLE public.bot_health_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  state_type TEXT NOT NULL,
  state TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  alert_sent_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  details JSONB
);

-- Partial unique index for active states (only one active state per type per user)
CREATE UNIQUE INDEX idx_bot_health_state_unique_active 
ON public.bot_health_state (user_id, state_type, state) 
WHERE resolved_at IS NULL;

-- Create index for active states lookup
CREATE INDEX idx_bot_health_state_active ON public.bot_health_state (user_id, state_type) WHERE resolved_at IS NULL;

-- Create index for cleanup queries
CREATE INDEX idx_bot_health_state_resolved ON public.bot_health_state (resolved_at) WHERE resolved_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.bot_health_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own health states"
ON public.bot_health_state
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage health states"
ON public.bot_health_state
FOR ALL
USING (true)
WITH CHECK (true);

-- Create bot_heartbeat table for tracking heartbeats
CREATE TABLE public.bot_heartbeat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  symbols_scanned INTEGER NOT NULL DEFAULT 0,
  signals_generated INTEGER NOT NULL DEFAULT 0,
  rejections_logged INTEGER NOT NULL DEFAULT 0,
  no_trade_state TEXT,
  no_trade_reason TEXT,
  details JSONB
);

-- Index for recent heartbeats lookup
CREATE INDEX idx_bot_heartbeat_user_recent ON public.bot_heartbeat (user_id, recorded_at DESC);

-- Cleanup old heartbeats (keep last 24 hours)
CREATE INDEX idx_bot_heartbeat_cleanup ON public.bot_heartbeat (recorded_at);

-- Enable RLS
ALTER TABLE public.bot_heartbeat ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own heartbeats"
ON public.bot_heartbeat
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage heartbeats"
ON public.bot_heartbeat
FOR ALL
USING (true)
WITH CHECK (true);

-- Comment on tables
COMMENT ON TABLE public.bot_health_state IS 'Tracks prolonged no-trade states and operational concerns for alerting';
COMMENT ON TABLE public.bot_heartbeat IS 'Records bot activity heartbeats for health monitoring';