/*
  Migration: Add index on product_shelf_life for faster shelf life lookups
  (sap_article_id, store_id) to speed up reclamation matching.
*/
CREATE INDEX IF NOT EXISTS idx_product_shelf_life_sap_article_store
  ON public.product_shelf_life (sap_article_id, store_id);