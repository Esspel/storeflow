-- Idempotent: skapar bara om saknas
CREATE TABLE IF NOT EXISTS public.store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  pos_x_cm integer NOT NULL DEFAULT 0,
  pos_y_cm integer NOT NULL DEFAULT 0,
  width_cm integer NOT NULL DEFAULT 80,
  height_cm integer NOT NULL DEFAULT 200,
  depth_cm integer NOT NULL DEFAULT 60,
  section_type text NOT NULL DEFAULT 'shelf',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_sections_store_id ON public.store_sections(store_id);

ALTER TABLE public.store_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_sections_select ON public.store_sections;
CREATE POLICY store_sections_select ON public.store_sections
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS store_sections_modify ON public.store_sections;
CREATE POLICY store_sections_modify ON public.store_sections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
