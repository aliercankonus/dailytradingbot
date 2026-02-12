ALTER TABLE public.market_regime_history DROP CONSTRAINT market_regime_history_regime_check;

ALTER TABLE public.market_regime_history ADD CONSTRAINT market_regime_history_regime_check CHECK (regime = ANY (ARRAY['TRENDING', 'RANGING', 'TRANSITIONING', 'EXHAUSTED', 'TREND_EXPANSION', 'TREND_EXHAUSTION', 'RANGE_COMPRESSION', 'BREAKOUT_SETUP']));