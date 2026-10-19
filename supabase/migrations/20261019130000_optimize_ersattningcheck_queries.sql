/* 
  Optimering av ersättningscheck (replacement check).
  - täckande index på reclamations för store-scoped lookups.
  - index på store_product_deliveries(store_id, arrival_date DESC).
  - index på products(sap_article_id, store_id) för join matching.
*/

-- Index för reclamations-statistik (EXISTS/IN på store_id + sap_article_id).
CREATE INDEX IF NOT EXISTS idx_reclamations_store_sap
  ON public.reclamations (store_id, sap_article_id, status);

-- Index för leverans-hämtning per artikel (fallback bnr).
CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_store_sap_arrival
  ON public.store_product_deliveries (store_id, sap_article_id, arrival_date DESC);

-- Index för produkt-matchning i SAP-import (matcha sap_article_id, fallback bnr).
CREATE INDEX IF NOT EXISTS idx_products_sap_store
  ON public.products (sap_article_id, store_id);

-- Index för product_shelf_life uppslag (gästgivare).
CREATE INDEX IF NOT EXISTS idx_pl_shelf_life_store_sap
  ON public.product_shelf_life (store_id, sap_article_id, next_sap_check);
