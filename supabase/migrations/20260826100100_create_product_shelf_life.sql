-- Per-store, per-delivery shelf-life history. One row per delivery.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stores') THEN
    RAISE NOTICE 'stores table missing, skipping product_shelf_life';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_shelf_life (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  material_nr text NOT NULL,
  leveransnummer text,
  ordernummer text,
  orderrad text,
  leveransdag date NOT NULL,
  best_före_datum date NOT NULL,
  pallnummer text,
  beställningskvantitet numeric,
  pris_per_leveransenhet numeric,
  leveransstatus text,
  sann_vikt numeric,
  förväntad_kvantitet numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK added via DO block to be idempotent without requiring pre-existing tables
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stores') THEN
    BEGIN
      ALTER TABLE public.product_shelf_life ADD CONSTRAINT product_shelf_life_store_fk FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
    BEGIN
      ALTER TABLE public.product_shelf_life ADD CONSTRAINT product_shelf_life_product_fk FOREIGN KEY (material_nr) REFERENCES public.products(material_nr) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shelf_life_store_material ON public.product_shelf_life (store_id, material_nr);
CREATE INDEX IF NOT EXISTS idx_shelf_life_bestfore ON public.product_shelf_life (best_före_datum);

ALTER TABLE public.product_shelf_life ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shelf_life_all_authenticated" ON public.product_shelf_life;
CREATE POLICY "shelf_life_all_authenticated" ON public.product_shelf_life FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
