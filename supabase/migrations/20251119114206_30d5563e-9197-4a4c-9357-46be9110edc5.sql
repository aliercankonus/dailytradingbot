-- Add DELETE policy for service role to clean up old rejection logs
CREATE POLICY "Service role can delete old rejection logs"
ON signal_rejection_log
FOR DELETE
TO service_role
USING (true);