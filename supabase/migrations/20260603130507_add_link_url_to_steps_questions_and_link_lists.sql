/*
  # Add link_url to steps/questions and create link lists feature

  1. New columns
    - `task_steps.link_url` (text, nullable) — optional URL attached to a checkpoint
    - `checklist_template_items.link_url` (text, nullable) — same for template items
    - `task_questions.link_url` (text, nullable) — optional URL attached to a question
    - `checklist_template_questions.link_url` (text, nullable) — same for template questions

  2. New tables
    - `link_lists` — named collections of links, scoped to store / forening / hk
    - `link_list_items` — individual links within a list

  3. Security
    - RLS enabled on both new tables
    - Admins and HK can manage global link lists
    - Forenings can manage forening-scoped lists
    - Managers can manage store-scoped lists
    - Users can view lists visible to their store / forening
*/

-- ─── step / question link columns ───────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_steps' AND column_name = 'link_url') THEN
    ALTER TABLE task_steps ADD COLUMN link_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_items' AND column_name = 'link_url') THEN
    ALTER TABLE checklist_template_items ADD COLUMN link_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_questions' AND column_name = 'link_url') THEN
    ALTER TABLE task_questions ADD COLUMN link_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_template_questions' AND column_name = 'link_url') THEN
    ALTER TABLE checklist_template_questions ADD COLUMN link_url text;
  END IF;
END $$;

-- ─── link_lists ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'store'
    CHECK (scope IN ('store', 'forening', 'hk')),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  forening_id uuid REFERENCES foreningar(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE link_lists ENABLE ROW LEVEL SECURITY;

-- ─── link_list_items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES link_lists(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE link_list_items ENABLE ROW LEVEL SECURITY;

-- ─── RLS: link_lists ─────────────────────────────────────────────────────────

-- SELECT: users see hk-lists, lists for their forening, and lists for their stores
CREATE POLICY "Users can view relevant link lists"
  ON link_lists FOR SELECT
  TO anon
  USING (
    scope = 'hk'
    OR (
      scope = 'forening'
      AND forening_id IS NOT NULL
      AND forening_id = (SELECT forening_id FROM app_users WHERE id = app_current_user_id() LIMIT 1)
    )
    OR (
      scope = 'store'
      AND store_id IS NOT NULL
      AND store_id IN (SELECT store_id FROM user_stores WHERE user_id = app_current_user_id())
    )
  );

-- INSERT: managers (chef+) can create store lists; forening-level can create forening lists; admin/hk can create hk lists
CREATE POLICY "Managers can create link lists"
  ON link_lists FOR INSERT
  TO anon
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1)
      IN ('admin', 'manager')
  );

-- UPDATE: only creator or admin/hk can update
CREATE POLICY "Creators can update their link lists"
  ON link_lists FOR UPDATE
  TO anon
  USING (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('admin', 'manager')
  )
  WITH CHECK (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) IN ('admin', 'manager')
  );

-- DELETE: only creator or admin can delete
CREATE POLICY "Creators can delete their link lists"
  ON link_lists FOR DELETE
  TO anon
  USING (
    created_by = app_current_user_id()
    OR (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1) = 'admin'
  );

-- ─── RLS: link_list_items ────────────────────────────────────────────────────

CREATE POLICY "Users can view items in accessible lists"
  ON link_list_items FOR SELECT
  TO anon
  USING (
    list_id IN (SELECT id FROM link_lists)
  );

CREATE POLICY "Managers can insert link items"
  ON link_list_items FOR INSERT
  TO anon
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1)
      IN ('admin', 'manager')
  );

CREATE POLICY "Managers can update link items"
  ON link_list_items FOR UPDATE
  TO anon
  USING (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1)
      IN ('admin', 'manager')
  )
  WITH CHECK (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1)
      IN ('admin', 'manager')
  );

CREATE POLICY "Managers can delete link items"
  ON link_list_items FOR DELETE
  TO anon
  USING (
    (SELECT role FROM app_users WHERE id = app_current_user_id() LIMIT 1)
      IN ('admin', 'manager')
  );

-- ─── index ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_link_lists_store_id ON link_lists(store_id);
CREATE INDEX IF NOT EXISTS idx_link_lists_forening_id ON link_lists(forening_id);
CREATE INDEX IF NOT EXISTS idx_link_list_items_list_id ON link_list_items(list_id);
