-- Add auto_execute_signals field to risk_parameters table
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS auto_execute_signals boolean DEFAULT true;

COMMENT ON COLUMN public.risk_parameters.auto_execute_signals IS 'Controls whether signals are automatically executed. When false, signals are still generated but require manual execution.';