/*
  Migration: Add index on products for faster lookups by sap_article_id
*/
CREATE INDEX IF NOT EXISTS idx_products_sap_article_id
  ON public.products (sap_article_id);