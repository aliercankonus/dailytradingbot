-- Enable the vault extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- Create a function to encrypt and store API keys in vault
CREATE OR REPLACE FUNCTION public.store_encrypted_api_key(
  p_user_id uuid,
  p_key_type text,
  p_key_value text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_name text;
  v_secret_id uuid;
BEGIN
  -- Generate unique secret name
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  
  -- Delete existing secret if any
  DELETE FROM vault.secrets WHERE name = v_secret_name;
  
  -- Create new encrypted secret in vault
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (v_secret_name, p_key_value, 'Binance ' || p_key_type || ' for user ' || p_user_id::text)
  RETURNING id INTO v_secret_id;
  
  RETURN v_secret_id;
END;
$$;

-- Create a function to retrieve decrypted API keys from vault
CREATE OR REPLACE FUNCTION public.get_encrypted_api_key(
  p_user_id uuid,
  p_key_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_name text;
  v_decrypted_secret text;
BEGIN
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  
  SELECT decrypted_secret INTO v_decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = v_secret_name;
  
  RETURN v_decrypted_secret;
END;
$$;

-- Create a function to delete API keys from vault
CREATE OR REPLACE FUNCTION public.delete_encrypted_api_key(
  p_user_id uuid,
  p_key_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_name text;
BEGIN
  v_secret_name := 'binance_' || p_key_type || '_' || p_user_id::text;
  
  DELETE FROM vault.secrets WHERE name = v_secret_name;
  
  RETURN FOUND;
END;
$$;

-- Add columns to track vault secret IDs (for reference, actual secrets are in vault)
ALTER TABLE public.user_api_keys 
  ADD COLUMN IF NOT EXISTS binance_api_key_vault_id uuid,
  ADD COLUMN IF NOT EXISTS binance_api_secret_vault_id uuid,
  ADD COLUMN IF NOT EXISTS keys_encrypted boolean DEFAULT false;

-- Create a trigger function to encrypt API keys on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_api_keys_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_vault_id uuid;
  v_secret_vault_id uuid;
BEGIN
  -- Only process if we have new API key values
  IF NEW.binance_api_key IS NOT NULL AND NEW.binance_api_key != '' AND 
     (TG_OP = 'INSERT' OR NEW.binance_api_key != OLD.binance_api_key) THEN
    -- Store encrypted key in vault
    v_key_vault_id := public.store_encrypted_api_key(NEW.user_id, 'api_key', NEW.binance_api_key);
    NEW.binance_api_key_vault_id := v_key_vault_id;
    -- Clear plaintext (store masked version for display)
    NEW.binance_api_key := '********' || RIGHT(NEW.binance_api_key, 4);
  END IF;
  
  IF NEW.binance_api_secret IS NOT NULL AND NEW.binance_api_secret != '' AND
     (TG_OP = 'INSERT' OR NEW.binance_api_secret != OLD.binance_api_secret) THEN
    -- Store encrypted secret in vault
    v_secret_vault_id := public.store_encrypted_api_key(NEW.user_id, 'api_secret', NEW.binance_api_secret);
    NEW.binance_api_secret_vault_id := v_secret_vault_id;
    -- Clear plaintext (store masked version for display)
    NEW.binance_api_secret := '********' || RIGHT(NEW.binance_api_secret, 4);
  END IF;
  
  NEW.keys_encrypted := true;
  
  RETURN NEW;
END;
$$;

-- Create trigger for encrypting API keys
DROP TRIGGER IF EXISTS encrypt_api_keys ON public.user_api_keys;
CREATE TRIGGER encrypt_api_keys
  BEFORE INSERT OR UPDATE ON public.user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_api_keys_trigger();

-- Create a helper function for edge functions to get user's decrypted API keys
CREATE OR REPLACE FUNCTION public.get_user_binance_credentials(p_user_id uuid)
RETURNS TABLE(api_key text, api_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    public.get_encrypted_api_key(p_user_id, 'api_key') as api_key,
    public.get_encrypted_api_key(p_user_id, 'api_secret') as api_secret;
END;
$$;