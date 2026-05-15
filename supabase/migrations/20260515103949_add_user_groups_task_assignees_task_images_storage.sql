/*
  # Add user groups, task assignees, task images, and storage bucket

  1. New Tables
    - `user_groups` - Named groups of users per store
      - `id` (uuid, primary key)
      - `name` (text)
      - `store_id` (uuid, FK to stores)
      - `created_at` (timestamptz)
    - `user_group_members` - Members of groups
      - `id` (uuid, primary key)
      - `group_id` (uuid, FK to user_groups)
      - `user_id` (uuid, FK to app_users)
      - `created_at` (timestamptz)
    - `task_assignees` - Multiple assignees per task (users or groups)
      - `id` (uuid, primary key)
      - `task_id` (uuid, FK to tasks)
      - `user_id` (uuid, nullable, FK to app_users)
      - `group_id` (uuid, nullable, FK to user_groups)
      - `created_at` (timestamptz)
    - `task_images` - Images attached to tasks
      - `id` (uuid, primary key)
      - `task_id` (uuid, FK to tasks)
      - `storage_path` (text)
      - `uploaded_by` (uuid, FK to app_users)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `incidents` - Add `responsible_user_id` column

  3. Storage
    - Create `attachments` bucket (public)

  4. Security
    - Enable RLS on all new tables
    - Add policies for session-based access
*/

-- User groups
CREATE TABLE IF NOT EXISTS user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid REFERENCES stores(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view user_groups"
  ON user_groups FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert user_groups"
  ON user_groups FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can update user_groups"
  ON user_groups FOR UPDATE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete user_groups"
  ON user_groups FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- User group members
CREATE TABLE IF NOT EXISTS user_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view user_group_members"
  ON user_group_members FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert user_group_members"
  ON user_group_members FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete user_group_members"
  ON user_group_members FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Task assignees (multi-assign: user or group)
CREATE TABLE IF NOT EXISTS task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view task_assignees"
  ON task_assignees FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert task_assignees"
  ON task_assignees FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete task_assignees"
  ON task_assignees FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Task images
CREATE TABLE IF NOT EXISTS task_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session users can view task_images"
  ON task_images FOR SELECT TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can insert task_images"
  ON task_images FOR INSERT TO anon, authenticated
  WITH CHECK (app_current_user_id() IS NOT NULL);

CREATE POLICY "Session users can delete task_images"
  ON task_images FOR DELETE TO anon, authenticated
  USING (app_current_user_id() IS NOT NULL);

-- Add responsible_user_id to incidents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'responsible_user_id'
  ) THEN
    ALTER TABLE incidents ADD COLUMN responsible_user_id uuid REFERENCES app_users(id);
  END IF;
END $$;

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the attachments bucket
CREATE POLICY "Anyone can read attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments');

CREATE POLICY "Session users can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Session users can delete attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments');
