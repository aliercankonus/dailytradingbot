-- Add phone number to risk_parameters for SMS notifications
ALTER TABLE public.risk_parameters 
ADD COLUMN IF NOT EXISTS notification_phone text,
ADD COLUMN IF NOT EXISTS sms_notifications_enabled boolean DEFAULT true;