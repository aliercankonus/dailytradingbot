
-- 1. Write policies
DROP POLICY IF EXISTS "Service role can delete old function metrics" ON public.function_metrics;
DROP POLICY IF EXISTS "Service role can insert function metrics" ON public.function_metrics;

CREATE POLICY "Service role can insert function metrics"
  ON public.function_metrics FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update function metrics"
  ON public.function_metrics FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete function metrics"
  ON public.function_metrics FOR DELETE TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can update rejection logs" ON public.signal_rejection_log;
CREATE POLICY "Service role can update rejection logs"
  ON public.signal_rejection_log FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can insert positions"
  ON public.positions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update positions"
  ON public.positions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete positions"
  ON public.positions FOR DELETE TO service_role USING (true);

CREATE POLICY "Service role can insert trading_signals"
  ON public.trading_signals FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update trading_signals"
  ON public.trading_signals FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete trading_signals"
  ON public.trading_signals FOR DELETE TO service_role USING (true);

DROP POLICY IF EXISTS "Delete own trend snapshots" ON public.trend_snapshots;
DROP POLICY IF EXISTS "Insert trend snapshots with valid user" ON public.trend_snapshots;
DROP POLICY IF EXISTS "Update own trend snapshots" ON public.trend_snapshots;

CREATE POLICY "Users insert own trend snapshots"
  ON public.trend_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own trend snapshots"
  ON public.trend_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own trend snapshots"
  ON public.trend_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages trend_snapshots"
  ON public.trend_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Vault function owner checks
CREATE OR REPLACE FUNCTION public.get_user_binance_credentials(p_user_id uuid)
 RETURNS TABLE(api_key text, api_secret text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot access other user credentials';
  END IF;
  RETURN QUERY
  SELECT public.get_encrypted_api_key(p_user_id, 'api_key'),
         public.get_encrypted_api_key(p_user_id, 'api_secret');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_encrypted_api_key(p_user_id uuid, p_key_type text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_name text; v_decrypted_secret text;
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  SELECT decrypted_secret INTO v_decrypted_secret FROM vault.decrypted_secrets WHERE name = v_secret_name;
  RETURN v_decrypted_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_encrypted_api_key(p_user_id uuid, p_key_type text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_name text;
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  DELETE FROM vault.secrets WHERE name = v_secret_name;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_encrypted_api_key(p_user_id uuid, p_key_type text, p_key_value text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_name text; v_secret_id uuid;
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  DELETE FROM vault.secrets WHERE name = v_secret_name;
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (v_secret_name, p_key_value, 'Binance ' || p_key_type || ' for user ' || p_user_id::text)
  RETURNING id INTO v_secret_id;
  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.jsonb_set_snapshot_field(p_user_id uuid, p_symbol text, p_field text, p_value jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.trend_snapshots
  SET snapshot_data = jsonb_set(COALESCE(snapshot_data, '{}'::jsonb), ARRAY[p_field], p_value, true)
  WHERE user_id = p_user_id AND symbol = p_symbol;
END;
$function$;

-- 3. Lock down EXECUTE
REVOKE EXECUTE ON FUNCTION public.get_user_binance_credentials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_encrypted_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_encrypted_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_encrypted_api_key(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jsonb_set_snapshot_field(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_old_positions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ignition_tier_audit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_market_opportunity_density(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_strategy_forensic_report(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_api_keys_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_position_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_api_keys() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_default_symbols() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_max_trades_per_symbol() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_risk_parameters() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_function_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_ai_analysis() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_market_opportunity_density(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_strategy_forensic_report(uuid, integer) TO authenticated;

-- 4. Security invoker view
ALTER VIEW public.portfolio_metrics_view SET (security_invoker = true);

-- 5. Move pg_net (drop-and-recreate in extensions schema)
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 6. Storage policies for daily-trading-bot bucket
DROP POLICY IF EXISTS "Service role manages daily-trading-bot" ON storage.objects;
DROP POLICY IF EXISTS "Users read own daily-trading-bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own daily-trading-bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own daily-trading-bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own daily-trading-bot files" ON storage.objects;

CREATE POLICY "Service role manages daily-trading-bot"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'daily-trading-bot')
  WITH CHECK (bucket_id = 'daily-trading-bot');

CREATE POLICY "Users read own daily-trading-bot files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'daily-trading-bot' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own daily-trading-bot files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'daily-trading-bot' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own daily-trading-bot files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'daily-trading-bot' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'daily-trading-bot' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own daily-trading-bot files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'daily-trading-bot' AND auth.uid()::text = (storage.foldername(name))[1]);
