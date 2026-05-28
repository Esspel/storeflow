/*
  # Fix broken RLS policies on qr_tokens and pulstavla_pins

  ## Problem
  The INSERT policies on both tables were using self-referential comparisons like
  `app_users.active_store_id = app_users.store_id` instead of comparing against
  the row being inserted. This meant the policies never actually validated that
  the user had access to the store they were inserting for.

  ## Changes
  1. qr_tokens
     - DROP and recreate INSERT policy to properly check user has access to store_id
     - Allow any authenticated user (not just managers) to create QR tokens for their store
  2. pulstavla_pins
     - DROP and recreate INSERT/UPDATE policies to check store membership correctly
*/

-- ── qr_tokens ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can create QR tokens for their store" ON qr_tokens;

CREATE POLICY "Authenticated users can create QR tokens for their store"
  ON qr_tokens FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    app_current_user_id() IS NOT NULL
    AND (
      -- user belongs to the store
      EXISTS (
        SELECT 1 FROM user_stores
        WHERE user_stores.store_id = qr_tokens.store_id
          AND user_stores.user_id = app_current_user_id()
      )
      OR
      -- or user is admin
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  );

-- ── pulstavla_pins ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Managers can upsert their store PIN" ON pulstavla_pins;
DROP POLICY IF EXISTS "Managers can update their store PIN" ON pulstavla_pins;

CREATE POLICY "Managers can insert their store PIN"
  ON pulstavla_pins FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND app_users.role IN ('admin', 'manager')
        AND app_users.is_active = true
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_stores
        WHERE user_stores.store_id = pulstavla_pins.store_id
          AND user_stores.user_id = app_current_user_id()
      )
      OR
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  );

CREATE POLICY "Managers can update their store PIN"
  ON pulstavla_pins FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND app_users.role IN ('admin', 'manager')
        AND app_users.is_active = true
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_stores
        WHERE user_stores.store_id = pulstavla_pins.store_id
          AND user_stores.user_id = app_current_user_id()
      )
      OR
      EXISTS (
        SELECT 1 FROM app_users
        WHERE app_users.id = app_current_user_id()
          AND app_users.role = 'admin'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = app_current_user_id()
        AND app_users.role IN ('admin', 'manager')
        AND app_users.is_active = true
    )
  );
