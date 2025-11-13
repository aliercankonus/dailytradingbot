-- Fix public table access for notifications and strategy_rotation_history

-- 1. Add user_id to notifications table
ALTER TABLE notifications ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Drop public policy on notifications
DROP POLICY IF EXISTS "Allow public read access to notifications" ON notifications;

-- 3. Create user-scoped policy for notifications
CREATE POLICY "Users can view their own notifications" 
ON notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications" 
ON notifications FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 4. Add user_id to strategy_rotation_history table
ALTER TABLE strategy_rotation_history ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. Drop public policy on strategy_rotation_history
DROP POLICY IF EXISTS "Allow public read access to rotation history" ON strategy_rotation_history;

-- 6. Create user-scoped policy for strategy_rotation_history
CREATE POLICY "Users can view their own rotation history" 
ON strategy_rotation_history FOR SELECT 
USING (auth.uid() = user_id);