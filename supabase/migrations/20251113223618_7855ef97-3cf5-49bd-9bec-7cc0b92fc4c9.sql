-- Delete orphaned rows with NULL user_id
DELETE FROM public.strategy_rotation_config WHERE user_id IS NULL;

-- Make user_id NOT NULL and add unique constraint to user_api_keys
-- Each user should have only one set of API keys
ALTER TABLE public.user_api_keys 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.user_api_keys 
ADD CONSTRAINT user_api_keys_user_id_unique UNIQUE (user_id);

-- Make user_id NOT NULL and add unique constraint to strategy_rotation_config
-- Each user should have only one rotation config
ALTER TABLE public.strategy_rotation_config 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.strategy_rotation_config 
ADD CONSTRAINT strategy_rotation_config_user_id_unique UNIQUE (user_id);