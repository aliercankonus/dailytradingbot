CREATE POLICY "Service role can update rejection logs"
ON public.signal_rejection_log
FOR UPDATE
USING (true)
WITH CHECK (true);