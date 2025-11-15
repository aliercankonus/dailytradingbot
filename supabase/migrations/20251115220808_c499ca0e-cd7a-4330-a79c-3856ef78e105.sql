-- Create table for trading symbol configuration
CREATE TABLE IF NOT EXISTS public.trading_symbols_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, user_id)
);

-- Enable RLS
ALTER TABLE public.trading_symbols_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own symbols"
  ON public.trading_symbols_config
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own symbols"
  ON public.trading_symbols_config
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own symbols"
  ON public.trading_symbols_config
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own symbols"
  ON public.trading_symbols_config
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to initialize default symbols for new users
CREATE OR REPLACE FUNCTION public.initialize_default_symbols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trading_symbols_config (user_id, symbol, display_name, is_active)
  VALUES
    (NEW.id, 'BTCUSDT', 'Bitcoin (BTC/USDT)', true),
    (NEW.id, 'ETHUSDT', 'Ethereum (ETH/USDT)', true),
    (NEW.id, 'BNBUSDT', 'Binance Coin (BNB/USDT)', false),
    (NEW.id, 'SOLUSDT', 'Solana (SOL/USDT)', false),
    (NEW.id, 'ADAUSDT', 'Cardano (ADA/USDT)', false),
    (NEW.id, 'XRPUSDT', 'Ripple (XRP/USDT)', false),
    (NEW.id, 'DOGEUSDT', 'Dogecoin (DOGE/USDT)', false),
    (NEW.id, 'DOTUSDT', 'Polkadot (DOT/USDT)', false),
    (NEW.id, 'MATICUSDT', 'Polygon (MATIC/USDT)', false),
    (NEW.id, 'AVAXUSDT', 'Avalanche (AVAX/USDT)', false);
  RETURN NEW;
END;
$$;

-- Create trigger to initialize symbols for new users
DROP TRIGGER IF EXISTS on_auth_user_created_init_symbols ON auth.users;
CREATE TRIGGER on_auth_user_created_init_symbols
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_default_symbols();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_trading_symbols_user_active 
  ON public.trading_symbols_config(user_id, is_active);