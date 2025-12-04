-- Add signal_direction column to custom_strategies
-- Values: 'long' (only BUY), 'short' (only SELL), 'trend' (follow trend - default)
ALTER TABLE public.custom_strategies 
ADD COLUMN IF NOT EXISTS signal_direction TEXT DEFAULT 'trend';

-- Update existing broken strategies:
-- EMA Death Cross = bearish signal = should be SHORT
UPDATE public.custom_strategies 
SET signal_direction = 'short' 
WHERE name = 'EMA Death Cross';

-- EMA Golden Cross = bullish signal = should be LONG
UPDATE public.custom_strategies 
SET signal_direction = 'long' 
WHERE name = 'EMA Golden Cross';

-- RSI Oversold (< 30) = mean reversion, only valid as LONG in bullish trend
UPDATE public.custom_strategies 
SET signal_direction = 'long' 
WHERE name = 'RSI Oversold/Overbought';

-- MACD bullish crossover strategies = LONG signals
UPDATE public.custom_strategies 
SET signal_direction = 'long' 
WHERE name IN ('MACD Signal Cross', 'MACD Crossover');

-- Volume-based momentum strategies = follow trend
UPDATE public.custom_strategies 
SET signal_direction = 'trend' 
WHERE name IN ('Volume Breakout', 'Volume Surge Momentum');

-- Strong Trend Following = follow trend
UPDATE public.custom_strategies 
SET signal_direction = 'trend' 
WHERE name = 'Strong Trend Following';