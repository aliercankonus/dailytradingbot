-- Fix overly permissive INSERT policy for shadow_mode_signals
-- Only service role (edge functions) should be able to insert

DROP POLICY IF EXISTS "Service role can insert shadow signals" ON public.shadow_mode_signals;

-- Create proper service role only policy using auth.role() check
CREATE POLICY "Service role can insert shadow signals" 
ON public.shadow_mode_signals 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');