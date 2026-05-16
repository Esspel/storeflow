/*
  # Add push_subscriptions table

  ## Summary
  Creates a table to store Web Push API subscriptions for sending push notifications
  to store staff devices (including Zebra TC52 handhelds).

  ## New Tables
  - `push_subscriptions`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to app_users)
    - `endpoint` (text, unique — the push service endpoint URL)
    - `subscription_json` (jsonb — full PushSubscription object including keys)
    - `user_agent` (text — device/browser identifier for debugging)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only manage their own subscriptions
  - Service role (edge functions) can insert/select for sending notifications
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  subscription_json jsonb NOT NULL,
  user_agent text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  TO anon
  USING (user_id = app_current_user_id());

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  TO anon
  WITH CHECK (user_id = app_current_user_id());

-- Users can update their own subscriptions
CREATE POLICY "Users can update own push subscriptions"
  ON push_subscriptions FOR UPDATE
  TO anon
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  TO anon
  USING (user_id = app_current_user_id());

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
