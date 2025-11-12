-- Add UPDATE policy for risk_parameters table
CREATE POLICY "Allow public update access to risk parameters"
ON public.risk_parameters
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);