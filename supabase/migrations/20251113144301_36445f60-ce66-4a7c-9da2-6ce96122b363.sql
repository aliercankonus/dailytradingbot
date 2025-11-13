-- Create user_api_keys table to store Binance API credentials per user
CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  binance_api_key TEXT,
  binance_api_secret TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_api_keys
CREATE POLICY "Users can view their own API keys"
  ON public.user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys"
  ON public.user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON public.user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON public.user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Function to create empty API keys for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_api_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_api_keys (user_id, binance_api_key, binance_api_secret)
  VALUES (new.id, '', '');
  RETURN new;
END;
$$;

-- Trigger to create API keys on user signup
CREATE TRIGGER on_auth_user_created_api_keys
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_api_keys();