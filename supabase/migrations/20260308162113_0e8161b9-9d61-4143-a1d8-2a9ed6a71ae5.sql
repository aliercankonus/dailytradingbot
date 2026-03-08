CREATE OR REPLACE FUNCTION public.jsonb_set_snapshot_field(p_user_id uuid, p_symbol text, p_field text, p_value jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  UPDATE public.trend_snapshots
  SET snapshot_data = jsonb_set(
    COALESCE(snapshot_data, '{}'::jsonb),
    ARRAY[p_field],
    p_value,
    true
  )
  WHERE user_id = p_user_id
    AND symbol = p_symbol;
$$;