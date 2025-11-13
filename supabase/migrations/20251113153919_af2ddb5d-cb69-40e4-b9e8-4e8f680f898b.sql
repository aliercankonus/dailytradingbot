-- Create trigger to auto-create rotation config for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_rotation_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.strategy_rotation_config (
    user_id,
    enabled,
    rotation_interval_minutes,
    performance_threshold_percent,
    min_trades_required,
    market_condition_weight,
    performance_weight
  )
  VALUES (
    new.id,
    false,
    60,
    5.0,
    10,
    0.5,
    0.5
  );
  RETURN new;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created_rotation_config
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_rotation_config();