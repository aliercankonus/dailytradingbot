-- Update trading_signals expires_at default to 60 seconds
ALTER TABLE trading_signals 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '60 seconds');