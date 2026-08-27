-- Säkerställ att spatial_maps har alla kolumner vi förväntar oss
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='spatial_maps'
                 AND column_name='markers') THEN
    ALTER TABLE public.spatial_maps ADD COLUMN markers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='spatial_maps'
                 AND column_name='is_active') THEN
    ALTER TABLE public.spatial_maps ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spatial_maps_store_active
  ON public.spatial_maps(store_id) WHERE is_active = true;

ALTER TABLE public.spatial_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spatial_maps_select ON public.spatial_maps;
CREATE POLICY spatial_maps_select ON public.spatial_maps
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS spatial_maps_modify ON public.spatial_maps;
CREATE POLICY spatial_maps_modify ON public.spatial_maps
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
