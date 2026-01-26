-- Add entry_snapshot column to positions table for full entry context preservation
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS entry_snapshot JSONB;

-- Add entry_snapshot column to positions_archive table as well
ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS entry_snapshot JSONB;

-- Add status, executed_at, and position_id columns to trading_signals for traceability
ALTER TABLE public.trading_signals 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);

-- Create index for efficient querying of executed signals
CREATE INDEX IF NOT EXISTS idx_trading_signals_status ON public.trading_signals(status);
CREATE INDEX IF NOT EXISTS idx_trading_signals_position_id ON public.trading_signals(position_id);

-- Add comment for documentation
COMMENT ON COLUMN public.positions.entry_snapshot IS 'JSON snapshot of all entry conditions at the time of execution including signal data, indicators, gates passed, and market context';
COMMENT ON COLUMN public.trading_signals.status IS 'Signal lifecycle status: active, executed, expired';
COMMENT ON COLUMN public.trading_signals.executed_at IS 'Timestamp when signal was executed into a position';
COMMENT ON COLUMN public.trading_signals.position_id IS 'Reference to the position created from this signal';