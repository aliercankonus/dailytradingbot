-- Fix: Restrict "Service role" policies from public to service_role

-- ai_signal_analysis
DROP POLICY "Service role can insert AI analysis" ON public.ai_signal_analysis;
CREATE POLICY "Service role can insert AI analysis" ON public.ai_signal_analysis
  FOR INSERT TO service_role WITH CHECK (true);

-- bot_health_state
DROP POLICY "Service role can manage health states" ON public.bot_health_state;
CREATE POLICY "Service role can manage health states" ON public.bot_health_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bot_heartbeat
DROP POLICY "Service role can manage heartbeats" ON public.bot_heartbeat;
CREATE POLICY "Service role can manage heartbeats" ON public.bot_heartbeat
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- entry_quality_log
DROP POLICY "Service role can delete old entry quality logs" ON public.entry_quality_log;
CREATE POLICY "Service role can delete old entry quality logs" ON public.entry_quality_log
  FOR DELETE TO service_role USING (true);

DROP POLICY "Service role can insert entry quality logs" ON public.entry_quality_log;
CREATE POLICY "Service role can insert entry quality logs" ON public.entry_quality_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY "Service role can update entry quality logs" ON public.entry_quality_log;
CREATE POLICY "Service role can update entry quality logs" ON public.entry_quality_log
  FOR UPDATE TO service_role USING (true);

-- market_regime_history
DROP POLICY "Service role can delete old regime history" ON public.market_regime_history;
CREATE POLICY "Service role can delete old regime history" ON public.market_regime_history
  FOR DELETE TO service_role USING (true);

DROP POLICY "Service role can insert regime history" ON public.market_regime_history;
CREATE POLICY "Service role can insert regime history" ON public.market_regime_history
  FOR INSERT TO service_role WITH CHECK (true);

-- momentum_analysis
DROP POLICY "Service role can delete old momentum analysis" ON public.momentum_analysis;
CREATE POLICY "Service role can delete old momentum analysis" ON public.momentum_analysis
  FOR DELETE TO service_role USING (true);

DROP POLICY "Service role can insert momentum analysis" ON public.momentum_analysis;
CREATE POLICY "Service role can insert momentum analysis" ON public.momentum_analysis
  FOR INSERT TO service_role WITH CHECK (true);

-- positions_archive
DROP POLICY "Service role can insert archived positions" ON public.positions_archive;
CREATE POLICY "Service role can insert archived positions" ON public.positions_archive
  FOR INSERT TO service_role WITH CHECK (true);

-- shadow_mode_signals
DROP POLICY "Service role can delete old shadow signals" ON public.shadow_mode_signals;
CREATE POLICY "Service role can delete old shadow signals" ON public.shadow_mode_signals
  FOR DELETE TO service_role USING (true);

DROP POLICY "Service role can update shadow signals" ON public.shadow_mode_signals;
CREATE POLICY "Service role can update shadow signals" ON public.shadow_mode_signals
  FOR UPDATE TO service_role USING (true);

-- signal_rejection_log (INSERT is still public, fix it)
DROP POLICY "Service role can insert rejection logs" ON public.signal_rejection_log;
CREATE POLICY "Service role can insert rejection logs" ON public.signal_rejection_log
  FOR INSERT TO service_role WITH CHECK (true);