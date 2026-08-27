-- Byt RLS-policies från 'authenticated' till 'anon' för de nya tabellerna.
-- Motivering: vi använder inte Supabase auth — klienten identifieras endast
-- via anon-nyckel + x-session-token. Migrationsfilen är idempotent
-- (DROP IF EXISTS, CREATE) och kräver att tidigare migrationer redan körts.

-- store_sections
DROP POLICY IF EXISTS store_sections_select ON public.store_sections;
CREATE POLICY store_sections_select ON public.store_sections
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS store_sections_modify ON public.store_sections;
CREATE POLICY store_sections_modify ON public.store_sections
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- reclamations
DROP POLICY IF EXISTS reclamations_select ON public.reclamations;
CREATE POLICY reclamations_select ON public.reclamations
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS reclamations_modify ON public.reclamations;
CREATE POLICY reclamations_modify ON public.reclamations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- product_reclamation_stats
DROP POLICY IF EXISTS prs_select ON public.product_reclamation_stats;
CREATE POLICY prs_select ON public.product_reclamation_stats
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS prs_modify ON public.product_reclamation_stats;
CREATE POLICY prs_modify ON public.product_reclamation_stats
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- spatial_maps
DROP POLICY IF EXISTS spatial_maps_select ON public.spatial_maps;
CREATE POLICY spatial_maps_select ON public.spatial_maps
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS spatial_maps_modify ON public.spatial_maps;
CREATE POLICY spatial_maps_modify ON public.spatial_maps
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- products (skapad i 20260823140000_create_products_table.sql, saknades i föregående fix)
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS products_modify ON public.products;
CREATE POLICY products_modify ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);
