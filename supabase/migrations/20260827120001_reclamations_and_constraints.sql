-- Säkerställ unique constraint på products(ean) för onConflict
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_ean_unique'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ean_unique UNIQUE (ean);
  END IF;
END $$;

-- reclamations-tabell
CREATE TABLE IF NOT EXISTS public.reclamations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sap_article_id text NOT NULL,
  status text NOT NULL DEFAULT 'Ej skickad',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reclamations_store_id ON public.reclamations(store_id);

ALTER TABLE public.reclamations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reclamations_select ON public.reclamations;
CREATE POLICY reclamations_select ON public.reclamations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reclamations_modify ON public.reclamations;
CREATE POLICY reclamations_modify ON public.reclamations
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- product_reclamation_stats (enkel tabell för MVP)
CREATE TABLE IF NOT EXISTS public.product_reclamation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sap_article_id text NOT NULL,
  name text,
  ean text,
  bnr text,
  delivery_count integer NOT NULL DEFAULT 0,
  reclamation_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prs_store ON public.product_reclamation_stats(store_id);

ALTER TABLE public.product_reclamation_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prs_select ON public.product_reclamation_stats;
CREATE POLICY prs_select ON public.product_reclamation_stats
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS prs_modify ON public.product_reclamation_stats;
CREATE POLICY prs_modify ON public.product_reclamation_stats
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
