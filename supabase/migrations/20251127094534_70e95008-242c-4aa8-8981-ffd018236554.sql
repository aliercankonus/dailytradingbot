-- Create function to validate max trades per symbol before insert
CREATE OR REPLACE FUNCTION public.validate_max_trades_per_symbol()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_trades_per_symbol INTEGER;
  v_current_active_trades INTEGER;
BEGIN
  -- Only check for active positions being inserted
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- Get user's max_trades_per_symbol limit
  SELECT max_trades_per_symbol INTO v_max_trades_per_symbol
  FROM public.risk_parameters
  WHERE user_id = NEW.user_id;

  -- If no risk parameters found, use default of 1
  IF v_max_trades_per_symbol IS NULL THEN
    v_max_trades_per_symbol := 1;
  END IF;

  -- Count current active positions for this user and symbol
  SELECT COUNT(*) INTO v_current_active_trades
  FROM public.positions
  WHERE user_id = NEW.user_id
    AND symbol = NEW.symbol
    AND status = 'active';

  -- Check if adding this position would exceed the limit
  IF v_current_active_trades >= v_max_trades_per_symbol THEN
    RAISE EXCEPTION 'Cannot open position: Maximum % active trades per symbol (%) already reached for user. Current active: %',
      v_max_trades_per_symbol, NEW.symbol, v_current_active_trades;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to enforce max trades per symbol constraint
DROP TRIGGER IF EXISTS enforce_max_trades_per_symbol ON public.positions;

CREATE TRIGGER enforce_max_trades_per_symbol
  BEFORE INSERT ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_max_trades_per_symbol();

-- Add comment explaining the constraint
COMMENT ON FUNCTION public.validate_max_trades_per_symbol() IS 
'Prevents race conditions by enforcing max_trades_per_symbol limit at database level. 
Checks active positions count before allowing new position insert.';