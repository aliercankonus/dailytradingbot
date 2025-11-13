-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id to risk_parameters (make it NOT NULL after backfill)
ALTER TABLE public.risk_parameters ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to custom_strategies
ALTER TABLE public.custom_strategies ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to strategy_performance
ALTER TABLE public.strategy_performance ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to trades
ALTER TABLE public.trades ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to positions
ALTER TABLE public.positions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to trading_signals
ALTER TABLE public.trading_signals ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to backtesting_results
ALTER TABLE public.backtesting_results ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to strategy_rotation_config
ALTER TABLE public.strategy_rotation_config ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for risk_parameters
DROP POLICY IF EXISTS "Allow public read access to risk parameters" ON public.risk_parameters;
DROP POLICY IF EXISTS "Allow public update access to risk parameters" ON public.risk_parameters;

CREATE POLICY "Users can view their own risk parameters"
  ON public.risk_parameters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk parameters"
  ON public.risk_parameters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk parameters"
  ON public.risk_parameters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update RLS policies for custom_strategies
DROP POLICY IF EXISTS "Allow public read access to custom strategies" ON public.custom_strategies;
DROP POLICY IF EXISTS "Allow public insert access to custom strategies" ON public.custom_strategies;
DROP POLICY IF EXISTS "Allow public update access to custom strategies" ON public.custom_strategies;
DROP POLICY IF EXISTS "Allow public delete access to custom strategies" ON public.custom_strategies;

CREATE POLICY "Users can view their own custom strategies"
  ON public.custom_strategies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom strategies"
  ON public.custom_strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom strategies"
  ON public.custom_strategies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom strategies"
  ON public.custom_strategies FOR DELETE
  USING (auth.uid() = user_id);

-- Update RLS policies for trades
DROP POLICY IF EXISTS "Allow public read access to trades" ON public.trades;

CREATE POLICY "Users can view their own trades"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

-- Update RLS policies for positions
DROP POLICY IF EXISTS "Allow public read access to positions" ON public.positions;

CREATE POLICY "Users can view their own positions"
  ON public.positions FOR SELECT
  USING (auth.uid() = user_id);

-- Update RLS policies for trading_signals
DROP POLICY IF EXISTS "Allow public read access to signals" ON public.trading_signals;

CREATE POLICY "Users can view their own signals"
  ON public.trading_signals FOR SELECT
  USING (auth.uid() = user_id);

-- Update RLS policies for strategy_performance
DROP POLICY IF EXISTS "Allow public read access to strategy performance" ON public.strategy_performance;
DROP POLICY IF EXISTS "Allow public insert access to strategy performance" ON public.strategy_performance;
DROP POLICY IF EXISTS "Allow public update access to strategy performance" ON public.strategy_performance;
DROP POLICY IF EXISTS "Allow public delete access to strategy performance" ON public.strategy_performance;

CREATE POLICY "Users can view their own strategy performance"
  ON public.strategy_performance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy performance"
  ON public.strategy_performance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy performance"
  ON public.strategy_performance FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy performance"
  ON public.strategy_performance FOR DELETE
  USING (auth.uid() = user_id);

-- Update RLS policies for backtesting_results
DROP POLICY IF EXISTS "Allow public read access to backtesting results" ON public.backtesting_results;

CREATE POLICY "Users can view their own backtesting results"
  ON public.backtesting_results FOR SELECT
  USING (auth.uid() = user_id);

-- Update RLS policies for strategy_rotation_config
DROP POLICY IF EXISTS "Allow public read access to rotation config" ON public.strategy_rotation_config;
DROP POLICY IF EXISTS "Allow public insert access to rotation config" ON public.strategy_rotation_config;
DROP POLICY IF EXISTS "Allow public update access to rotation config" ON public.strategy_rotation_config;

CREATE POLICY "Users can view their own rotation config"
  ON public.strategy_rotation_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rotation config"
  ON public.strategy_rotation_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rotation config"
  ON public.strategy_rotation_config FOR UPDATE
  USING (auth.uid() = user_id);