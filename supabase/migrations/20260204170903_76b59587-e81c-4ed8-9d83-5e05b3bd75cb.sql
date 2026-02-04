-- Add trading fee columns to positions table
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS trading_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS trading_fee_percent numeric DEFAULT 0.1;

-- Add trading fee columns to positions_archive table
ALTER TABLE public.positions_archive 
ADD COLUMN IF NOT EXISTS trading_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS trading_fee_percent numeric DEFAULT 0.1;

-- Add fee rate setting to risk_parameters
ALTER TABLE public.risk_parameters
ADD COLUMN IF NOT EXISTS trading_fee_rate_percent numeric DEFAULT 0.1;

-- Add comment explaining the fee columns
COMMENT ON COLUMN public.positions.trading_fee_amount IS 'Total round-trip trading fees in USD (entry + exit)';
COMMENT ON COLUMN public.positions.trading_fee_percent IS 'Fee rate used for this trade (e.g., 0.1 for taker)';
COMMENT ON COLUMN public.risk_parameters.trading_fee_rate_percent IS 'Exchange trading fee rate per side (default 0.1% for Binance taker)';