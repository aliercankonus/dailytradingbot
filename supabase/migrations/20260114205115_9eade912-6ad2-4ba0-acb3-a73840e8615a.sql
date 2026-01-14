-- Phase 1: Remove custom strategies infrastructure
-- Step 1: Remove foreign key constraints
ALTER TABLE trading_signals DROP CONSTRAINT IF EXISTS trading_signals_strategy_id_fkey;
ALTER TABLE backtesting_results DROP CONSTRAINT IF EXISTS backtesting_results_strategy_id_fkey;

-- Step 2: Drop strategy_id columns from related tables
ALTER TABLE trading_signals DROP COLUMN IF EXISTS strategy_id;
ALTER TABLE backtesting_results DROP COLUMN IF EXISTS strategy_id;

-- Step 3: Drop the custom_strategies table
DROP TABLE IF EXISTS custom_strategies CASCADE;