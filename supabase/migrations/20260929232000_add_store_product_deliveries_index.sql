/*
  Migration: Add composite index on store_product_deliveries for faster delivery lookups
  (store_id, sap_article_id, arrival_date DESC) to speed up reclamation matching and statistics.
*/
CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_sap_article_arrival
  ON public.store_product_deliveries (store_id, sap_article_id, arrival_date DESC);