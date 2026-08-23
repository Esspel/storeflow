-- Planogram system migration

ALTER TABLE public.shelf_planograms
  ADD COLUMN IF NOT EXISTS shelf_marker_id text;

ALTER TABLE public.shelf_planograms
  ADD COLUMN IF NOT EXISTS expected_products jsonb
    NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.shelf_planograms
  ADD COLUMN IF NOT EXISTS version integer
    NOT NULL DEFAULT 1;

ALTER TABLE public.shelf_planograms
  ADD COLUMN IF NOT EXISTS is_active boolean
    NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_shelf_planograms_store
  ON public.shelf_planograms(store_id);

CREATE INDEX IF NOT EXISTS idx_shelf_planograms_active
  ON public.shelf_planograms(store_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shelf_planograms_marker
  ON public.shelf_planograms(shelf_marker_id);

CREATE INDEX IF NOT EXISTS idx_shelf_planograms_products
  ON public.shelf_planograms
  USING gin(expected_products);

CREATE TABLE IF NOT EXISTS public.planogram_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planogram_id uuid NOT NULL
    REFERENCES public.shelf_planograms(id)
    ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  file_size_bytes bigint,
  uploaded_by uuid
    REFERENCES public.app_users(id)
    ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planogram_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planogram_pdfs_select"
  ON public.planogram_pdfs;

CREATE POLICY "planogram_pdfs_select"
ON public.planogram_pdfs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.shelf_planograms sp
    WHERE sp.id = planogram_pdfs.planogram_id
      AND (
        sp.store_id = (
          SELECT store_id
          FROM public.app_users
          WHERE id = auth.uid()
        )
        OR sp.store_id = (
          SELECT active_store_id
          FROM public.app_users
          WHERE id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.app_users
          WHERE id = auth.uid()
            AND role = 'admin'
        )
      )
  )
);

CREATE INDEX IF NOT EXISTS idx_planogram_pdfs_planogram
  ON public.planogram_pdfs(planogram_id);

COMMENT ON COLUMN public.shelf_planograms.expected_products
IS 'JSONB representation of products, shelf positions, facings and quantities parsed from the planogram PDF';

COMMENT ON COLUMN public.shelf_planograms.pdf_storage_path
IS 'Path to original PDF in Supabase Storage';

COMMENT ON COLUMN public.shelf_planograms.shelf_marker_id
IS 'Identifier of the physical shelf/spatial marker associated with this planogram';
