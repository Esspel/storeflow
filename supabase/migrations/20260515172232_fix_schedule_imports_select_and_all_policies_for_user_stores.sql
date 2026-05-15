/*
  # Fix all schedule_imports policies to check user_stores membership

  The SELECT policy on schedule_imports only checked au.store_id, which means
  the RETURNING clause after INSERT (used by .select().single()) would fail RLS
  even if the INSERT itself passed. This caused the misleading "INSERT RLS violation".

  Also fix the employee_mappings SELECT policy for the same reason.

  All policies now check BOTH au.store_id AND user_stores membership so users
  assigned to a store via user_stores (multi-store setup) can fully access it.
*/

-- ── schedule_imports: fix SELECT policy ────────────────────────────────────────
DROP POLICY IF EXISTS "Valid session can view schedule imports" ON schedule_imports;
CREATE POLICY "Valid session can view schedule imports"
  ON schedule_imports FOR SELECT
  TO anon
  USING (
    app_current_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = app_current_user_id()
          AND au.store_id = schedule_imports.store_id
      )
      OR EXISTS (
        SELECT 1 FROM user_stores us
        WHERE us.user_id = app_current_user_id()
          AND us.store_id = schedule_imports.store_id
      )
    )
  );

-- ── delivery_plans: ensure same pattern ────────────────────────────────────────
DO $$
BEGIN
  -- Check if RLS is enabled on delivery_plans
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'delivery_plans' AND relrowsecurity = true) THEN
    -- Drop and recreate policies that only check store_id column
    DROP POLICY IF EXISTS "Valid session can view delivery plans" ON delivery_plans;
    CREATE POLICY "Valid session can view delivery plans"
      ON delivery_plans FOR SELECT
      TO anon
      USING (
        app_current_user_id() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM app_users au
            WHERE au.id = app_current_user_id()
              AND au.store_id = delivery_plans.store_id
          )
          OR EXISTS (
            SELECT 1 FROM user_stores us
            WHERE us.user_id = app_current_user_id()
              AND us.store_id = delivery_plans.store_id
          )
        )
      );

    DROP POLICY IF EXISTS "Valid session can insert delivery plans" ON delivery_plans;
    CREATE POLICY "Valid session can insert delivery plans"
      ON delivery_plans FOR INSERT
      TO anon
      WITH CHECK (
        app_current_user_id() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM app_users au
            WHERE au.id = app_current_user_id()
              AND au.store_id = delivery_plans.store_id
          )
          OR EXISTS (
            SELECT 1 FROM user_stores us
            WHERE us.user_id = app_current_user_id()
              AND us.store_id = delivery_plans.store_id
          )
        )
      );
  END IF;
END $$;
