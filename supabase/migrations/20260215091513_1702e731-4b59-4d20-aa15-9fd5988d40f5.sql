
-- Fix: Replace overly permissive policy with service-role-only insert/update/delete
DROP POLICY "Service role can manage trend snapshots" ON public.trend_snapshots;

-- Only allow inserts/updates with valid user_id (edge functions use service role)
CREATE POLICY "Insert trend snapshots with valid user"
ON public.trend_snapshots FOR INSERT
WITH CHECK (user_id IS NOT NULL);

CREATE POLICY "Update own trend snapshots"
ON public.trend_snapshots FOR UPDATE
USING (user_id IS NOT NULL);

CREATE POLICY "Delete own trend snapshots"
ON public.trend_snapshots FOR DELETE
USING (user_id IS NOT NULL);
