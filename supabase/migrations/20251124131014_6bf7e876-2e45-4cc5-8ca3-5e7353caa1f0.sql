-- Drop the existing foreign key constraint on trades.signal_id
ALTER TABLE trades 
DROP CONSTRAINT IF EXISTS trades_signal_id_fkey;

-- Add it back with ON DELETE SET NULL so old signals can be deleted
ALTER TABLE trades
ADD CONSTRAINT trades_signal_id_fkey 
FOREIGN KEY (signal_id) 
REFERENCES trading_signals(id) 
ON DELETE SET NULL;