-- Add UPDATE policy for strategy_performance
CREATE POLICY "Allow public update access to strategy performance"
ON public.strategy_performance
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Add INSERT policy for strategy_performance
CREATE POLICY "Allow public insert access to strategy performance"
ON public.strategy_performance
FOR INSERT
TO public
WITH CHECK (true);

-- Add DELETE policy for strategy_performance
CREATE POLICY "Allow public delete access to strategy performance"
ON public.strategy_performance
FOR DELETE
TO public
USING (true);