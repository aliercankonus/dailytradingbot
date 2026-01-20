-- Add DELETE policy for entry_quality_log (service role)
CREATE POLICY "Service role can delete old entry quality logs"
ON public.entry_quality_log
FOR DELETE
USING (true);

-- Add DELETE policy for shadow_mode_signals (service role)
CREATE POLICY "Service role can delete old shadow signals"
ON public.shadow_mode_signals
FOR DELETE
USING (true);