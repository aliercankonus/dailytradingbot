-- Add strategy_id column to backtesting_results
ALTER TABLE public.backtesting_results 
ADD COLUMN IF NOT EXISTS strategy_id UUID;

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'backtesting_results_strategy_id_fkey'
  ) THEN
    ALTER TABLE public.backtesting_results 
    ADD CONSTRAINT backtesting_results_strategy_id_fkey 
    FOREIGN KEY (strategy_id) REFERENCES public.custom_strategies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_backtesting_results_strategy_id ON public.backtesting_results(strategy_id);