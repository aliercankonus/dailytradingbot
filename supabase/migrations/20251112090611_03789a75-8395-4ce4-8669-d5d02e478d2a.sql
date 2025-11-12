-- Fix the existing function to have immutable search_path
CREATE OR REPLACE FUNCTION public.update_position_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;