
-- Add effective_regime column to track persistence overrides
ALTER TABLE public.market_regime_history 
ADD COLUMN effective_regime text;

-- Backfill: for existing rows, effective = raw (no divergence data available)
UPDATE public.market_regime_history SET effective_regime = regime;
