CREATE TABLE IF NOT EXISTS public.products (
  material_nr text PRIMARY KEY,
  bnr text,
  ean text,
  varumarke text,
  produktnamn text NOT NULL,
  hallbarhetsdagar_tillverkning integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_ean ON public.products (ean);
CREATE INDEX IF NOT EXISTS idx_products_bnr ON public.products (bnr);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_read_all" ON public.products;
CREATE POLICY "products_read_all" ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS "products_write_authenticated" ON public.products;
CREATE POLICY "products_write_authenticated" ON public.products FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
