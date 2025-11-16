-- Create table for tracking setup performance
CREATE TABLE IF NOT EXISTS public.setup_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  setup_pattern TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  avg_profit NUMERIC DEFAULT 0,
  avg_loss NUMERIC DEFAULT 0,
  profit_factor NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, setup_pattern, symbol, strategy_name)
);

-- Enable RLS
ALTER TABLE public.setup_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own setup performance"
  ON public.setup_performance
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own setup performance"
  ON public.setup_performance
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own setup performance"
  ON public.setup_performance
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_setup_performance_user_pattern 
  ON public.setup_performance(user_id, setup_pattern, symbol, strategy_name);

-- Create function to update setup performance
CREATE OR REPLACE FUNCTION public.update_setup_performance_from_trade()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process closed trades
  IF NEW.status = 'closed' AND OLD.status = 'open' THEN
    -- Update or insert setup performance
    INSERT INTO public.setup_performance (
      user_id,
      setup_pattern,
      symbol,
      strategy_name,
      total_trades,
      winning_trades,
      losing_trades,
      win_rate,
      avg_profit,
      avg_loss
    )
    SELECT
      NEW.user_id,
      COALESCE(NEW.strategy_name || '_' || 
        CASE 
          WHEN NEW.side = 'buy' THEN 'LONG'
          ELSE 'SHORT'
        END, 'UNKNOWN'),
      NEW.symbol,
      COALESCE(NEW.strategy_name, 'UNKNOWN'),
      1,
      CASE WHEN NEW.profit_loss > 0 THEN 1 ELSE 0 END,
      CASE WHEN NEW.profit_loss <= 0 THEN 1 ELSE 0 END,
      CASE WHEN NEW.profit_loss > 0 THEN 100.0 ELSE 0.0 END,
      CASE WHEN NEW.profit_loss > 0 THEN NEW.profit_loss ELSE 0 END,
      CASE WHEN NEW.profit_loss <= 0 THEN ABS(NEW.profit_loss) ELSE 0 END
    ON CONFLICT (user_id, setup_pattern, symbol, strategy_name)
    DO UPDATE SET
      total_trades = setup_performance.total_trades + 1,
      winning_trades = setup_performance.winning_trades + CASE WHEN NEW.profit_loss > 0 THEN 1 ELSE 0 END,
      losing_trades = setup_performance.losing_trades + CASE WHEN NEW.profit_loss <= 0 THEN 1 ELSE 0 END,
      win_rate = ((setup_performance.winning_trades + CASE WHEN NEW.profit_loss > 0 THEN 1 ELSE 0 END)::NUMERIC / 
                  (setup_performance.total_trades + 1)::NUMERIC) * 100,
      avg_profit = CASE 
        WHEN NEW.profit_loss > 0 THEN
          ((setup_performance.avg_profit * setup_performance.winning_trades) + NEW.profit_loss) / 
          (setup_performance.winning_trades + 1)
        ELSE setup_performance.avg_profit
      END,
      avg_loss = CASE 
        WHEN NEW.profit_loss <= 0 THEN
          ((setup_performance.avg_loss * setup_performance.losing_trades) + ABS(NEW.profit_loss)) / 
          (setup_performance.losing_trades + 1)
        ELSE setup_performance.avg_loss
      END,
      profit_factor = CASE
        WHEN ((setup_performance.avg_loss * setup_performance.losing_trades) + 
              CASE WHEN NEW.profit_loss <= 0 THEN ABS(NEW.profit_loss) ELSE 0 END) > 0 THEN
          ((setup_performance.avg_profit * setup_performance.winning_trades) + 
           CASE WHEN NEW.profit_loss > 0 THEN NEW.profit_loss ELSE 0 END) /
          ((setup_performance.avg_loss * setup_performance.losing_trades) + 
           CASE WHEN NEW.profit_loss <= 0 THEN ABS(NEW.profit_loss) ELSE 0 END)
        ELSE 0
      END,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-update setup performance
DROP TRIGGER IF EXISTS update_setup_performance_trigger ON public.trades;
CREATE TRIGGER update_setup_performance_trigger
  AFTER UPDATE ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_setup_performance_from_trade();