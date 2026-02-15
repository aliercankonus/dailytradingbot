-- Drop the trigger on positions table for setup_performance
DROP TRIGGER IF EXISTS update_setup_performance_trigger ON public.positions;

-- Drop orphaned functions with CASCADE to remove dependent triggers
DROP FUNCTION IF EXISTS public.update_setup_performance_from_position() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_rotation_config() CASCADE;