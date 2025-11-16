-- Enable realtime for positions table to track trailing stop updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;