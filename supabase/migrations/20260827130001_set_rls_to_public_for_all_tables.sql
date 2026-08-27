-- Fix: byt från 'anon' till 'public' (kräver ingen session)
-- Gäller: store_sections, reclamations, product_reclamation_stats, spatial_maps, products

DROP POLICY IF EXISTS store_sections_select ON public.store_sections;
CREATE POLICY store_sections_select ON public.store_sections FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS store_sections_modify ON public.store_sections;
CREATE POLICY store_sections_modify ON public.store_sections FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS reclamations_select ON public.reclamations;
CREATE POLICY reclamations_select ON public.reclamations FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS reclamations_modify ON public.reclamations;
CREATE POLICY reclamations_modify ON public.reclamations FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS prs_select ON public.product_reclamation_stats;
CREATE POLICY prs_select ON public.product_reclamation_stats FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS prs_modify ON public.product_reclamation_stats;
CREATE POLICY prs_modify ON public.product_reclamation_stats FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS spatial_maps_select ON public.spatial_maps;
CREATE POLICY spatial_maps_select ON public.spatial_maps FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS spatial_maps_modify ON public.spatial_maps;
CREATE POLICY spatial_maps_modify ON public.spatial_maps FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS products_modify ON public.products;
CREATE POLICY products_modify ON public.products FOR ALL TO public USING (true) WITH CHECK (true);
